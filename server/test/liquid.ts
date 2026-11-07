/**
 * Focused Chromium checks for the liquid layer (water surface, floating rail, droplet click,
 * wishlist). Run with: npx tsx server/test/liquid.ts
 * A production build must exist (npm run build) and is served on port 3106.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(serverDir, '../..');
const PORT = 3106;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, 'data', 'liquid-test');
const RESULTS_DIR = path.join(ROOT, 'test-results');
let server: ChildProcess | null = null;
let browser: Browser | null = null;
const errors: string[] = [];


// A drifting rail wraps by exactly one copy width, so a plain numeric comparison can catch the
// instant of the wrap. Compare modulo the copy width instead.
function driftDelta(from: number, to: number, copyWidth: number): number {
  let delta = to - from;
  if (delta > copyWidth / 2) delta -= copyWidth;
  if (delta < -copyWidth / 2) delta += copyWidth;
  return delta;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`LIQUID ASSERTION FAILED: ${message}`);
}
function step(message: string): void {
  console.log(`\n✓ ${message}`);
}

async function startServer(): Promise<void> {
  const cli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  server = spawn(process.execPath, [cli, 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATA_DIR,
      UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
      ADMIN_BOOTSTRAP_TOKEN: 'LIQUID-TEST-TOKEN-2026',
      SESSION_SECRET: 'LIQUID-TEST-SESSION-SECRET-2026',
      COOKIE_SECURE: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch { /* starting */ }
    await delay(250);
  }
  throw new Error('Liquid-test server did not start');
}

function watch(page: import('playwright').Page, label: string): void {
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('net::ERR_ABORTED') || text.includes('favicon')) return;
    errors.push(`${label} console: ${text}`);
  });
}

