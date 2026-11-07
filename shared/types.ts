export const ORDER_STATUSES = [
  'Order Placed',
  'Order Confirmed',
  'Packed',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface PublicUser {
  id: number;
  name: string | null;
  mobile: string;
  createdAt: number;
}

export interface AdminUser {
  id: number;
  username: string;
  createdAt: number;
}

export interface SessionResponse {
  customer: PublicUser | null;
  admin: AdminUser | null;
  adminConfigured: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imagePath: string | null;
  specialFilter: 'new_arrival' | 'best_seller' | null;
  sortOrder: number;
  productCount?: number;
}

export interface ProductImage {
  id: number;
  path: string;
  thumbPath: string;
  altText: string | null;
  sortOrder: number;
}

export type Product360FrameCount = 8 | 12 | 16 | 24 | 36;
export type Product360Source = 'seed_derived' | 'admin_upload';

export interface Product360Image {
  id: number;
  path: string;
  thumbPath: string;
  position: number;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

export interface Product360Sequence {
  id: number;
  productId: number;
  variantId: number;
  frameCount: Product360FrameCount;
  source: Product360Source;
  modelPath: string | null;
  modelMime: string | null;
  images: Product360Image[];
}

export interface Product360FormPayload {
  frameCount: Product360FrameCount;
  existingImages: Array<Pick<Product360Image, 'id' | 'path' | 'thumbPath'>>;
  existingModelPath?: string | null;
  removeModel?: boolean;
  clearSequence?: boolean;
}

export interface ProductVariant {
  id: number;
  name: string;
  colorHex: string;
  sortOrder: number;
  images: ProductImage[];
  spin: Product360Sequence | null;
}

export interface WishlistResponse {
  productIds: number[];
  products: ProductSummary[];
}

export interface WishlistMutationResponse {
  ok: boolean;
  wished: boolean;
  productIds: number[];
  count: number;
}

export interface ProductSize {
  id: number;
  label: string;
  sortOrder: number;
}

export interface ProductSummary {
  id: number;
  slug: string;
  name: string;
  description: string;
  categoryId: number | null;
  categoryName: string;
  categorySlug: string | null;
  pricePaise: number;
  originalPricePaise: number;
  discountPercent: number;
  primaryImage: string | null;
  primaryThumb: string | null;
  available: boolean;
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  totalStock: number;
  defaultVariantId: number | null;
  defaultSizeId: number | null;
  createdAt: number;
}

export interface ProductDetail extends ProductSummary {
  variants: ProductVariant[];
  sizes: ProductSize[];
  /** Key: `${variantId}:${sizeId}` */
  inventory: Record<string, number>;
  images: ProductImage[];
}

export interface PaginatedProducts {
  products: ProductSummary[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface EditorialMedia {
  hero: string;
  heroPoster: string;
  campaign: string;
  collectionOne: string;
  collectionTwo: string;
  promotion: string;
  quote: string;
}

export interface SiteContent {
  editorial: EditorialMedia;
  categories: Category[];
}

export interface HomeData extends SiteContent {
  featured: ProductSummary[];
  newArrivals: ProductSummary[];
  bestSellers: ProductSummary[];
}

export interface Address {
  id: number;
  label: string;
  fullName: string;
  mobile: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt: number;
}

export interface CheckoutSelection {
  productSlug: string;
  variantId: number;
  sizeId: number;
  quantity: number;
}

export interface CheckoutPreview {
  product: {
    id: number;
    slug: string;
    name: string;
    image: string | null;
    pricePaise: number;
    originalPricePaise: number;
    discountPercent: number;
    available: boolean;
  };
  variant: { id: number; name: string; colorHex: string };
  size: { id: number; label: string };
  quantity: number;
  maxQuantity: number;
  subtotalPaise: number;
  deliveryPaise: 0;
  totalPaise: number;
  paymentMethod: 'COD';
}

export interface OrderItem {
  id: number;
  productId: number | null;
  productName: string;
  variantName: string;
  sizeLabel: string;
  imagePath: string | null;
  quantity: number;
  unitPricePaise: number;
  discountPercent: number;
  lineTotalPaise: number;
}

export interface OrderStatusEvent {
  id: number;
  status: OrderStatus;
  note: string | null;
  createdAt: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  customerName: string;
  mobile: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  subtotalPaise: number;
  deliveryPaise: number;
  totalPaise: number;
  paymentMethod: 'COD';
  createdAt: number;
  updatedAt: number;
}

export interface OrderDetail extends Order {
  items: OrderItem[];
  history: OrderStatusEvent[];
}

export interface AdminOverview {
  totals: {
    orders: number;
    products: number;
    customers: number;
    salesPaise: number;
    pendingOrders: number;
    lowStockSkus: number;
  };
  recentOrders: Order[];
  stockAlerts: Array<{
    productId: number;
    productName: string;
    slug: string;
    imagePath: string | null;
    lowestStock: number;
  }>;
}

export interface AdminProductVariant extends ProductVariant {
  stock: number[];
}

export interface AdminProductDetail {
  id: number;
  slug: string;
  name: string;
  description: string;
  categoryId: number | null;
  pricePaise: number;
  originalPricePaise: number;
  available: boolean;
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  sizes: ProductSize[];
  variants: AdminProductVariant[];
  primaryImage: string | null;
}

export interface AdminCustomerSummary {
  id: number;
  name: string | null;
  mobile: string;
  createdAt: number;
  orderCount: number;
  totalSpentPaise: number;
  addressCount: number;
}

export interface AdminCustomerDetail {
  customer: PublicUser;
  addresses: Address[];
  orders: Order[];
}

export interface AdminOrder extends Order {
  customerId: number | null;
  customerMobile: string | null;
  itemCount: number;
}

export interface AdminOrderDetail extends OrderDetail {
  customerId: number | null;
}

export interface ProductFormPayload {
  id?: number;
  name: string;
  slug?: string;
  description: string;
  categoryId: number | null;
  pricePaise: number;
  originalPricePaise: number;
  available: boolean;
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  sizes: Array<{ id?: number; label: string }>;
  variants: Array<{
    id?: number;
    name: string;
    colorHex: string;
    existingImages: Array<Pick<ProductImage, 'id' | 'path' | 'thumbPath'>>;
    stock: number[];
    spin?: Product360FormPayload;
  }>;
}

export interface SeedColor {
  name: string;
  slug: string;
  hex: string;
  images: Array<{ path: string; thumbPath: string }>;
}

export interface SeedManifest {
  editorial: EditorialMedia;
  categoryImages: Record<string, string>;
  products: Record<string, { colors: SeedColor[] }>;
}
