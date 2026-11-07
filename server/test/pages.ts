import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http, { type Server } from 'node:http';
import net from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium, type Browser, type Page } from 'playwright';

// Test the project-path artifact against the real API using an isolated local
// proxy. GitHub Pages itself does NOT provide this proxy or a live backend.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARTIFACT = path.join(ROOT, 'dist-pages');
const PREFIX = '/zen-z-ka-dukan-website/';
const TOKEN = 'PAGES-TEST-PRIVATE-BOOTSTRAP-2026';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zzkd-pages-test-'));
let backend: ChildProcessWithoutNullStreams | undefined;
let frontend: Server | undefined;
let browser: Browser | undefined;
let backendLogs = '';
const errors: string[] = [];

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PAGES TEST: ${message}`);
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function startBackend(port: number): Promise<void> {
  backend = spawn(process.execPath, [path.join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(port), DATA_DIR: temp,
      ADMIN_BOOTSTRAP_TOKEN: TOKEN, SESSION_SECRET: 'PAGES-TEST-SESSION-SECRET-2026',
      COOKIE_PARTITIONED: 'false', PREVIEW_ADMIN_HEADER_SESSION: 'false',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', (chunk) => { backendLogs += String(chunk); });
  backend.stderr.on('data', (chunk) => { backendLogs += String(chunk); });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (backend.exitCode !== null) throw new Error(`Test API exited early: ${backendLogs.slice(-2000)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch { /* server is starting */ }
    await delay(200);
  }
  throw new Error(`Test API did not start: ${backendLogs.slice(-2000)}`);
}

async function startFrontend(backendPort: number): Promise<string> {
  const app = express();
  // This proxy exists only in the test harness, not on github.io.
  const proxy: express.RequestHandler = (req, res) => {
    const upstream = http.request({
      host: '127.0.0.1', port: backendPort, path: req.originalUrl,
      method: req.method, headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
    }, (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.destroy(); });
    req.pipe(upstream);
  };
  app.use('/api', proxy);
  app.use('/media', proxy);
  app.use(PREFIX, express.static(ARTIFACT));
  app.use(PREFIX, (_req, res) => res.status(404).sendFile(path.join(ARTIFACT, '404.html')));
  frontend = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => frontend!.once('listening', resolve));
  return `http://127.0.0.1:${(frontend.address() as net.AddressInfo).port}`;
}

function watch(page: Page): void {
  page.on('pageerror', (error) => errors.push(`JavaScript: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    // GitHub Pages initially returns 404.html for a deep route, which then
    // redirects to the valid index and restores that route before React starts.
    if (response.status() === 404 && request.resourceType() === 'document' && new URL(response.url()).pathname.startsWith(PREFIX)) return;
    if (response.url().endsWith('/favicon.ico')) return;
    errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
}

async function settle(page: Page): Promise<void> {
  await page.locator('.loading-screen').waitFor({ state: 'hidden', timeout: 12000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
}

async function main(): Promise<void> {
  assert(fs.existsSync(path.join(ARTIFACT, 'index.html')), 'Run npm run build:pages first');
  const backendPort = await freePort();
  await startBackend(backendPort);
  const origin = await startFrontend(backendPort);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  watch(page);

  await page.goto(`${origin}${PREFIX}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.locator('.hero').waitFor({ timeout: 12000 });
  assert(await page.locator('.product-card').count() > 0, 'The real catalog must render under the Pages base path');
  assert(await page.locator('[data-testid="water-surface"] canvas').count() === 1, 'The water animation must mount');
  await page.waitForFunction(() => {
    const img = document.querySelector('.hero-media img') as HTMLImageElement | null;
    return Boolean(img?.complete && img.naturalWidth > 0);
  }, null, { timeout: 10000 });
  const heroPath = await page.locator('.hero-media img').getAttribute('src');
  assert(heroPath?.startsWith(`${PREFIX}media/seed/`), `Hero media must use the project base: ${heroPath}`);
  const cssPaths = await page.locator('link[rel="stylesheet"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
  assert(cssPaths.length > 0 && cssPaths.every((p) => p?.startsWith(`${PREFIX}assets/`)), 'Built CSS must use the project base');
  console.log('✓ Project-path homepage, CSS, water, products and bundled images load');

  const rail = page.locator('.liquid-rail').first();
  await rail.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await rail.hover({ force: true });
  const heart = rail.locator('.product-wish').first();
  await heart.click({ force: true });
  await page.waitForFunction(() => document.querySelector('.product-wish')?.getAttribute('aria-pressed') === 'true', null, { timeout: 6000 });
  assert(Boolean(await page.evaluate(() => localStorage.getItem('zzkd.wishlist.guest'))), 'Guest wishlist must work');
  const product = rail.locator('a.product-media').first();
  const href = await product.getAttribute('href');
  assert(href?.startsWith(`${PREFIX}product/`), `Product link must include project prefix: ${href}`);
  await product.click({ force: true });
  await page.waitForURL((url) => url.pathname.startsWith(`${PREFIX}product/`), { timeout: 10000 });
  await page.locator('.detail-title').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /360° VIEW/ }).click();
  const viewer = page.getByRole('dialog', { name: /360 degree viewer/i });
  await viewer.waitFor();
  await viewer.getByText(/ANGLE 1 \/ 8/).waitFor({ timeout: 10000 });
  await viewer.getByRole('button', { name: 'Close 360 degree viewer' }).click();
  console.log('✓ Wishlist, product navigation and 360° viewer work with the local API');

  await page.goto(`${origin}${href}?from=pages#details`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === href && url.search === '?from=pages' && url.hash === '#details', { timeout: 12000 });
  await page.locator('.detail-title').waitFor({ timeout: 10000 });
  assert(await page.locator('.detail-title').count() === 1, 'Direct product route must survive the Pages 404 redirect');
  await page.getByRole('link', { name: /Buy Now/i }).first().click();
  await page.waitForURL((url) => url.pathname === `${PREFIX}checkout` || url.pathname === `${PREFIX}login`, { timeout: 10000 });
  console.log('✓ Deep links retain query/hash and BUY NOW routes under the project path');

  const phone = await browser.newPage({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  watch(phone);
  await phone.goto(`${origin}${PREFIX}`, { waitUntil: 'domcontentloaded' });
  await settle(phone);
  await phone.locator('.hero').waitFor({ timeout: 12000 });
  const metrics = await phone.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert(metrics.width <= metrics.viewport + 2, `Mobile horizontal overflow: ${metrics.width} > ${metrics.viewport}`);
  await phone.getByRole('button', { name: 'Open menu' }).click();
  await phone.locator('.mobile-nav').getByRole('link', { name: 'All Pieces' }).click();
  await phone.waitForURL((url) => url.pathname === `${PREFIX}shop`, { timeout: 10000 });
  await phone.locator('.product-card').first().waitFor({ timeout: 10000 });
  console.log('✓ Android-sized navigation and layout work under the project path');

  assert(errors.length === 0, `Unexpected runtime or missing-asset errors:\n${errors.join('\n')}`);
  console.log('ALL PROJECT-PATH CHECKS PASSED (local test proxy; not a live GitHub Pages backend)');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  console.error(backendLogs.slice(-2000));
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  if (frontend) await new Promise<void>((resolve) => frontend!.close(() => resolve()));
  if (backend && backend.exitCode === null) {
    backend.kill('SIGTERM');
    await Promise.race([new Promise<void>((resolve) => backend!.once('exit', () => resolve())), delay(3000)]);
    if (backend.exitCode === null) backend.kill('SIGKILL');
  }
  fs.rmSync(temp, { recursive: true, force: true });
});
