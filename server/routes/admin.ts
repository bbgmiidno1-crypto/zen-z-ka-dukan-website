import { Router, type Request } from 'express';
import { config } from '../config';
import { hashSecret, randomToken, safeEqualText, slugify, verifySecret } from '../crypto';
import { db } from '../db';
import {
  authLimiter,
  createSession,
  HttpError,
  requireAdmin,
  revokeSession,
  wrap,
} from '../http';
import { updateOrderStatus } from '../order-service';
import { persistProduct, softDeleteProduct, uniqueSlug } from '../product-service';
import {
  getAdminCustomerDetail,
  getAdminCustomerSummaries,
  getAdminOrderDetail,
  getAdminOrders,
  getAdminOverview,
  getAdminProductDetail,
  getAdminProducts,
  getCategories,
  rowToAdminUser,
  rowToCategory,
} from '../serializers';
import { deleteStoredImages, saveOptimizedImage, upload } from '../uploads';
import {
  adminCustomerQuerySchema,
  adminLoginSchema,
  adminOrderQuerySchema,
  adminProductQuerySchema,
  adminSetupSchema,
  categoryFormSchema,
  parseIdParam,
  parseJsonField,
  productFlagsSchema,
  productFormSchema,
  statusUpdateSchema,
  stockUpdateSchema,
} from '../validation';

type Row = Record<string, unknown>;

export const adminRouter = Router();
const DUMMY_ADMIN_HASH = hashSecret(randomToken(24));
const PREVIEW_ADMIN_SESSION_MS = 30 * 60 * 1000;

function wantsPreviewMemorySession(req: Request): boolean {
  const mode = req.get('x-zzkd-admin-session-mode');
  if (!mode) return false;
  if (!config.previewAdminHeaderSession || mode !== 'memory' || req.get('sec-fetch-site') !== 'same-origin') {
    throw new HttpError(403, 'Preview session mode is unavailable.', 'preview_session_unavailable');
  }
  // The proxy may not forward X-Forwarded-Proto. Check the browser's Origin and
  // allow plain HTTP only on loopback for local automated tests/development.
  try {
    const origin = new URL(req.get('origin') || '');
    const loopback = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1' || origin.hostname === '[::1]';
    if (origin.protocol === 'https:' || (origin.protocol === 'http:' && loopback)) return true;
  } catch {
    // Denied below.
  }
  throw new HttpError(403, 'Preview sign-in requires a secure browser context.', 'preview_session_requires_https');
}

adminRouter.post('/setup', authLimiter(5), wrap((req, res) => {
  const input = adminSetupSchema.parse(req.body);
  if (!safeEqualText(input.bootstrapToken, config.adminBootstrapToken)) {
    throw new HttpError(401, 'The private setup token is incorrect.', 'invalid_bootstrap_token');
  }
  const passwordHash = hashSecret(input.password);
  const now = Date.now();
  const transaction = db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM admins').get() as Row;
    if (Number(count.count) > 0) {
      throw new HttpError(409, 'Administrator access has already been configured.', 'admin_exists');
    }
    const existing = db.prepare('SELECT id FROM admins WHERE username = ? COLLATE NOCASE').get(input.username);
    if (existing) throw new HttpError(409, 'Choose another administrator username.', 'username_taken');
    const result = db.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)').run(
      input.username,
      passwordHash,
      now,
    );
    return Number(result.lastInsertRowid);
  });
  const adminId = transaction.immediate();
  createSession(req, res, 'admin', adminId);
  const row = db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId) as Row;
  res.status(201).json({
    admin: rowToAdminUser(row),
    ...(config.previewAdminHeaderSession ? { previewHeaderAvailable: true } : {}),
  });
}));

adminRouter.post('/login', authLimiter(), wrap((req, res) => {
  const input = adminLoginSchema.parse(req.body);
  const memorySession = wantsPreviewMemorySession(req);
  const row = db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE').get(input.username) as Row | undefined;
  const valid = verifySecret(input.password, row ? String(row.password_hash) : DUMMY_ADMIN_HASH);
  if (!row || !valid) {
    throw new HttpError(401, 'Administrator credentials are incorrect.', 'invalid_credentials');
  }
  const token = createSession(req, res, 'admin', Number(row.id), memorySession ? PREVIEW_ADMIN_SESSION_MS : undefined);
  res.json({
    admin: rowToAdminUser(row),
    ...(config.previewAdminHeaderSession ? { previewHeaderAvailable: true } : {}),
    ...(memorySession ? { previewSessionToken: token } : {}),
  });
}));

