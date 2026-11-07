import type {
  Address,
  AdminCustomerDetail,
  AdminCustomerSummary,
  AdminOrder,
  AdminOrderDetail,
  AdminOverview,
  AdminProductDetail,
  AdminProductVariant,
  AdminUser,
  Category,
  CheckoutPreview,
  CheckoutSelection,
  HomeData,
  Order,
  OrderDetail,
  OrderItem,
  OrderStatusEvent,
  PaginatedProducts,
  Product360FrameCount,
  Product360Image,
  Product360Sequence,
  Product360Source,
  ProductDetail,
  ProductImage,
  ProductSize,
  ProductSummary,
  ProductVariant,
  PublicUser,
  SiteContent,
} from '../shared/types';
import { db } from './db';
import { getSeedManifest } from './manifest';
import type { z } from 'zod';
import type { adminCustomerQuerySchema, adminOrderQuerySchema, adminProductQuerySchema, productQuerySchema } from './validation';

type Row = Record<string, unknown>;
type ProductQuery = z.infer<typeof productQuerySchema>;
type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;
type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;
type AdminCustomerQuery = z.infer<typeof adminCustomerQuerySchema>;

const toBool = (value: unknown): boolean => Number(value) === 1;
const toNumber = (value: unknown): number => Number(value ?? 0);
const toStringOrNull = (value: unknown): string | null => (value == null ? null : String(value));

const PRODUCT_SELECT = `
  SELECT
    p.*,
    c.name AS category_name,
    c.slug AS category_slug,
    (SELECT pi.path FROM product_images pi
       WHERE pi.product_id = p.id AND pi.deleted_at IS NULL
       ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS primary_image,
    (SELECT pi.thumb_path FROM product_images pi
       WHERE pi.product_id = p.id AND pi.deleted_at IS NULL
       ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS primary_thumb,
    COALESCE((
      SELECT SUM(vi.stock) FROM variant_inventory vi
        JOIN product_variants pv ON pv.id = vi.variant_id AND pv.deleted_at IS NULL
        JOIN product_sizes ps ON ps.id = vi.size_id AND ps.deleted_at IS NULL
       WHERE pv.product_id = p.id
    ), 0) AS total_stock,
    (SELECT vi.variant_id FROM variant_inventory vi
       JOIN product_variants pv ON pv.id = vi.variant_id AND pv.deleted_at IS NULL
       JOIN product_sizes ps ON ps.id = vi.size_id AND ps.deleted_at IS NULL
      WHERE pv.product_id = p.id AND vi.stock > 0
      ORDER BY pv.sort_order ASC, ps.sort_order ASC, vi.id ASC LIMIT 1) AS default_variant_id,
    (SELECT vi.size_id FROM variant_inventory vi
       JOIN product_variants pv ON pv.id = vi.variant_id AND pv.deleted_at IS NULL
       JOIN product_sizes ps ON ps.id = vi.size_id AND ps.deleted_at IS NULL
      WHERE pv.product_id = p.id AND vi.stock > 0
      ORDER BY pv.sort_order ASC, ps.sort_order ASC, vi.id ASC LIMIT 1) AS default_size_id
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL
`;

const SORT_SQL: Record<ProductQuery['sort'], string> = {
  editorial: 'p.featured DESC, p.best_seller DESC, p.created_at DESC',
  newest: 'p.created_at DESC, p.id DESC',
  'price-low': 'p.price_paise ASC, p.id ASC',
  'price-high': 'p.price_paise DESC, p.id ASC',
  discount: 'p.discount_percent DESC, p.created_at DESC',
  name: 'p.name COLLATE NOCASE ASC',
};

export function rowToPublicUser(row: Row): PublicUser {
  return {
    id: toNumber(row.id),
    name: toStringOrNull(row.name),
    mobile: String(row.mobile),
    createdAt: toNumber(row.created_at),
  };
}

