import { Router } from 'express';
import { db } from '../db';
import { HttpError, requireCustomer, wrap } from '../http';
import { createOrder, updateOrderStatus } from '../order-service';
import { getAddresses, getCustomerOrders, getOrderDetail, getWishlistIds, getWishlistSummaries, rowToAddress } from '../serializers';
import { addressSchema, orderCreateSchema, parseIdParam, wishlistSchema } from '../validation';

type Row = Record<string, unknown>;

export const customerRouter = Router();
customerRouter.use(requireCustomer);

customerRouter.get('/profile', wrap((req, res) => {
  res.json({ customer: req.customer, addresses: getAddresses(req.customer!.id) });
}));

customerRouter.get('/addresses', wrap((req, res) => {
  res.json({ addresses: getAddresses(req.customer!.id) });
}));

customerRouter.post('/addresses', wrap((req, res) => {
  const input = addressSchema.parse(req.body);
  const customerId = req.customer!.id;
  const now = Date.now();
  const transaction = db.transaction(() => {
    if (input.isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND deleted_at IS NULL').run(customerId);
    }
    const result = db.prepare(`
      INSERT INTO addresses
        (customer_id, label, full_name, mobile, line1, line2, city, state, pincode, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customerId,
      input.label,
      input.fullName,
      input.mobile,
      input.line1,
      input.line2,
      input.city,
      input.state,
      input.pincode,
      input.isDefault ? 1 : 0,
      now,
    );
    return Number(result.lastInsertRowid);
  });
  const id = transaction.immediate();
  const row = db.prepare('SELECT * FROM addresses WHERE id = ?').get(id) as Row;
  res.status(201).json({ address: rowToAddress(row) });
}));

customerRouter.put('/addresses/:id/default', wrap((req, res) => {
  const id = parseIdParam(req.params.id, 'address ID');
  const customerId = req.customer!.id;
  const transaction = db.transaction(() => {
    const owned = db.prepare('SELECT id FROM addresses WHERE id = ? AND customer_id = ? AND deleted_at IS NULL').get(id, customerId);
    if (!owned) throw new HttpError(404, 'Address not found.', 'address_not_found');
    db.prepare('UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND deleted_at IS NULL').run(customerId);
    db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(id);
  });
  transaction.immediate();
  res.json({ ok: true, addresses: getAddresses(customerId) });
}));

customerRouter.delete('/addresses/:id', wrap((req, res) => {
  const id = parseIdParam(req.params.id, 'address ID');
  const result = db
    .prepare('UPDATE addresses SET deleted_at = ? WHERE id = ? AND customer_id = ? AND deleted_at IS NULL')
    .run(Date.now(), id, req.customer!.id);
  if (result.changes !== 1) throw new HttpError(404, 'Address not found.', 'address_not_found');
  res.json({ ok: true });
}));

customerRouter.post('/orders', wrap((req, res) => {
  const input = orderCreateSchema.parse(req.body);
  const order = createOrder(req.customer!.id, input);
  res.status(201).json({ order });
}));

customerRouter.get('/orders', wrap((req, res) => {
  res.json({ orders: getCustomerOrders(req.customer!.id) });
}));

customerRouter.get('/orders/:id', wrap((req, res) => {
  const detail = getOrderDetail(req.params.id, req.customer!.id);
  if (!detail) throw new HttpError(404, 'Order not found.', 'order_not_found');
  res.json({ order: detail });
}));

customerRouter.post('/orders/:id/cancel', wrap((req, res) => {
  const owned = db.prepare('SELECT id FROM orders WHERE id = ? AND customer_id = ?').get(req.params.id, req.customer!.id);
  if (!owned) throw new HttpError(404, 'Order not found.', 'order_not_found');
  updateOrderStatus(req.params.id, 'Cancelled', 'Cancelled by customer.', 'customer');
  const detail = getOrderDetail(req.params.id, req.customer!.id);
  res.json({ order: detail });
}));

/* ---------------------------------------------------------------- wishlist */

customerRouter.get('/wishlist', wrap((req, res) => {
  const customerId = req.customer!.id;
  res.json({ productIds: getWishlistIds(customerId), products: getWishlistSummaries(customerId) });
}));

customerRouter.post('/wishlist', wrap((req, res) => {
  const input = wishlistSchema.parse(req.body);
  const customerId = req.customer!.id;
  const product = db
    .prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL')
    .get(input.productId) as Row | undefined;
  if (!product) throw new HttpError(404, 'Product not found.', 'product_not_found');

  const now = Date.now();
  db.prepare(`
    INSERT INTO wishlist_items (customer_id, product_id, created_at, deleted_at)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(customer_id, product_id) DO UPDATE SET deleted_at = NULL, created_at = excluded.created_at
  `).run(customerId, input.productId, now);

  res.status(201).json({
    ok: true,
    wished: true,
    productIds: getWishlistIds(customerId),
    count: getWishlistIds(customerId).length,
  });
}));

customerRouter.delete('/wishlist/:productId', wrap((req, res) => {
  const productId = parseIdParam(req.params.productId, 'product ID');
  const customerId = req.customer!.id;
  db.prepare('UPDATE wishlist_items SET deleted_at = ? WHERE customer_id = ? AND product_id = ? AND deleted_at IS NULL')
    .run(Date.now(), customerId, productId);
  const productIds = getWishlistIds(customerId);
  res.json({ ok: true, wished: false, productIds, count: productIds.length });
}));
