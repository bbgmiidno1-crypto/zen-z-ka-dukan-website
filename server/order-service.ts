import type { z } from 'zod';
import type { OrderStatus } from '../shared/types';
import { newOrderId } from './crypto';
import { db } from './db';
import { HttpError } from './http';
import { getCheckoutSource, getOrderDetail } from './serializers';
import type { orderCreateSchema } from './validation';

type OrderInput = z.infer<typeof orderCreateSchema>;
type Row = Record<string, unknown>;

export function createOrder(customerId: number, input: OrderInput) {
  const orderId = newOrderId();
  const now = Date.now();

  const run = db.transaction(() => {
    // Re-read all pricing and stock inside an IMMEDIATE transaction so concurrent
    // checkouts cannot oversell the last unit.
    const source = getCheckoutSource({
      productSlug: input.productSlug,
      variantId: input.variantId,
      sizeId: input.sizeId,
      quantity: input.quantity,
    });
    if (!source) throw new HttpError(404, 'This product configuration is no longer available.', 'product_unavailable');
    if (!source.available || source.stock < input.quantity) {
      throw new HttpError(409, 'This piece just sold out or is unavailable. Please choose another colour or size.', 'out_of_stock');
    }

    const subtotalPaise = source.pricePaise * input.quantity;
    const totalPaise = subtotalPaise; // COD only, delivery is always ₹0.
    const duplicate = db.prepare('SELECT 1 FROM orders WHERE id = ?').get(orderId);
    if (duplicate) throw new HttpError(409, 'Could not generate a unique order ID. Please try again.', 'order_id_conflict');

    db.prepare(`
      INSERT INTO orders
        (id, customer_id, status, customer_name, mobile, line1, line2, city, state, pincode,
         subtotal_paise, delivery_paise, total_paise, payment_method, stock_restored, created_at, updated_at)
      VALUES (?, ?, 'Order Placed', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'COD', 0, ?, ?)
    `).run(
      orderId,
      customerId,
      input.customerName,
      input.mobile,
      input.line1,
      input.line2,
      input.city,
      input.state,
      input.pincode,
      subtotalPaise,
      totalPaise,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO order_items
        (order_id, product_id, variant_id, size_id, product_name, variant_name, size_label,
         image_path, quantity, unit_price_paise, discount_percent, line_total_paise)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      source.productId,
      source.variantId,
      source.sizeId,
      source.productName,
      source.variantName,
      source.sizeLabel,
      source.imagePath,
      input.quantity,
      source.pricePaise,
      source.discountPercent,
      subtotalPaise,
    );

    const decrement = db.prepare(`
      UPDATE variant_inventory
      SET stock = stock - ?
      WHERE variant_id = ? AND size_id = ? AND stock >= ?
    `).run(input.quantity, source.variantId, source.sizeId, input.quantity);
    if (decrement.changes !== 1) {
      throw new HttpError(409, 'Stock changed before your order could be placed.', 'out_of_stock');
    }

    db.prepare(`
      INSERT INTO order_status_history (order_id, status, note, created_at)
      VALUES (?, 'Order Placed', ?, ?)
    `).run(orderId, 'Order received. Cash on Delivery confirmed.', now);

    if (input.saveAddress) {
      db.prepare(`
        INSERT INTO addresses
          (customer_id, label, full_name, mobile, line1, line2, city, state, pincode, is_default, created_at)
        VALUES (?, 'Checkout', ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        customerId,
        input.customerName,
        input.mobile,
        input.line1,
        input.line2,
        input.city,
        input.state,
        input.pincode,
        now,
      );
    }
    return orderId;
  });

  run.immediate();
  return getOrderDetail(orderId, customerId);
}

interface StatusUpdateResult {
  orderId: string;
  status: OrderStatus;
}

export function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  note = '',
  actor: 'admin' | 'customer' = 'admin',
): StatusUpdateResult {
  const now = Date.now();
  const run = db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Row | undefined;
    if (!order) throw new HttpError(404, 'Order not found.', 'order_not_found');
    const current = String(order.status) as OrderStatus;
    if (current === 'Cancelled' || current === 'Delivered') {
      throw new HttpError(409, `A ${current.toLowerCase()} order can no longer be changed.`, 'order_terminal');
    }
    if (actor === 'customer' && (status !== 'Cancelled' || ['Shipped', 'Out for Delivery'].includes(current))) {
      throw new HttpError(403, 'This order can no longer be cancelled online.', 'cancel_not_allowed');
    }
    if (status === 'Cancelled' && Number(order.stock_restored) === 0) {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as Row[];
      const restore = db.prepare('UPDATE variant_inventory SET stock = stock + ? WHERE variant_id = ? AND size_id = ?');
      for (const item of items) {
        if (item.variant_id != null && item.size_id != null) {
          restore.run(Number(item.quantity), Number(item.variant_id), Number(item.size_id));
        }
      }
      db.prepare('UPDATE orders SET stock_restored = 1 WHERE id = ?').run(orderId);
    }
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, orderId);
    db.prepare('INSERT INTO order_status_history (order_id, status, note, created_at) VALUES (?, ?, ?, ?)').run(
      orderId,
      status,
      note || (actor === 'customer' ? 'Cancelled by customer.' : 'Status updated by ZEN Z KA DUKAN.'),
      now,
    );
    return { orderId, status };
  });
  return run.immediate();
}