export function rowToAdminUser(row: Row): AdminUser {
  return {
    id: toNumber(row.id),
    username: String(row.username),
    createdAt: toNumber(row.created_at),
  };
}

export function rowToCategory(row: Row): Category {
  return {
    id: toNumber(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: toStringOrNull(row.description),
    imagePath: toStringOrNull(row.image_path),
    specialFilter: row.special_filter ? (String(row.special_filter) as Category['specialFilter']) : null,
    sortOrder: toNumber(row.sort_order),
    productCount: row.product_count == null ? undefined : toNumber(row.product_count),
  };
}

export function getCategories(): Category[] {
  const rows = db.prepare(`
    SELECT c.*,
      CASE
        WHEN c.special_filter = 'new_arrival' THEN (SELECT COUNT(*) FROM products p WHERE p.deleted_at IS NULL AND p.new_arrival = 1)
        WHEN c.special_filter = 'best_seller' THEN (SELECT COUNT(*) FROM products p WHERE p.deleted_at IS NULL AND p.best_seller = 1)
        ELSE (SELECT COUNT(*) FROM products p WHERE p.deleted_at IS NULL AND p.category_id = c.id)
      END AS product_count
    FROM categories c
    WHERE c.deleted_at IS NULL
    ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
  `).all() as Row[];
  return rows.map(rowToCategory);
}

export function rowToProductSummary(row: Row): ProductSummary {
  return {
    id: toNumber(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description ?? ''),
    categoryId: row.category_id == null ? null : toNumber(row.category_id),
    categoryName: String(row.category_name || 'Atelier'),
    categorySlug: toStringOrNull(row.category_slug),
    pricePaise: toNumber(row.price_paise),
    originalPricePaise: toNumber(row.original_price_paise),
    discountPercent: toNumber(row.discount_percent),
    primaryImage: toStringOrNull(row.primary_image),
    primaryThumb: toStringOrNull(row.primary_thumb),
    available: toBool(row.available),
    featured: toBool(row.featured),
    newArrival: toBool(row.new_arrival),
    bestSeller: toBool(row.best_seller),
    totalStock: toNumber(row.total_stock),
    defaultVariantId: row.default_variant_id == null ? null : toNumber(row.default_variant_id),
    defaultSizeId: row.default_size_id == null ? null : toNumber(row.default_size_id),
    createdAt: toNumber(row.created_at),
  };
}

function productWhere(query: ProductQuery): { sql: string; params: unknown[] } {
  const conditions = ['p.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (query.category) {
    const category = db
      .prepare('SELECT id, special_filter FROM categories WHERE slug = ? AND deleted_at IS NULL')
      .get(query.category) as Row | undefined;
    if (!category) {
      conditions.push('1 = 0');
    } else if (category.special_filter === 'new_arrival') {
      conditions.push('p.new_arrival = 1');
    } else if (category.special_filter === 'best_seller') {
      conditions.push('p.best_seller = 1');
    } else {
      conditions.push('p.category_id = ?');
      params.push(toNumber(category.id));
    }
  }
  if (query.collection === 'featured') conditions.push('p.featured = 1');
  if (query.collection === 'new') conditions.push('p.new_arrival = 1');
  if (query.collection === 'best') conditions.push('p.best_seller = 1');
  if (query.search) {
    conditions.push('(p.name LIKE ? OR p.description LIKE ? OR COALESCE(c.name, \'\') LIKE ?)');
    const term = `%${query.search}%`;
    params.push(term, term, term);
  }
  return { sql: conditions.join(' AND '), params };
}

export function getProducts(query: ProductQuery): PaginatedProducts {
  const { sql: where, params } = productWhere(query);
  const countRow = db
    .prepare(`SELECT COUNT(*) AS count FROM products p LEFT JOIN categories c ON c.id = p.category_id AND c.deleted_at IS NULL WHERE ${where}`)
    .get(...params) as Row;
  const total = toNumber(countRow.count);
  const pages = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(query.page, pages);
  const rows = db
    .prepare(`${PRODUCT_SELECT} WHERE ${where} ORDER BY ${SORT_SQL[query.sort]} LIMIT ? OFFSET ?`)
    .all(...params, query.limit, (page - 1) * query.limit) as Row[];
  return { products: rows.map(rowToProductSummary), total, page, pages, limit: query.limit };
}

export function getWishlistSummaries(customerId: number): ProductSummary[] {
  const rows = db
    .prepare(`
      ${PRODUCT_SELECT}
      JOIN wishlist_items w ON w.product_id = p.id AND w.deleted_at IS NULL
      WHERE w.customer_id = ? AND p.deleted_at IS NULL
      ORDER BY w.created_at DESC, w.id DESC
    `)
    .all(customerId) as Row[];
  return rows.map(rowToProductSummary);
}

export function getWishlistIds(customerId: number): number[] {
  const rows = db
    .prepare('SELECT product_id FROM wishlist_items WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
    .all(customerId) as Row[];
  return rows.map((row) => toNumber(row.product_id));
}

export function getAllProductSummaries(): ProductSummary[] {
  const rows = db
    .prepare(`${PRODUCT_SELECT} WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC, p.id DESC`)
    .all() as Row[];
  return rows.map(rowToProductSummary);
}

export function rowToProductImage(row: Row): ProductImage {
  return {
    id: toNumber(row.id),
    path: String(row.path),
    thumbPath: String(row.thumb_path),
    altText: toStringOrNull(row.alt_text),
    sortOrder: toNumber(row.sort_order),
  };
}

export function rowToProduct360Image(row: Row): Product360Image {
  return {
    id: toNumber(row.id),
    path: String(row.path),
    thumbPath: String(row.thumb_path),
    position: toNumber(row.position),
    width: row.width == null ? null : toNumber(row.width),
    height: row.height == null ? null : toNumber(row.height),
    bytes: row.bytes == null ? null : toNumber(row.bytes),
  };
}

export function getSpinSequences(productId: number): Map<number, Product360Sequence> {
  const sequenceRows = db
    .prepare('SELECT * FROM product_360_sequences WHERE product_id = ? AND deleted_at IS NULL')
    .all(productId) as Row[];
  const imageRows = db.prepare(`
    SELECT i.* FROM product_360_images i
    JOIN product_360_sequences s ON s.id = i.sequence_id
    WHERE s.product_id = ? AND s.deleted_at IS NULL AND i.deleted_at IS NULL
    ORDER BY i.sequence_id ASC, i.position ASC, i.id ASC
  `).all(productId) as Row[];
  const result = new Map<number, Product360Sequence>();
  for (const row of sequenceRows) {
    const sequenceId = toNumber(row.id);
    result.set(toNumber(row.variant_id), {
      id: sequenceId,
      productId,
      variantId: toNumber(row.variant_id),
      frameCount: toNumber(row.frame_count) as Product360FrameCount,
      source: String(row.source) as Product360Source,
      modelPath: toStringOrNull(row.model_path),
      modelMime: toStringOrNull(row.model_mime),
      images: imageRows
        .filter((image) => toNumber(image.sequence_id) === sequenceId)
        .map(rowToProduct360Image),
    });
  }
  return result;
}

export function getProductDetail(slug: string): ProductDetail | null {
  const row = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.deleted_at IS NULL`).get(slug) as Row | undefined;
  if (!row) return null;
  const summary = rowToProductSummary(row);
  const productId = summary.id;
  const variants = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC')
    .all(productId) as Row[];
  const sizes = db
    .prepare('SELECT * FROM product_sizes WHERE product_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC')
    .all(productId) as Row[];
  const imageRows = db
    .prepare('SELECT * FROM product_images WHERE product_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC')
    .all(productId) as Row[];
  const images = imageRows.map(rowToProductImage);
  const inventoryRows = db.prepare(`
    SELECT vi.variant_id, vi.size_id, vi.stock
    FROM variant_inventory vi
    JOIN product_variants pv ON pv.id = vi.variant_id AND pv.deleted_at IS NULL
    JOIN product_sizes ps ON ps.id = vi.size_id AND ps.deleted_at IS NULL
    WHERE pv.product_id = ?
  `).all(productId) as Row[];
  const inventory: Record<string, number> = {};
  for (const item of inventoryRows) inventory[`${toNumber(item.variant_id)}:${toNumber(item.size_id)}`] = toNumber(item.stock);
  const spinSequences = getSpinSequences(productId);
  const mappedVariants: ProductVariant[] = variants.map((variant, index) => ({
    id: toNumber(variant.id),
    name: String(variant.name),
    colorHex: String(variant.color_hex),
    sortOrder: toNumber(variant.sort_order ?? index),
    images: imageRows
      .filter((image) => toNumber(image.variant_id) === toNumber(variant.id))
      .map(rowToProductImage),
    spin: spinSequences.get(toNumber(variant.id)) ?? null,
  }));
  const mappedSizes: ProductSize[] = sizes.map((size, index) => ({
    id: toNumber(size.id),
    label: String(size.label),
    sortOrder: toNumber(size.sort_order ?? index),
  }));
  return { ...summary, variants: mappedVariants, sizes: mappedSizes, inventory, images };
}

export function getAdminProductDetail(productId: number): AdminProductDetail | null {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(productId) as Row | undefined;
  if (!product) return null;
  const sizes = db
    .prepare('SELECT * FROM product_sizes WHERE product_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC')
    .all(productId) as Row[];
  const variants = db
    .prepare('SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC')
    .all(productId) as Row[];
  const images = db
    .prepare('SELECT * FROM product_images WHERE product_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC')
    .all(productId) as Row[];
  const inventoryRows = db
    .prepare('SELECT variant_id, size_id, stock FROM variant_inventory')
    .all() as Row[];
  const inventory = new Map(inventoryRows.map((row) => [`${row.variant_id}:${row.size_id}`, toNumber(row.stock)]));
  const mappedSizes: ProductSize[] = sizes.map((size, index) => ({
    id: toNumber(size.id),
    label: String(size.label),
    sortOrder: toNumber(size.sort_order ?? index),
  }));
  const spinSequences = getSpinSequences(productId);
  const mappedVariants: AdminProductVariant[] = variants.map((variant, index) => {
    const id = toNumber(variant.id);
    return {
      id,
      name: String(variant.name),
      colorHex: String(variant.color_hex),
      sortOrder: toNumber(variant.sort_order ?? index),
      images: images.filter((image) => toNumber(image.variant_id) === id).map(rowToProductImage),
      stock: mappedSizes.map((size) => inventory.get(`${id}:${size.id}`) ?? 0),
      spin: spinSequences.get(id) ?? null,
    };
  });
  const primary = images[0];
  return {
    id: toNumber(product.id),
    slug: String(product.slug),
    name: String(product.name),
    description: String(product.description ?? ''),
    categoryId: product.category_id == null ? null : toNumber(product.category_id),
    pricePaise: toNumber(product.price_paise),
    originalPricePaise: toNumber(product.original_price_paise),
    available: toBool(product.available),
    featured: toBool(product.featured),
    newArrival: toBool(product.new_arrival),
    bestSeller: toBool(product.best_seller),
    sizes: mappedSizes,
    variants: mappedVariants,
    primaryImage: primary ? String(primary.path) : null,
  };
}

export function getAdminProducts(query: AdminProductQuery): ProductSummary[] {
  let products = getAllProductSummaries();
  const search = query.search?.toLowerCase();
  if (search) {
    products = products.filter((product) =>
      product.name.toLowerCase().includes(search) || product.slug.toLowerCase().includes(search) || product.description.toLowerCase().includes(search),
    );
  }
  if (query.category) products = products.filter((product) => product.categoryId === query.category);
  if (query.stock === 'low') products = products.filter((product) => product.totalStock > 0 && product.totalStock <= 12);
  if (query.stock === 'out') products = products.filter((product) => product.totalStock === 0);
  return products.slice(0, query.limit);
}

export function getSiteContent(): SiteContent {
  const manifest = getSeedManifest();
  return { editorial: manifest.editorial, categories: getCategories() };
}

export function getHomeData(): HomeData {
  const base = { page: 1, limit: 8, sort: 'editorial' as const };
  const [featured, newArrivals, bestSellers] = [
    getProducts({ ...base, collection: 'featured' }).products,
    getProducts({ ...base, collection: 'new', sort: 'newest' }).products,
    getProducts({ ...base, collection: 'best' }).products,
  ];
  return { ...getSiteContent(), featured, newArrivals, bestSellers };
}

export interface CheckoutSource {
  productId: number;
  productSlug: string;
  productName: string;
  pricePaise: number;
  originalPricePaise: number;
  discountPercent: number;
  available: boolean;
  imagePath: string | null;
  variantId: number;
  variantName: string;
  colorHex: string;
  sizeId: number;
  sizeLabel: string;
  stock: number;
}

export function getCheckoutSource(selection: CheckoutSelection): CheckoutSource | null {
  const row = db.prepare(`
    SELECT
      p.id AS product_id, p.slug AS product_slug, p.name AS product_name,
      p.price_paise, p.original_price_paise, p.discount_percent, p.available,
      pv.id AS variant_id, pv.name AS variant_name, pv.color_hex,
      ps.id AS size_id, ps.label AS size_label,
      COALESCE(vi.stock, 0) AS stock,
      (SELECT pi.path FROM product_images pi
         WHERE pi.variant_id = pv.id AND pi.deleted_at IS NULL
         ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1) AS image_path
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
    JOIN product_sizes ps ON ps.product_id = p.id AND ps.deleted_at IS NULL
    LEFT JOIN variant_inventory vi ON vi.variant_id = pv.id AND vi.size_id = ps.id
    WHERE p.slug = ? AND p.deleted_at IS NULL AND pv.id = ? AND ps.id = ?
  `).get(selection.productSlug, selection.variantId, selection.sizeId) as Row | undefined;
  if (!row) return null;
  return {
    productId: toNumber(row.product_id),
    productSlug: String(row.product_slug),
    productName: String(row.product_name),
    pricePaise: toNumber(row.price_paise),
    originalPricePaise: toNumber(row.original_price_paise),
    discountPercent: toNumber(row.discount_percent),
    available: toBool(row.available),
    imagePath: toStringOrNull(row.image_path),
    variantId: toNumber(row.variant_id),
    variantName: String(row.variant_name),
    colorHex: String(row.color_hex),
    sizeId: toNumber(row.size_id),
    sizeLabel: String(row.size_label),
    stock: toNumber(row.stock),
  };
}

export function toCheckoutPreview(source: CheckoutSource, quantity: number): CheckoutPreview {
  const subtotalPaise = source.pricePaise * quantity;
  return {
    product: {
      id: source.productId,
      slug: source.productSlug,
      name: source.productName,
      image: source.imagePath,
      pricePaise: source.pricePaise,
      originalPricePaise: source.originalPricePaise,
      discountPercent: source.discountPercent,
      available: source.available,
    },
    variant: { id: source.variantId, name: source.variantName, colorHex: source.colorHex },
    size: { id: source.sizeId, label: source.sizeLabel },
    quantity,
    maxQuantity: Math.min(5, source.stock),
    subtotalPaise,
    deliveryPaise: 0,
    totalPaise: subtotalPaise,
    paymentMethod: 'COD',
  };
}

export function rowToAddress(row: Row): Address {
  return {
    id: toNumber(row.id),
    label: String(row.label),
    fullName: String(row.full_name),
    mobile: String(row.mobile),
    line1: String(row.line1),
    line2: String(row.line2 ?? ''),
    city: String(row.city),
    state: String(row.state),
    pincode: String(row.pincode),
    isDefault: toBool(row.is_default),
    createdAt: toNumber(row.created_at),
  };
}

export function getAddresses(customerId: number): Address[] {
  const rows = db
    .prepare('SELECT * FROM addresses WHERE customer_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, created_at DESC')
    .all(customerId) as Row[];
  return rows.map(rowToAddress);
}

export function rowToOrder(row: Row): Order {
  return {
    id: String(row.id),
    status: String(row.status) as Order['status'],
    customerName: String(row.customer_name),
    mobile: String(row.mobile),
    line1: String(row.line1),
    line2: String(row.line2 ?? ''),
    city: String(row.city),
    state: String(row.state),
    pincode: String(row.pincode),
    subtotalPaise: toNumber(row.subtotal_paise),
    deliveryPaise: toNumber(row.delivery_paise),
    totalPaise: toNumber(row.total_paise),
    paymentMethod: 'COD',
    createdAt: toNumber(row.created_at),
    updatedAt: toNumber(row.updated_at),
  };
}

export function rowToOrderItem(row: Row): OrderItem {
  return {
    id: toNumber(row.id),
    productId: row.product_id == null ? null : toNumber(row.product_id),
    productName: String(row.product_name),
    variantName: String(row.variant_name),
    sizeLabel: String(row.size_label),
    imagePath: toStringOrNull(row.image_path),
    quantity: toNumber(row.quantity),
    unitPricePaise: toNumber(row.unit_price_paise),
    discountPercent: toNumber(row.discount_percent),
    lineTotalPaise: toNumber(row.line_total_paise),
  };
}

export function rowToStatusEvent(row: Row): OrderStatusEvent {
  return {
    id: toNumber(row.id),
    status: String(row.status) as OrderStatusEvent['status'],
    note: toStringOrNull(row.note),
    createdAt: toNumber(row.created_at),
  };
}

export function getOrderDetail(orderId: string, customerId?: number): OrderDetail | null {
  const row = customerId
    ? (db.prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ?').get(orderId, customerId) as Row | undefined)
    : (db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Row | undefined);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC').all(orderId) as Row[];
  const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC, id ASC').all(orderId) as Row[];
  return {
    ...rowToOrder(row),
    items: items.map(rowToOrderItem),
    history: history.map(rowToStatusEvent),
  };
}

export function getCustomerOrders(customerId: number): Order[] {
  const rows = db
    .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC')
    .all(customerId) as Row[];
  return rows.map(rowToOrder);
}

export function rowToAdminOrder(row: Row): AdminOrder {
  return {
    ...rowToOrder(row),
    customerId: row.customer_id == null ? null : toNumber(row.customer_id),
    customerMobile: toStringOrNull(row.customer_mobile),
    itemCount: toNumber(row.item_count),
  };
}

export function getAdminOrders(query: AdminOrderQuery): AdminOrder[] {
  const conditions = ['1 = 1'];
  const params: unknown[] = [];
  if (query.status) {
    conditions.push('o.status = ?');
    params.push(query.status);
  }
  if (query.search) {
    conditions.push('(o.id LIKE ? OR o.customer_name LIKE ? OR o.mobile LIKE ? OR COALESCE(c.mobile, \'\') LIKE ?)');
    const term = `%${query.search}%`;
    params.push(term, term, term, term);
  }
  const rows = db.prepare(`
    SELECT o.*, c.mobile AS customer_mobile,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC
    LIMIT ?
  `).all(...params, query.limit) as Row[];
  return rows.map(rowToAdminOrder);
}

export function getAdminOrderDetail(orderId: string): AdminOrderDetail | null {
  const detail = getOrderDetail(orderId);
  if (!detail) return null;
  const row = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(orderId) as Row | undefined;
  return { ...detail, customerId: row?.customer_id == null ? null : toNumber(row.customer_id) };
}

export function getAdminCustomerSummaries(query: AdminCustomerQuery): AdminCustomerSummary[] {
  const conditions = ['1 = 1'];
  const params: unknown[] = [];
  if (query.search) {
    conditions.push('(c.mobile LIKE ? OR COALESCE(c.name, \'\') LIKE ?)');
    const term = `%${query.search}%`;
    params.push(term, term);
  }
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
      (SELECT COALESCE(SUM(o.total_paise), 0) FROM orders o WHERE o.customer_id = c.id AND o.status != 'Cancelled') AS total_spent_paise,
      (SELECT COUNT(*) FROM addresses a WHERE a.customer_id = c.id AND a.deleted_at IS NULL) AS address_count
    FROM customers c
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(...params, query.limit) as Row[];
  return rows.map((row) => ({
    id: toNumber(row.id),
    name: toStringOrNull(row.name),
    mobile: String(row.mobile),
    createdAt: toNumber(row.created_at),
    orderCount: toNumber(row.order_count),
    totalSpentPaise: toNumber(row.total_spent_paise),
    addressCount: toNumber(row.address_count),
  }));
}

export function getAdminCustomerDetail(customerId: number): AdminCustomerDetail | null {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as Row | undefined;
  if (!row) return null;
  return {
    customer: rowToPublicUser(row),
    addresses: getAddresses(customerId),
    orders: getCustomerOrders(customerId),
  };
}

export function getAdminOverview(): AdminOverview {
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders) AS orders,
      (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) AS products,
      (SELECT COUNT(*) FROM customers) AS customers,
      (SELECT COALESCE(SUM(total_paise), 0) FROM orders WHERE status != 'Cancelled') AS sales_paise,
      (SELECT COUNT(*) FROM orders WHERE status NOT IN ('Delivered','Cancelled')) AS pending_orders,
      (SELECT COUNT(*) FROM variant_inventory vi
         JOIN product_variants pv ON pv.id = vi.variant_id AND pv.deleted_at IS NULL
         JOIN product_sizes ps ON ps.id = vi.size_id AND ps.deleted_at IS NULL
         JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
        WHERE vi.stock <= 3 AND p.available = 1) AS low_stock_skus
  `).get() as Row;
  const recentRows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8').all() as Row[];
  const alerts = db.prepare(`
    SELECT p.id AS product_id, p.name AS product_name, p.slug,
      (SELECT pi.path FROM product_images pi WHERE pi.product_id = p.id AND pi.deleted_at IS NULL ORDER BY pi.sort_order, pi.id LIMIT 1) AS image_path,
      MIN(vi.stock) AS lowest_stock
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id AND pv.deleted_at IS NULL
    JOIN product_sizes ps ON ps.product_id = p.id AND ps.deleted_at IS NULL
    JOIN variant_inventory vi ON vi.variant_id = pv.id AND vi.size_id = ps.id
    WHERE p.deleted_at IS NULL AND p.available = 1
    GROUP BY p.id
    HAVING MIN(vi.stock) <= 3
    ORDER BY lowest_stock ASC, p.name COLLATE NOCASE ASC
    LIMIT 8
  `).all() as Row[];
  return {
    totals: {
      orders: toNumber(totals.orders),
      products: toNumber(totals.products),
      customers: toNumber(totals.customers),
      salesPaise: toNumber(totals.sales_paise),
      pendingOrders: toNumber(totals.pending_orders),
      lowStockSkus: toNumber(totals.low_stock_skus),
    },
    recentOrders: recentRows.map(rowToOrder),
    stockAlerts: alerts.map((row) => ({
      productId: toNumber(row.product_id),
      productName: String(row.product_name),
      slug: String(row.slug),
      imagePath: toStringOrNull(row.image_path),
      lowestStock: toNumber(row.lowest_stock),
    })),
  };
}
