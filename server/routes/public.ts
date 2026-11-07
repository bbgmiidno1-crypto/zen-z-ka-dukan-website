import { Router } from 'express';
import { db } from '../db';
import { HttpError, wrap } from '../http';
import {
  getCategories,
  getCheckoutSource,
  getHomeData,
  getProductDetail,
  getProducts,
  getSiteContent,
  toCheckoutPreview,
} from '../serializers';
import { checkoutSelectionSchema, newsletterSchema, productQuerySchema } from '../validation';

export const publicRouter = Router();

publicRouter.get('/bootstrap/status', wrap((_req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM admins').get() as { count: number };
  res.json({ adminConfigured: Number(row.count) > 0 });
}));

publicRouter.get('/site', wrap((_req, res) => {
  res.json(getSiteContent());
}));

publicRouter.get('/home', wrap((_req, res) => {
  res.json(getHomeData());
}));

publicRouter.get('/categories', wrap((_req, res) => {
  res.json({ categories: getCategories() });
}));

publicRouter.get('/products', wrap((req, res) => {
  const query = productQuerySchema.parse(req.query);
  res.json(getProducts(query));
}));

publicRouter.get('/products/:slug', wrap((req, res) => {
  const detail = getProductDetail(req.params.slug);
  if (!detail) throw new HttpError(404, 'Product not found.', 'product_not_found');
  res.json(detail);
}));

publicRouter.post('/checkout/preview', wrap((req, res) => {
  const selection = checkoutSelectionSchema.parse(req.body);
  const source = getCheckoutSource(selection);
  if (!source) throw new HttpError(404, 'This product configuration is no longer available.', 'product_unavailable');
  if (!source.available || source.stock < selection.quantity) {
    throw new HttpError(409, 'This colour or size is unavailable. Please choose another combination.', 'out_of_stock');
  }
  res.json(toCheckoutPreview(source, selection.quantity));
}));

publicRouter.post('/newsletter', wrap((req, res) => {
  const input = newsletterSchema.parse(req.body);
  db.prepare('INSERT INTO newsletter_subscribers (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').run(
    input.email.toLowerCase(),
    Date.now(),
  );
  res.json({ ok: true, message: 'You are on the private list.' });
}));