adminRouter.post('/logout', wrap((req, res) => {
  revokeSession(req, res, 'admin');
  res.json({ ok: true });
}));

// Every route below requires a valid server-side administrator session.
adminRouter.use(requireAdmin);

adminRouter.get('/overview', wrap((_req, res) => {
  res.json(getAdminOverview());
}));

adminRouter.get('/products', wrap((req, res) => {
  const query = adminProductQuerySchema.parse(req.query);
  res.json({ products: getAdminProducts(query), categories: getCategories() });
}));

adminRouter.get('/products/:id', wrap((req, res) => {
  const product = getAdminProductDetail(parseIdParam(req.params.id, 'product ID'));
  if (!product) throw new HttpError(404, 'Product not found.', 'product_not_found');
  res.json({ product });
}));

adminRouter.post('/products', upload.any(), wrap(async (req, res) => {
  const payload = parseJsonField(req.body.payload, productFormSchema);
  const files = (req.files || []) as Express.Multer.File[];
  const result = await persistProduct(payload, files);
  res.status(201).json({ product: result.product, warnings: result.warnings });
}));

adminRouter.put('/products/:id', upload.any(), wrap(async (req, res) => {
  const id = parseIdParam(req.params.id, 'product ID');
  const payload = parseJsonField(req.body.payload, productFormSchema);
  if (payload.id && payload.id !== id) {
    throw new HttpError(400, 'Product ID in the form does not match the selected product.', 'product_id_mismatch');
  }
  const files = (req.files || []) as Express.Multer.File[];
  const result = await persistProduct(payload, files, id);
  res.json({ product: result.product, warnings: result.warnings });
}));

adminRouter.patch('/products/:id/flags', wrap((req, res) => {
  const id = parseIdParam(req.params.id, 'product ID');
  const flags = productFlagsSchema.parse(req.body);
  const existing = db.prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) throw new HttpError(404, 'Product not found.', 'product_not_found');
  const fields: string[] = [];
  const params: unknown[] = [];
  const map: Array<[keyof typeof flags, string]> = [
    ['featured', 'featured'],
    ['newArrival', 'new_arrival'],
    ['bestSeller', 'best_seller'],
    ['available', 'available'],
  ];
  for (const [key, column] of map) {
    if (flags[key] !== undefined) {
      fields.push(`${column} = ?`);
      params.push(flags[key] ? 1 : 0);
    }
  }
  fields.push('updated_at = ?');
  params.push(Date.now(), id);
  db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ product: getAdminProductDetail(id) });
}));

adminRouter.patch('/inventory', wrap((req, res) => {
  const input = stockUpdateSchema.parse(req.body);
  const valid = db.prepare(`
    SELECT pv.id FROM product_variants pv
    JOIN products p ON p.id = pv.product_id AND p.deleted_at IS NULL
    JOIN product_sizes ps ON ps.product_id = pv.product_id AND ps.id = ? AND ps.deleted_at IS NULL
    WHERE pv.id = ? AND pv.deleted_at IS NULL
  `).get(input.sizeId, input.variantId);
  if (!valid) throw new HttpError(400, 'This colour and size combination is invalid.', 'invalid_inventory');
  db.prepare(`
    INSERT INTO variant_inventory (variant_id, size_id, stock) VALUES (?, ?, ?)
    ON CONFLICT(variant_id, size_id) DO UPDATE SET stock = excluded.stock
  `).run(input.variantId, input.sizeId, input.stock);
  res.json({ ok: true });
}));

adminRouter.delete('/products/:id', wrap((req, res) => {
  softDeleteProduct(parseIdParam(req.params.id, 'product ID'));
  res.json({ ok: true });
}));

adminRouter.get('/categories', wrap((_req, res) => {
  res.json({ categories: getCategories() });
}));