async function settle(page: import('playwright').Page): Promise<void> {
  const loader = page.locator('.loading-screen');
  await loader.waitFor({ state: 'hidden', timeout: 12000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
  await delay(900);
}

async function main(): Promise<void> {
  assert(fs.existsSync(path.join(ROOT, 'dist', 'index.html')), 'Run npm run build first');
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  await startServer();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  /* ------------------------------------------------------------------ desktop */
  step('Water surface renders and moves');
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  watch(page, 'desktop');
  // The colour probe uses readPixels (a GPU stall), so it is enabled only for this suite.
  await page.addInitScript(() => { (window as Window & { __zzkdProbe?: boolean }).__zzkdProbe = true; });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page);

  const water = page.locator('[data-testid="water-surface"]');
  await water.waitFor();
  const waterState = await water.evaluate((node) => ({
    mode: node.getAttribute('data-water'),
    canvasWidth: (node.querySelector('canvas') as HTMLCanvasElement).width,
    zIndex: getComputedStyle(node).zIndex,
    position: getComputedStyle(node).position,
  }));
  assert(waterState.mode === 'webgl' || waterState.mode === 'canvas', `water must render via WebGL or the canvas fallback, got ${waterState.mode}`);
  assert(waterState.canvasWidth > 100, 'water canvas must be sized');
  assert(waterState.position === 'fixed', 'water surface must be a fixed background layer');

  // The surface reports its own frame clock and sampled colour (see WaterSurface probes).
  const probe = async (): Promise<{ frames: number; ripples: number; rgb: number[] }> => water.evaluate((node) => ({
    frames: Number(node.getAttribute('data-frames') || 0),
    ripples: Number(node.getAttribute('data-ripples') || 0),
    rgb: (node.getAttribute('data-probe') || '0,0,0').split(',').map(Number),
  }));
  const before = await probe();
  await delay(1400);
  const after = await probe();
  assert(after.frames > before.frames + 500, `the water surface must keep rendering frames (${before.frames} → ${after.frames})`);
  const [red, green, blue] = after.rgb;
  assert(red > blue && green >= blue - 2, `water must stay in the brown/gold family, sampled rgb(${red}, ${green}, ${blue})`);
  assert(red > 8, `the surface must actually paint colour, sampled rgb(${red}, ${green}, ${blue})`);

  step('Floating rail drifts right to left, wraps seamlessly and slows on hover');
  const rail = page.locator('.liquid-rail').first();
  await rail.scrollIntoViewIfNeeded();
  const transformOf = () => rail.locator('.liquid-track').evaluate((node) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return matrix.m41;
  });
  const copyWidth = await rail.locator('.liquid-copy').first().evaluate((node) => node.getBoundingClientRect().width);
  const t1 = await transformOf();
  await delay(1200);
  const t2 = await transformOf();
  assert(driftDelta(t1, t2, copyWidth) < 0, `products must travel right to left (from ${t1} to ${t2})`);

  const copies = await rail.locator('.liquid-copy').count();
  assert(copies === 2, 'the rail must render two copies for a seamless loop');
  const seamless = await rail.evaluate((node) => {
    const track = node.querySelector('.liquid-track') as HTMLElement;
    const copy = node.querySelector('.liquid-copy') as HTMLElement;
    const viewport = node.getBoundingClientRect();
    const trackBox = track.getBoundingClientRect();
    return {
      trackWidth: trackBox.width,
      copyWidth: copy.getBoundingClientRect().width,
      viewportWidth: viewport.width,
      trackRightCovers: trackBox.right >= viewport.right - 1,
    };
  });
  assert(Math.abs(seamless.trackWidth - seamless.copyWidth * 2) < 4, 'the track must equal two identical copies');
  assert(seamless.trackRightCovers, 'the second copy must always cover the right edge (no gap on wrap)');

  // Wrap: force a big jump by waiting for the modulo. Instead, verify offset stays in range and never resets visibly.
  const samples: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    samples.push(await transformOf());
    await delay(200);
  }
  assert(samples.every((value) => value <= 0.5 && value >= -seamless.copyWidth - 5), `rail offset must stay wrapped, got ${samples.join(', ')}`);

  await rail.hover();
  const hoverStart = await transformOf();
  await delay(900);
  const hoverEnd = await transformOf();
  const freeStart = hoverStart;
  const slowRate = Math.abs(hoverEnd - freeStart);
  await page.mouse.move(5, 5);
  // Wait out the 1.4s interaction window plus the easing ramp before measuring free drift.
  await delay(2400);
  const freeA = await transformOf();
  await delay(900);
  const freeB = await transformOf();
  const freeRate = Math.abs(freeB - freeA);
  assert(slowRate < freeRate, `interaction must slow the rail (hover ${slowRate.toFixed(1)}px vs free ${freeRate.toFixed(1)}px)`);
  assert(slowRate > 0, 'the rail must keep drifting slowly while interacting, never stop dead');

  step('Pointer creates independent ripples');
  // NOTE: no inner helper functions inside evaluate — tsx rewrites them into a __name wrapper
  // that does not exist in the page context.
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: window.innerWidth * 0.3, clientY: window.innerHeight * 0.4, pointerType: 'touch', pointerId: 11 }));
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: window.innerWidth * 0.7, clientY: window.innerHeight * 0.6, pointerType: 'touch', pointerId: 12 }));
  });
  const rippleState = await page.evaluate(async () => {
    const node = document.querySelector('[data-testid="water-surface"]')!;
    const samples: number[] = [];
    for (let index = 0; index < 14; index += 1) {
      samples.push(Number(node.getAttribute('data-ripples') || 0));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return Math.max(...samples);
  });
  assert(rippleState >= 2, `two independent touches must create two ripples, saw ${rippleState}`);

  step('Product click fires the water droplet and still navigates');
  const card = rail.locator('.liquid-card .product-card').first();
  await rail.hover();
  const cardLink = card.locator('a.product-media').first();
  const href = await cardLink.getAttribute('href');
  assert(href?.startsWith('/product/'), 'product card must link to a product page');
  // Observe DOM insertion: the droplet is removed after ~1.15s, and a route change re-renders.
  await page.evaluate(() => {
    (window as unknown as { __droplets: number }).__droplets = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && (node.classList.contains('water-droplet') || node.querySelector('.water-droplet'))) {
            (window as unknown as { __droplets: number }).__droplets += 1;
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await cardLink.click();
  await delay(400);
  const droplet = await page.evaluate(() => (window as unknown as { __droplets: number }).__droplets);
  await page.waitForURL((url) => url.pathname === href!, { timeout: 8000 });
  assert(droplet >= 1, 'a droplet must fall on the clicked product');
  await page.screenshot({ path: path.join(RESULTS_DIR, 'desktop-product-page.png') });
  await settle(page);
  assert(await page.locator('.detail-title').count() === 1, 'the product page must still load after the droplet transition');

  step('Wishlist works for a guest, then persists for the customer');
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const homeRail = page.locator('.liquid-rail').first();
  await homeRail.scrollIntoViewIfNeeded();
  await homeRail.hover();
  const firstWish = page.locator('.product-wish').first();
  assert(await firstWish.getAttribute('aria-pressed') === 'false', 'hearts start unpressed');
  await firstWish.click();
  await page.waitForFunction(() => document.querySelector('.product-wish')?.getAttribute('aria-pressed') === 'true', null, { timeout: 4000 });
  const guestStored = await page.evaluate(() => window.localStorage.getItem('zzkd.wishlist.guest'));
  assert(guestStored && guestStored.includes('1'), 'a guest heart must be stored on the device');
  assert(await page.locator('.nav-wish .wish-count').count() === 1, 'the navbar must show the wishlist count');

  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const mobile = `9${String(Math.floor(Math.random() * 900000000) + 100000000)}`;
  await page.getByLabel('Mobile number').fill(mobile);
  await page.getByLabel('Password', { exact: true }).fill('LiquidWater2026!');
  await page.getByLabel('Confirm password').fill('LiquidWater2026!');
  await page.getByRole('button', { name: /Create Account/ }).click();
  const overlay = page.getByRole('dialog', { name: 'Save your recovery code' });
  await overlay.waitFor();
  await overlay.getByRole('checkbox', { name: /I have securely saved/ }).check();
  await overlay.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL((url) => url.pathname === '/account', { timeout: 10000 });

  const merged = await page.evaluate(async () => {
    const response = await fetch('/api/customer/wishlist', { headers: { 'X-ZZKD-Client': '1' }, credentials: 'include' });
    return response.json();
  });
  assert(Array.isArray(merged.productIds) && merged.productIds.length >= 1, 'the guest heart must merge into the new account');
  await page.goto(`${BASE}/account?tab=wishlist`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.locator('.wish-row').first().waitFor({ timeout: 8000 });
  assert(await page.locator('.wish-row').count() >= 1, 'the wishlist panel must list the saved piece');
  await page.screenshot({ path: path.join(RESULTS_DIR, 'desktop-wishlist.png') });

  // Persist across a full reload and a server restart.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page);
  const afterReload = await page.evaluate(async () => {
    const response = await fetch('/api/customer/wishlist', { headers: { 'X-ZZKD-Client': '1' }, credentials: 'include' });
    return response.json();
  });
  assert(afterReload.productIds.length === merged.productIds.length, 'wishlist must survive a reload');

  /* ------------------------------------------------------------------ mobile */
  step('Android-sized viewport: touch ripples, usable rail, no horizontal scroll');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    storageState: await desktop.storageState(),
  });
  const phone = await mobileContext.newPage();
  watch(phone, 'mobile');
  await phone.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(phone);
  const mobileMetrics = await phone.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    waterMode: document.querySelector('[data-testid="water-surface"]')?.getAttribute('data-water'),
    canvasWidth: (document.querySelector('[data-testid="water-surface"] canvas') as HTMLCanvasElement).width,
  }));
  assert(mobileMetrics.scrollWidth <= mobileMetrics.viewport + 2, `mobile must not scroll horizontally (${mobileMetrics.scrollWidth} > ${mobileMetrics.viewport})`);
  assert(mobileMetrics.waterMode === 'webgl' || mobileMetrics.waterMode === 'canvas', 'mobile keeps a water surface');
  assert(mobileMetrics.canvasWidth < 700, `mobile must render the surface at reduced resolution, got ${mobileMetrics.canvasWidth}px`);

  const mobileRail = phone.locator('.liquid-rail').first();
  await mobileRail.scrollIntoViewIfNeeded();
  const mobileRailState = await mobileRail.evaluate((node) => ({
    active: node.getAttribute('data-active'),
    trackWidth: (node.querySelector('.liquid-track') as HTMLElement).getBoundingClientRect().width,
  }));
  assert(mobileRailState.active === 'true', 'the rail must animate on mobile too');
  const mobileCopyWidth = await mobileRail.locator('.liquid-copy').first().evaluate((node) => node.getBoundingClientRect().width);
  const m1 = await mobileRail.locator('.liquid-track').evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41);
  await delay(1100);
  const m2 = await mobileRail.locator('.liquid-track').evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41);
  assert(driftDelta(m1, m2, mobileCopyWidth) < 0, 'the mobile rail must drift right to left');

  // Touch ripple on the hero.
  const touchRipple = await phone.evaluate(async () => {
    const node = document.querySelector('[data-testid="water-surface"]')!;
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 120, clientY: 500, pointerId: 3 }));
    let max = 0;
    for (let index = 0; index < 14; index += 1) {
      max = Math.max(max, Number(node.getAttribute('data-ripples') || 0));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return max;
  });
  assert(touchRipple >= 1, `a touch must ripple the surface on mobile, saw ${touchRipple}`);
  await phone.screenshot({ path: path.join(RESULTS_DIR, 'mobile-liquid-home.png') });

  // Tap a product on the phone: droplet + navigation.
  const phoneCard = phone.locator('.liquid-card .product-media').first();
  await phoneCard.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  const phoneHref = await phoneCard.getAttribute('href');
  // A finger taps a gently floating card; the bob is paused on touch-down, so force only skips
  // Playwright's "must be perfectly still" gate, not the real event dispatch.
  await phoneCard.tap({ force: true });
  await phone.waitForURL((url) => url.pathname === phoneHref!, { timeout: 9000 });
  await settle(phone);
  assert(await phone.locator('h1.detail-title, .detail-title').count() >= 1, 'touch tap must open the product page');
  const phoneOverflow = await phone.evaluate(() => ({ viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(phoneOverflow.scrollWidth <= phoneOverflow.viewport + 2, 'the product page must not overflow on mobile');
  await phone.screenshot({ path: path.join(RESULTS_DIR, 'mobile-product-liquid.png') });

  /* ------------------------------------------------------------------ reduced motion */
  step('prefers-reduced-motion: still surface, still rail, full functionality');
  const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const reduced = await reducedContext.newPage();
  watch(reduced, 'reduced');
  await reduced.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(reduced);
  const reducedState = await reduced.evaluate(() => {
    const surface = document.querySelector('[data-testid="water-surface"]');
    const rail = document.querySelector('.liquid-rail');
    return {
      water: surface?.getAttribute('data-water'),
      railActive: rail?.getAttribute('data-active'),
      railOverflow: rail ? getComputedStyle(rail).overflowX : '',
    };
  });
  assert(reducedState.water === 'static', `reduced motion must stop the water animation, got ${reducedState.water}`);
  assert(reducedState.railActive === 'false', 'reduced motion must stop the floating rail');
  assert(reducedState.railOverflow === 'auto', 'reduced motion must keep the products reachable by scrolling');
  const reducedProducts = await reduced.locator('.liquid-card .product-card').count();
  assert(reducedProducts > 0, 'products must still be listed with reduced motion');

  assert(errors.length === 0, `console/page errors:\n${errors.join('\n')}`);
  console.log('\n========================================');
  console.log('ALL LIQUID LAYER CHECKS PASSED');
  console.log('========================================');
  console.log(`Water mode: ${waterState.mode}`);
  console.log(`Mobile surface: ${mobileMetrics.canvasWidth}px wide, rail drift verified`);
  console.log(`Screenshots: ${RESULTS_DIR}`);
}

main()
  .catch((error) => {
    console.error('\nLIQUID TEST FAILURE:', error instanceof Error ? error.stack : error);
    if (errors.length) console.error('\nConsole errors:\n', errors.join('\n'));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit').then(() => undefined);
      server.kill('SIGTERM');
      await Promise.race([exited, delay(4000)]);
    }
  });
