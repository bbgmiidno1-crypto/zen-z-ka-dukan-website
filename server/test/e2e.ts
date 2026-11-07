import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import type {
  Address,
  AdminOrder,
  AdminOrderDetail,
  AdminOverview,
  AdminProductDetail,
  Category,
  CheckoutPreview,
  HomeData,
  Order,
  OrderDetail,
  PaginatedProducts,
  ProductDetail,
  Product360Sequence,
  ProductSummary,
  PublicUser,
} from '../../shared/types';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(serverDir, '../..');
const PORT = 3102;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, 'data', 'test-e2e');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'zen.db');
const BOOTSTRAP_TOKEN = 'E2E-PRIVATE-BOOTSTRAP-TOKEN-2026-ZZKD';
const SESSION_SECRET = 'E2E-PERSISTENT-SESSION-SECRET-ZZKD-2026';
const ADMIN_USERNAME = 'atelier_admin';
const ADMIN_PASSWORD = 'ZenAdmin2026!';
const FIRST_PASSWORD = 'ZenGold2026!';
const SECOND_PASSWORD = 'ZenGold2027!';
const MOBILE = `9${String((crypto.randomBytes(4).readUInt32BE() % 900000000) + 100000000).padStart(9, '0')}`;

let serverLogs = '';
let currentServer: ChildProcess | null = null;

class ApiFailure extends Error {
  constructor(public status: number, public data: unknown) {
    const body = data && typeof data === 'object' ? (data as { error?: string }).error : undefined;
    super(body || `HTTP ${status}`);
    this.name = 'ApiFailure';
  }
}

class Client {
  private cookies = new Map<string, string>();