adminRouter.post('/categories', upload.single('image'), wrap(async (req, res) => {
  const input = parseJsonField(req.body.payload, categoryFormSchema);
  const file = req.file as Express.Multer.File | undefined;
  const stored = file ? await saveOptimizedImage(file, 'categories', slugify(input.name)) : null;
  try {
    const transaction = db.transaction(() => {
      const now = Date.now();
      const slug = uniqueSlug('categories', input.slug || slugify(input.name));
      const result = db.prepare(`
        INSERT INTO categories (name, slug, description, image_path, special_filter, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.name,
        slug,
        input.description,
        stored?.path ?? input.imagePath ?? null,
        input.specialFilter ?? null,
        input.sortOrder,
        now,
        now,
      );
      return Number(result.lastInsertRowid);
    });
    const id = transaction.immediate();
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Row;
    res.status(201).json({ category: rowToCategory(row) });
  } catch (error) {
    if (stored) await deleteStoredImages([stored.path, stored.thumbPath]);
    throw error;
  }
}));

adminRouter.put('/categories/:id', upload.single('image'), wrap(async (req, res) => {
  const id = parseIdParam(req.params.id, 'category ID');
  const input = parseJsonField(req.body.payload, categoryFormSchema);
  const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL').get(id) as Row | undefined;
  if (!existing) throw new HttpError(404, 'Category not found.', 'category_not_found');
  const file = req.file as Express.Multer.File | undefined;
  const stored = file ? await saveOptimizedImage(file, 'categories', slugify(input.name)) : null;
  try {
    const imagePath = stored?.path ?? (input.imagePath === undefined ? existing.image_path : input.imagePath);
    const specialFilter = input.specialFilter === undefined ? existing.special_filter : input.specialFilter;
    const slug = uniqueSlug('categories', input.slug || slugify(input.name), id);
    db.prepare(`
      UPDATE categories SET name = ?, slug = ?, description = ?, image_path = ?,
        special_filter = ?, sort_order = ?, updated_at = ? WHERE id = ?
    `).run(
      input.name,
      slug,
      input.description,
      imagePath ?? null,
      specialFilter ?? null,
      input.sortOrder,
      Date.now(),
      id,
    );
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Row;
    res.json({ category: rowToCategory(row) });
  } catch (error) {
    if (stored) await deleteStoredImages([stored.path, stored.thumbPath]);
    throw error;
  }
}));

adminRouter.delete('/categories/:id', wrap((req, res) => {
  const id = parseIdParam(req.params.id, 'category ID');
  const existing = db.prepare('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) throw new HttpError(404, 'Category not found.', 'category_not_found');
  const linked = db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ? AND deleted_at IS NULL').get(id) as Row;
  if (Number(linked.count) > 0) {
    throw new HttpError(409, 'Reassign or remove the products in this category before deleting it.', 'category_in_use');
  }
  db.prepare('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?').run(Date.now(), Date.now(), id);
  res.json({ ok: true });
}));

adminRouter.get('/customers', wrap((req, res) => {
  const query = adminCustomerQuerySchema.parse(req.query);
  res.json({ customers: getAdminCustomerSummaries(query) });
}));

adminRouter.get('/customers/:id', wrap((req, res) => {
  const detail = getAdminCustomerDetail(parseIdParam(req.params.id, 'customer ID'));
  if (!detail) throw new HttpError(404, 'Customer not found.', 'customer_not_found');
  res.json(detail);
}));

adminRouter.get('/orders', wrap((req, res) => {
  const query = adminOrderQuerySchema.parse(req.query);
  res.json({ orders: getAdminOrders(query) });
}));

adminRouter.get('/orders/:id', wrap((req, res) => {
  const detail = getAdminOrderDetail(req.params.id);
  if (!detail) throw new HttpError(404, 'Order not found.', 'order_not_found');
  res.json({ order: detail });
}));

adminRouter.patch('/orders/:id/status', wrap((req, res) => {
  const input = statusUpdateSchema.parse(req.body);
  updateOrderStatus(req.params.id, input.status, input.note, 'admin');
  const detail = getAdminOrderDetail(req.params.id);
  if (!detail) throw new HttpError(404, 'Order not found.', 'order_not_found');
  res.json({ order: detail });
}));