  async request<T = unknown>(pathname: string, init: RequestInit = {}, allowError = false): Promise<{ status: number; data: T; headers: Headers }> {
    const headers = new Headers(init.headers);
    headers.set('X-ZZKD-Client', '1');
    if (this.cookies.size) headers.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
    if (init.body && !isForm && typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${BASE}${pathname}`, { ...init, headers, credentials: 'include' });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0] || '';
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!value || value.startsWith('s:') && value.length < 4) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    let data: unknown = text;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    }
    if (!response.ok && !allowError) throw new ApiFailure(response.status, data);
    return { status: response.status, data: data as T, headers: response.headers };
  }

  get<T>(pathname: string, allowError = false) {
    return this.request<T>(pathname, { method: 'GET' }, allowError);
  }
  post<T>(pathname: string, body?: unknown, allowError = false) {
    return this.request<T>(pathname, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, allowError);
  }
  put<T>(pathname: string, body?: unknown, allowError = false) {
    return this.request<T>(pathname, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }, allowError);
  }
  patch<T>(pathname: string, body?: unknown, allowError = false) {
    return this.request<T>(pathname, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }, allowError);
  }
  delete<T>(pathname: string, allowError = false) {
    return this.request<T>(pathname, { method: 'DELETE' }, allowError);
  }
  upload<T>(pathname: string, form: FormData, method: 'POST' | 'PUT' = 'POST', allowError = false) {
    return this.request<T>(pathname, { method, body: form }, allowError);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function step(message: string): void {
  console.log(`\n✓ ${message}`);
}

async function imageBuffer(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: { width: 700, height: 900, channels: 3, background: color },
  }).jpeg({ quality: 90 }).toBuffer();
}

function toImageBlob(image: Buffer): Blob {
  const bytes = new Uint8Array(image.byteLength);
  bytes.set(image);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'image/jpeg' });
}

async function angleBuffer(index: number, total: number): Promise<Buffer> {
  const rotation = Math.round((index / Math.max(1, total)) * 360);
  const lightness = Math.round(30 + (index / Math.max(1, total)) * 60);
  const overlay = Buffer.from(
    `<svg width="480" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="600" fill="#080808"/>
      <circle cx="240" cy="300" r="170" fill="none" stroke="#D4AF37" stroke-width="3"/>
      <g transform="rotate(${rotation} 240 300)">
        <rect x="228" y="120" width="24" height="120" fill="#D4AF37"/>
        <rect x="120" y="288" width="240" height="24" fill="rgb(${lightness},${Math.round(lightness * 0.8)},24)"/>
      </g>
      <text x="240" y="560" fill="#D4AF37" font-size="28" text-anchor="middle" font-family="sans-serif">Angle ${index + 1} of ${total}</text>
    </svg>`,
    'utf8',
  );
  return sharp(overlay).jpeg({ quality: 90 }).toBuffer();
}

function tinyGlb(): Buffer {
  const sceneJson = JSON.stringify({ asset: { version: '2.0' }, scenes: [{}], scene: 0, nodes: [] });
  const chunk = Buffer.from(sceneJson, 'utf8');
  const padded = Buffer.concat([chunk, Buffer.alloc((4 - (chunk.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + padded.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(padded.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunkHeader, padded]);
}

async function mediaStatus(url: string): Promise<{ status: number; type: string; bytes: number }> {
  const response = await fetch(`${BASE}${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, type: response.headers.get('content-type') || '', bytes: buffer.length };
}

function startServer(): ChildProcess {
  const cli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const child = spawn(process.execPath, [cli, 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      DATA_DIR,
      UPLOAD_DIR,
      ADMIN_BOOTSTRAP_TOKEN: BOOTSTRAP_TOKEN,
      SESSION_SECRET,
      COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => { serverLogs += String(chunk); });
  child.stderr?.on('data', (chunk) => { serverLogs += String(chunk); });
  currentServer = child;
  return child;
}

async function waitForHealth(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${serverLogs}`);
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Server did not become healthy:\n${serverLogs}`);
}

async function stopServer(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit').then(() => undefined);
  child.kill('SIGTERM');
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function inspectDb<T>(fn: (db: Database.Database) => T): T {
  const database = new Database(DB_PATH, { readonly: true });
  try {
    return fn(database);
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const customer = new Client();
  const admin = new Client();

  step('Starting isolated persistent API server');
  let server = startServer();
  await waitForHealth(server);

  const health = await customer.get<{ ok: boolean }>('/api/health');
  assert(health.data.ok, 'Health endpoint must respond OK');
  const home = await customer.get<HomeData>('/api/home');
  assert(home.data.categories.length >= 9, 'Nine seeded categories must be available');
  assert(home.data.featured.length > 0, 'Featured products must be loaded from the database');
  const seededMedia = await mediaStatus(home.data.editorial.hero);
  assert(seededMedia.status === 200 && seededMedia.type.includes('webp'), 'Seed editorial media must be served from persistent storage');
  const seededSpin = await customer.get<ProductDetail>('/api/products/aurum-chronograph');
  const seededSequence = seededSpin.data.variants[0].spin;
  assert(seededSequence, 'Seeded colourways must expose a persistent 360° sequence');
  assert(seededSequence.frameCount === 8 && seededSequence.images.length === 8, 'Seeded 360° sequences must contain exactly eight ordered angles');
  assert(seededSequence.source === 'seed_derived', 'Seeded 360° sequences must be marked as catalogue-derived, never claimed as photographed angles');
  const seededSpinMedia = await mediaStatus(seededSequence.images[3].path);
  const seededSpinThumb = await mediaStatus(seededSequence.images[3].thumbPath);
  assert(seededSpinMedia.status === 200 && seededSpinMedia.type.includes('webp') && seededSpinMedia.bytes > 1000, 'Seeded 360° angle must be served as WebP');
  assert(seededSpinThumb.status === 200 && seededSpinThumb.type.includes('webp'), 'Seeded 360° thumbnail must be served');
  const seededSpinCounts = inspectDb((database) => ({
    sequences: (database.prepare('SELECT COUNT(*) AS count FROM product_360_sequences WHERE deleted_at IS NULL').get() as { count: number }).count,
    images: (database.prepare('SELECT COUNT(*) AS count FROM product_360_images WHERE deleted_at IS NULL').get() as { count: number }).count,
  }));
  assert(seededSpinCounts.sequences === 72, `Every seeded colourway must own a 360° sequence row (found ${seededSpinCounts.sequences})`);
  assert(seededSpinCounts.images === 576, `Seeded 360° images must be stored once each (found ${seededSpinCounts.images})`);

  step('Verifying admin dashboard is inaccessible before authentication');
  const unauthorized = await admin.get('/api/admin/overview', true);
  assert(unauthorized.status === 401, 'Unauthenticated admin overview must return 401');
  const bootstrap = await admin.get<{ adminConfigured: boolean }>('/api/bootstrap/status');
  assert(bootstrap.data.adminConfigured === false, 'Fresh database must have no administrator');

  step('Testing private admin setup and admin login');
  const badSetup = await admin.post('/api/admin/setup', {
    bootstrapToken: 'wrong-token-value', username: ADMIN_USERNAME, password: ADMIN_PASSWORD, confirmPassword: ADMIN_PASSWORD,
  }, true);
  assert(badSetup.status === 401, 'Incorrect bootstrap token must be rejected');
  const setup = await admin.post<{ admin: { username: string } }>('/api/admin/setup', {
    bootstrapToken: BOOTSTRAP_TOKEN, username: ADMIN_USERNAME, password: ADMIN_PASSWORD, confirmPassword: ADMIN_PASSWORD,
  });
  assert(setup.status === 201 && setup.data.admin.username === ADMIN_USERNAME, 'Admin setup must create a secure account');
  const overview = await admin.get<AdminOverview>('/api/admin/overview');
  assert(overview.data.totals.products >= 24, 'Dashboard overview must report persistent products');
  await admin.post('/api/admin/logout');
  const adminLogin = await admin.post('/api/admin/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  assert(adminLogin.status === 200, 'Administrator login must succeed after logout');

  step('Testing customer registration, secure hashing and login');
  const registration = await customer.post<{ customer: PublicUser; recoveryCode: string }>('/api/auth/register', {
    mobile: MOBILE, password: FIRST_PASSWORD, confirmPassword: FIRST_PASSWORD,
  });
  assert(registration.status === 201, 'Customer registration must succeed');
  assert(/^ZZKD-/.test(registration.data.recoveryCode), 'A unique recovery code must be shown once');
  const secrets = inspectDb((database) => database
    .prepare('SELECT password_hash, recovery_hash FROM customers WHERE mobile = ?')
    .get(MOBILE) as { password_hash: string; recovery_hash: string } | undefined);
  assert(secrets, 'Customer row must exist in SQLite');
  assert(!secrets.password_hash.includes(FIRST_PASSWORD), 'Plain-text password must never be stored');
  assert(!secrets.recovery_hash.includes(registration.data.recoveryCode), 'Plain-text recovery code must never be stored');
  assert(secrets.password_hash.startsWith('scrypt$') && secrets.recovery_hash.startsWith('scrypt$'), 'Both secrets must use scrypt hashes');
  await customer.post('/api/auth/logout');
  const login = await customer.post<{ customer: PublicUser }>('/api/auth/login', { mobile: MOBILE, password: FIRST_PASSWORD });
  assert(login.data.customer.mobile === MOBILE, 'Customer login must restore the persistent session');

  step('Testing forgot password with recovery code and rotated secret');
  const oldPasswordAttempt = await customer.post('/api/auth/login', { mobile: MOBILE, password: 'WrongPassword9!' }, true);
  assert(oldPasswordAttempt.status === 401, 'Incorrect password must be rejected');
  const recovery = await customer.post<{ newRecoveryCode: string }>('/api/auth/forgot-password', {
    mobile: MOBILE,
    recoveryCode: registration.data.recoveryCode,
    newPassword: SECOND_PASSWORD,
    confirmPassword: SECOND_PASSWORD,
  });
  assert(recovery.data.newRecoveryCode !== registration.data.recoveryCode, 'Recovery code must rotate after use');
  const oldPasswordAfterReset = await customer.post('/api/auth/login', { mobile: MOBILE, password: FIRST_PASSWORD }, true);
  assert(oldPasswordAfterReset.status === 401, 'Old password must stop working after reset');
  const newLogin = await customer.post('/api/auth/login', { mobile: MOBILE, password: SECOND_PASSWORD });
  assert(newLogin.status === 200, 'New password must work');

  step('Uploading a product with two colour variants and separate device images');
  const categoriesResponse = await admin.get<{ categories: Category[] }>('/api/admin/categories');
  const firstCategory = categoriesResponse.data.categories.find((category) => !category.specialFilter);
  assert(firstCategory, 'An active category must exist');
  const goldImage = await imageBuffer({ r: 120, g: 92, b: 28 });
  const blackImage = await imageBuffer({ r: 18, g: 18, b: 18 });
  const createForm = new FormData();
  const createPayload = {
    name: 'E2E Atelier Test Piece',
    description: 'A persistent end-to-end test product with direct colour variant uploads and a complete stock matrix.',
    categoryId: firstCategory.id,
    pricePaise: 123400,
    originalPricePaise: 159900,
    available: true,
    featured: true,
    newArrival: true,
    bestSeller: true,
    sizes: [{ label: 'S' }, { label: 'M' }],
    variants: [
      { name: 'Test Gold', colorHex: '#D4AF37', existingImages: [], stock: [3, 2] },
      { name: 'Test Onyx', colorHex: '#111111', existingImages: [], stock: [2, 1] },
    ],
  };
  createForm.append('payload', JSON.stringify(createPayload));
  createForm.append('variantImages_0', toImageBlob(goldImage), 'gold.jpg');
  createForm.append('variantImages_1', toImageBlob(blackImage), 'onyx.jpg');
  const created = await admin.upload<{ product: AdminProductDetail }>('/api/admin/products', createForm);
  assert(created.status === 201, 'Product upload must succeed');
  const createdProduct = created.data.product;
  assert(createdProduct.variants.length === 2, 'Uploaded product must have two colour variants');
  assert(createdProduct.variants.every((variant) => variant.images.length > 0), 'Each colour variant must have its own uploaded image');
  const uploadedImagePath = createdProduct.variants[0].images[0].path;
  const uploadedImageThumb = createdProduct.variants[0].images[0].thumbPath;
  const uploadedMedia = await mediaStatus(uploadedImagePath);
  const uploadedThumb = await mediaStatus(uploadedImageThumb);
  assert(uploadedMedia.status === 200 && uploadedMedia.type.includes('webp') && uploadedMedia.bytes > 1000, 'Uploaded full image must be optimized and served');
  assert(uploadedThumb.status === 200 && uploadedThumb.type.includes('webp'), 'Uploaded thumbnail must be served');

  step('Verifying colour images, size selection and server-calculated checkout preview');
  const uploadedDetail = await customer.get<ProductDetail>(`/api/products/${createdProduct.slug}`);
  assert(uploadedDetail.data.variants.length === 2, 'Public detail must expose both colour variants');
  assert(uploadedDetail.data.variants[0].images[0].path !== uploadedDetail.data.variants[1].images[0].path, 'Variant images must be distinct');
  const chosenVariant = uploadedDetail.data.variants[0];
  const chosenSize = uploadedDetail.data.sizes[0];
  const stockKey = `${chosenVariant.id}:${chosenSize.id}`;
  assert(uploadedDetail.data.inventory[stockKey] === 3, 'Uploaded stock matrix must be persisted');
  const previewSelection = { productSlug: createdProduct.slug, variantId: chosenVariant.id, sizeId: chosenSize.id, quantity: 1 };
  const preview = await customer.post<CheckoutPreview>('/api/checkout/preview', { ...previewSelection, pricePaise: 1, totalPaise: 1 });
  assert(preview.data.totalPaise === 123400, 'Checkout preview must ignore client-supplied prices');
  assert(preview.data.deliveryPaise === 0 && preview.data.paymentMethod === 'COD', 'Preview must enforce COD and ₹0 delivery');
  assert(preview.data.variant.name === 'Test Gold' && preview.data.size.label === 'S', 'Preview must show selected colour and size');

  step('Editing product price, flags and stock matrix');
  const editForm = new FormData();
  const editPayload = {
    id: createdProduct.id,
    name: createdProduct.name,
    slug: createdProduct.slug,
    description: createdProduct.description,
    categoryId: createdProduct.categoryId,
    pricePaise: 111100,
    originalPricePaise: 159900,
    available: true,
    featured: true,
    newArrival: true,
    bestSeller: false,
    sizes: createdProduct.sizes.map((size) => ({ id: size.id, label: size.label })),
    variants: createdProduct.variants.map((variant, index) => ({
      id: variant.id,
      name: variant.name,
      colorHex: variant.colorHex,
      existingImages: variant.images.map((image) => ({ id: image.id, path: image.path, thumbPath: image.thumbPath })),
      stock: index === 0 ? [1, 0] : [4, 2],
    })),
  };
  editForm.append('payload', JSON.stringify(editPayload));
  const edited = await admin.upload<{ product: AdminProductDetail }>(`/api/admin/products/${createdProduct.id}`, editForm, 'PUT');
  assert(edited.data.product.pricePaise === 111100, 'Product edit must update the price');
  assert(edited.data.product.variants[0].stock[0] === 1, 'Product edit must update variant-size stock');
  const flags = await admin.patch(`/api/admin/products/${createdProduct.id}/flags`, { bestSeller: true });
  assert(flags.status === 200, 'Merchandising flags must be manageable');

  step('Uploading, reordering and clearing real 360° angle sequences per colour');
  const spinVariant = createdProduct.variants[0];
  const spinCount = 12;
  const spinForm = new FormData();
  spinForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0
        ? { frameCount: spinCount, existingImages: [], removeModel: false, clearSequence: false }
        : undefined,
    })),
  }));
  for (let index = 0; index < spinCount; index += 1) {
    spinForm.append('spinImages_0', toImageBlob(await angleBuffer(index, spinCount)), `angle-${String(index).padStart(2, '0')}.jpg`);
  }
  const spinUpload = await admin.upload<{ product: AdminProductDetail; warnings?: string[] }>(`/api/admin/products/${createdProduct.id}`, spinForm, 'PUT');
  assert((spinUpload.data.warnings || []).length === 0, 'A complete angle sequence must save without warnings');
  const uploadedSequence = spinUpload.data.product.variants[0].spin;
  assert(uploadedSequence, 'Admin upload must persist a 360° sequence');
  assert(uploadedSequence.frameCount === spinCount && uploadedSequence.images.length === spinCount, 'Admin 360° sequence must keep exactly the declared angle count');
  assert(uploadedSequence.source === 'admin_upload', 'Admin-uploaded angles must be marked as real uploads');
  assert(spinUpload.data.product.variants[1].spin === null, 'A colour without uploaded angles must not invent a sequence');
  const firstAngle = await mediaStatus(uploadedSequence.images[0].path);
  const lastAngle = await mediaStatus(uploadedSequence.images[spinCount - 1].path);
  assert(firstAngle.status === 200 && firstAngle.type.includes('webp') && firstAngle.bytes > 1000, 'Uploaded 360° angle must be optimized to WebP and served');
  assert(lastAngle.status === 200, 'Every uploaded 360° angle must be served');
  const spinDbRows = inspectDb((database) => ({
    sequences: (database.prepare('SELECT COUNT(*) AS count FROM product_360_sequences WHERE variant_id = ? AND deleted_at IS NULL').get(spinVariant.id) as { count: number }).count,
    images: (database.prepare('SELECT COUNT(*) AS count FROM product_360_images i JOIN product_360_sequences s ON s.id = i.sequence_id WHERE s.variant_id = ? AND i.deleted_at IS NULL').get(spinVariant.id) as { count: number }).count,
  }));
  assert(spinDbRows.sequences === 1 && spinDbRows.images === spinCount, 'Angle sequences must be stored in the persistent 360° tables');
  const publicSpin = await customer.get<ProductDetail>(`/api/products/${createdProduct.slug}`);
  const publicSequence: Product360Sequence | null = publicSpin.data.variants[0].spin;
  assert(publicSequence?.source === 'admin_upload' && publicSequence.images.length === spinCount, 'Storefront must expose the real uploaded sequence');

  const partialForm = new FormData();
  partialForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0
        ? { frameCount: 8, existingImages: uploadedSequence.images.slice(0, 5).map((image) => ({ id: image.id, path: image.path, thumbPath: image.thumbPath })) }
        : undefined,
    })),
  }));
  const partialUpload = await admin.upload<{ product: AdminProductDetail; warnings?: string[] }>(`/api/admin/products/${createdProduct.id}`, partialForm, 'PUT');
  assert((partialUpload.data.warnings || []).length === 1, 'An invalid angle count must return an explicit warning');
  assert(partialUpload.data.product.variants[0].spin?.images.length === spinCount, 'An invalid angle count must never damage the stored sequence');

  const reversedForm = new FormData();
  reversedForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0
        ? { frameCount: spinCount, existingImages: [...uploadedSequence.images].reverse().map((image) => ({ id: image.id, path: image.path, thumbPath: image.thumbPath })) }
        : undefined,
    })),
  }));
  const reversedUpload = await admin.upload<{ product: AdminProductDetail; warnings?: string[] }>(`/api/admin/products/${createdProduct.id}`, reversedForm, 'PUT');
  const reordered = reversedUpload.data.product.variants[0].spin;
  assert(reordered?.images[0].path === uploadedSequence.images[spinCount - 1].path, 'Reordering existing angles must persist the new rotation order');
  assert(reordered?.images.length === spinCount, 'Reordering must not duplicate or drop angles');

  const badModelForm = new FormData();
  badModelForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0 ? { frameCount: spinCount, existingImages: reordered!.images.map((image) => ({ id: image.id, path: image.path, thumbPath: image.thumbPath })) } : undefined,
    })),
  }));
  const brokenGlb = Buffer.concat([Buffer.from('glTF', 'ascii'), Buffer.alloc(12, 1)]);
  badModelForm.append('spinModels_0', new Blob([new Uint8Array(brokenGlb).buffer as ArrayBuffer], { type: 'model/gltf-binary' }), 'broken.glb');
  const badModel = await admin.upload(`/api/admin/products/${createdProduct.id}`, badModelForm, 'PUT', true);
  assert(badModel.status === 415, 'A malformed GLB model must be rejected');

  const modelForm = new FormData();
  modelForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0 ? { frameCount: spinCount, existingImages: reordered!.images.map((image) => ({ id: image.id, path: image.path, thumbPath: image.thumbPath })) } : undefined,
    })),
  }));
  const glb = tinyGlb();
  modelForm.append('spinModels_0', new Blob([new Uint8Array(glb).buffer as ArrayBuffer], { type: 'model/gltf-binary' }), 'piece.glb');
  const modelUpload = await admin.upload<{ product: AdminProductDetail; warnings?: string[] }>(`/api/admin/products/${createdProduct.id}`, modelForm, 'PUT');
  const modelled = modelUpload.data.product.variants[0].spin;
  assert(modelled?.modelPath && modelled.modelMime === 'model/gltf-binary', 'A valid GLB model must attach to the colour sequence');
  const modelMedia = await mediaStatus(modelled.modelPath!);
  assert(modelMedia.status === 200, 'The optional 3D model must be served from persistent storage');

  const removalForm = new FormData();
  removalForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0 ? { frameCount: spinCount, existingImages: modelled!.images.map((image) => ({ id: image.id, path: image.path, thumbPath: image.thumbPath })), removeModel: true } : undefined,
    })),
  }));
  const removal = await admin.upload<{ product: AdminProductDetail; warnings?: string[] }>(`/api/admin/products/${createdProduct.id}`, removalForm, 'PUT');
  assert(removal.data.product.variants[0].spin?.modelPath === null, 'The 3D model must be removable without losing angles');

  const clearForm = new FormData();
  clearForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0 ? { frameCount: spinCount, existingImages: [], clearSequence: true } : undefined,
    })),
  }));
  const cleared = await admin.upload<{ product: AdminProductDetail; warnings?: string[] }>(`/api/admin/products/${createdProduct.id}`, clearForm, 'PUT');
  assert(cleared.data.product.variants[0].spin === null, 'Clearing a sequence must remove it from the storefront');
  const removedAngle = await mediaStatus(uploadedSequence.images[0].path);
  assert(removedAngle.status === 404, 'Cleared 360° media must be deleted from disk, not left orphaned');

  const restoreForm = new FormData();
  restoreForm.append('payload', JSON.stringify({
    ...editPayload,
    variants: editPayload.variants.map((variant, index) => ({
      ...variant,
      spin: index === 0 ? { frameCount: 8, existingImages: [], clearSequence: false } : undefined,
    })),
  }));
  for (let index = 0; index < 8; index += 1) {
    restoreForm.append('spinImages_0', toImageBlob(await angleBuffer(index, 8)), `restored-${index}.jpg`);
  }
  const restoredSpin = await admin.upload<{ product: AdminProductDetail; warnings?: string[] }>(`/api/admin/products/${createdProduct.id}`, restoreForm, 'PUT');
  const finalSpin = restoredSpin.data.product.variants[0].spin;
  assert(finalSpin?.images.length === 8 && finalSpin.source === 'admin_upload', 'A fresh 8-angle sequence must replace a cleared one');
  const finalSpinPath = finalSpin!.images[4].path;
  const finalSpinThumb = finalSpin!.images[4].thumbPath;

  step('Testing BUY NOW preview, COD order creation, stock decrement and tracking');
  const address = {
    customerName: 'E2E Patron',
    mobile: MOBILE,
    line1: '42 Gold Leaf Avenue, Nungambakkam',
    line2: 'Near the black marble gallery',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600034',
    saveAddress: true,
  };
  const orderResponse = await customer.post<{ order: OrderDetail }>('/api/customer/orders', {
    ...previewSelection,
    ...address,
    totalPaise: 1,
    paymentMethod: 'ONLINE',
    deliveryPaise: 999,
  });
  assert(orderResponse.status === 201, 'COD order must be created');
  const order = orderResponse.data.order;
  assert(/^ZZKD-\d{8}-[A-F0-9]{8}$/.test(order.id), 'Order must receive a unique ZEN Z KA DUKAN ID');
  assert(order.totalPaise === 111100 && order.deliveryPaise === 0 && order.paymentMethod === 'COD', 'Server must recalculate final amount and enforce COD');
  assert(order.status === 'Order Placed' && order.history.length === 1, 'Order must start with Order Placed history');
  const afterOrderDetail = await customer.get<ProductDetail>(`/api/products/${createdProduct.slug}`);
  assert(afterOrderDetail.data.inventory[stockKey] === 0, 'Stock must decrement in the same database transaction');
  const customerOrders = await customer.get<{ orders: Order[] }>('/api/customer/orders');
  assert(customerOrders.data.orders.some((item) => item.id === order.id), 'Order must appear in customer order history');
  const tracking = await customer.get<{ order: OrderDetail }>(`/api/customer/orders/${order.id}`);
  assert(tracking.data.order.items[0].imagePath === uploadedImagePath, 'Order item must snapshot the selected variant image');
  const savedAddresses = await customer.get<{ addresses: Address[] }>('/api/customer/addresses');
  assert(savedAddresses.data.addresses.some((item) => item.line1 === address.line1), 'Checkout must save the delivery address');
  const outOfStock = await customer.post('/api/customer/orders', { ...previewSelection, ...address }, true);
  assert(outOfStock.status === 409, 'Out-of-stock repeat order must be rejected');

  step('Testing admin search, customer visibility and order status updates');
  const adminOrders = await admin.get<{ orders: AdminOrder[] }>('/api/admin/orders', undefined);
  assert(adminOrders.data.orders.some((item) => item.id === order.id), 'Admin order list must include the order');
  const filteredOrders = await admin.get<{ orders: AdminOrder[] }>('/api/admin/orders?status=Order%20Placed&search=' + encodeURIComponent(order.id));
  assert(filteredOrders.data.orders.some((item) => item.id === order.id), 'Admin order search and status filter must work');
  const adminOrderDetail = await admin.get<{ order: AdminOrderDetail }>(`/api/admin/orders/${order.id}`);
  assert(adminOrderDetail.data.order.customerId, 'Admin order detail must expose the customer record');
  const packed = await admin.patch<{ order: AdminOrderDetail }>(`/api/admin/orders/${order.id}/status`, { status: 'Packed', note: 'Packed by automated test.' });
  assert(packed.data.order.history.length === 2, 'Status update must append to history');
  const shipped = await admin.patch<{ order: AdminOrderDetail }>(`/api/admin/orders/${order.id}/status`, { status: 'Shipped' });
  assert(shipped.data.order.status === 'Shipped', 'Admin status update must persist');
  const customerTracking = await customer.get<{ order: OrderDetail }>(`/api/customer/orders/${order.id}`);
  assert(customerTracking.data.order.status === 'Shipped', 'Customer tracking must reflect admin status updates');
  const cancelled = await admin.patch<{ order: AdminOrderDetail }>(`/api/admin/orders/${order.id}/status`, { status: 'Cancelled', note: 'E2E cancellation.' });
  assert(cancelled.data.order.status === 'Cancelled', 'Admin must be able to cancel an order');
  const restored = await customer.get<ProductDetail>(`/api/products/${createdProduct.slug}`);
  assert(restored.data.inventory[stockKey] === 1, 'Cancellation must restore reserved stock');

  step('Testing quick stock management, category CRUD and product deletion');
  const stockUpdate = await admin.patch('/api/admin/inventory', { variantId: chosenVariant.id, sizeId: chosenSize.id, stock: 7 });
  assert(stockUpdate.status === 200, 'Quick stock management endpoint must work');
  const stockAfterUpdate = await customer.get<ProductDetail>(`/api/products/${createdProduct.slug}`);
  assert(stockAfterUpdate.data.inventory[stockKey] === 7, 'Quick stock update must persist');
  const categoryImage = await imageBuffer({ r: 40, g: 32, b: 12 });
  const categoryForm = new FormData();
  categoryForm.append('payload', JSON.stringify({ name: 'E2E Capsule', description: 'Temporary test category', specialFilter: null, sortOrder: 99 }));
  categoryForm.append('image', toImageBlob(categoryImage), 'category.jpg');
  const categoryCreated = await admin.upload<{ category: Category }>('/api/admin/categories', categoryForm);
  assert(categoryCreated.status === 201 && categoryCreated.data.category.name === 'E2E Capsule', 'Category create with direct image upload must work');
  const categoryId = categoryCreated.data.category.id;
  const categoryEditForm = new FormData();
  categoryEditForm.append('payload', JSON.stringify({ name: 'E2E Capsule Edited', slug: 'e2e-capsule', description: 'Updated', imagePath: categoryCreated.data.category.imagePath, specialFilter: null, sortOrder: 98 }));
  const categoryEdited = await admin.upload<{ category: Category }>(`/api/admin/categories/${categoryId}`, categoryEditForm, 'PUT');
  assert(categoryEdited.data.category.name === 'E2E Capsule Edited', 'Category edit must work');
  await admin.delete(`/api/admin/categories/${categoryId}`);
  const categoriesAfterDelete = await admin.get<{ categories: Category[] }>('/api/admin/categories');
  assert(!categoriesAfterDelete.data.categories.some((category) => category.id === categoryId), 'Category delete must remove it from active list');
  await admin.delete(`/api/admin/products/${createdProduct.id}`);
  const deletedProduct = await customer.get(`/api/products/${createdProduct.slug}`, true);
  assert(deletedProduct.status === 404, 'Deleted product must disappear from the storefront');
  const orderAfterDelete = await customer.get<{ order: OrderDetail }>(`/api/customer/orders/${order.id}`);
  assert(orderAfterDelete.data.order.items[0].productName === createdProduct.name, 'Order history must survive product deletion');

  step('Restarting application to verify database, sessions, orders and uploaded images persist');
  await stopServer(server);
  server = startServer();
  await waitForHealth(server);
  currentServer = server;
  const adminAfterRestart = await admin.get<AdminOverview>('/api/admin/overview');
  assert(adminAfterRestart.status === 200, 'Admin session must remain valid after restart');
  assert(adminAfterRestart.data.totals.orders >= 1, 'Orders must persist after restart');
  const orderAfterRestart = await customer.get<{ order: OrderDetail }>(`/api/customer/orders/${order.id}`);
  assert(orderAfterRestart.data.order.status === 'Cancelled', 'Order status must persist after restart');
  const mediaAfterRestart = await mediaStatus(uploadedImagePath);
  assert(mediaAfterRestart.status === 200 && mediaAfterRestart.bytes > 1000, 'Uploaded product image must remain available after restart');
  const spinAfterRestart = await mediaStatus(finalSpinPath);
  const spinThumbAfterRestart = await mediaStatus(finalSpinThumb);
  assert(spinAfterRestart.status === 200 && spinAfterRestart.type.includes('webp'), 'Uploaded 360° angle must survive a server restart');
  assert(spinThumbAfterRestart.status === 200, 'Uploaded 360° thumbnail must survive a server restart');
  const seededSpinAfterRestart = await customer.get<ProductDetail>('/api/products/aurum-chronograph');
  const persistedSeedSpin = seededSpinAfterRestart.data.variants[0].spin;
  assert(persistedSeedSpin?.images.length === 8 && persistedSeedSpin.source === 'seed_derived', 'Seeded 360° sequences must persist after restart without duplication');
  const spinRowsAfterRestart = inspectDb((database) => ({
    sequences: (database.prepare('SELECT COUNT(*) AS count FROM product_360_sequences WHERE deleted_at IS NULL').get() as { count: number }).count,
    duplicates: (database.prepare('SELECT COUNT(*) AS count FROM (SELECT variant_id FROM product_360_sequences WHERE deleted_at IS NULL GROUP BY variant_id HAVING COUNT(*) > 1)').get() as { count: number }).count,
  }));
  assert(spinRowsAfterRestart.sequences === 72, `The 72 seeded colourway sequences must persist exactly once each (found ${spinRowsAfterRestart.sequences})`);
  assert(spinRowsAfterRestart.duplicates === 0, 'Restart must not duplicate 360° sequences for any colourway');
  const closedAdminSequence = inspectDb((database) => database
    .prepare('SELECT id, deleted_at FROM product_360_sequences WHERE product_id = ? AND frame_count = 8 ORDER BY id DESC LIMIT 1')
    .get(createdProduct.id) as { id: number; deleted_at: number | null } | undefined);
  assert(closedAdminSequence?.deleted_at, 'Deleting a product must close its 360° sequence without orphaning an active record');
  const persistedProductRow = inspectDb((database) => database
    .prepare('SELECT id, deleted_at FROM products WHERE id = ?')
    .get(createdProduct.id) as { id: number; deleted_at: number | null } | undefined);
  assert(persistedProductRow?.deleted_at, 'Deleted product must be preserved as a soft-deleted database row for order history');

  step('Checking catalogue pagination, unavailable protection and newsletter persistence');
  const shop = await customer.get<PaginatedProducts>('/api/products?limit=12&page=1');
  assert(shop.data.products.length > 0 && shop.data.pages >= 1, 'Paginated catalogue must work');
  const unavailable = await customer.get<ProductDetail>('/api/products/black-rose-edp');
  assert(unavailable.data.available === false && unavailable.data.totalStock === 0, 'Seeded unavailable product must be enforced');
  const unavailableSizes = unavailable.data.variants[0];
  const unavailableSize = unavailable.data.sizes[0];
  const unavailablePreview = await customer.post('/api/checkout/preview', {
    productSlug: unavailable.data.slug, variantId: unavailableSizes.id, sizeId: unavailableSize.id, quantity: 1,
  }, true);
  assert(unavailablePreview.status === 409, 'Unavailable product checkout must be rejected');
  const newsletter = await customer.post('/api/newsletter', { email: 'e2e-patron@example.test' });
  assert(newsletter.status === 200, 'Newsletter subscription must persist');
  const duplicateNewsletter = await customer.post('/api/newsletter', { email: 'E2E-PATRON@example.test' });
  assert(duplicateNewsletter.status === 200, 'Duplicate newsletter subscription must be idempotent');
  const newsletterCount = inspectDb((database) => database.prepare('SELECT COUNT(*) AS count FROM newsletter_subscribers').get() as { count: number });
  assert(newsletterCount.count === 1, 'Newsletter email must be stored once in SQLite');

  console.log('\n========================================');
  console.log('ALL ZEN Z KA DUKAN BACKEND TESTS PASSED');
  console.log('========================================');
  console.log(`Customer mobile: ${MOBILE}`);
  console.log(`Admin username: ${ADMIN_USERNAME}`);
  console.log(`Persistent test DB: ${DB_PATH}`);
  console.log(`Persistent test uploads: ${UPLOAD_DIR}`);
}

main()
  .catch((error) => {
    console.error('\nE2E TEST FAILURE:', error instanceof Error ? error.stack : error);
    console.error('\nServer log tail:\n', serverLogs.slice(-6000));
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer(currentServer);
  });
