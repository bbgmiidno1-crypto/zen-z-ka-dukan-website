import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { chromium, type Browser, type BrowserContext, type Frame } from 'playwright';

// Uses an isolated database and a genuinely cross-site iframe (localhost embeds
// 127.0.0.1). Never uses or changes the preview's administrator or live data.
const ROOT = process.cwd();
const TEMP_DIR = mkdtempSync(path.join(os.tmpdir(), 'zzkd-preview-auth-'));
const TOKEN = 'isolated-preview-auth-bootstrap-token-123';
const USERNAME = 'preview_auth_test';
const PASSWORD = 'PreviewTestPassword42';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function freePort(): Promise<number> {
  const socket = net.createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Unable to allocate a test port');
  const port = address.port;
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

async function startApp(partitioned: boolean, memoryFallback = false, reusePort?: number): Promise<{ child: ChildProcessWithoutNullStreams; base: string; dataDir: string }> {
  const port = reusePort ?? await freePort();
  const dataDir = path.join(TEMP_DIR, memoryFallback ? 'memory' : partitioned ? 'partitioned' : 'standard');
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      ADMIN_BOOTSTRAP_TOKEN: TOKEN,
      SESSION_SECRET: 'isolated-preview-auth-session-secret-not-used-in-production',
      COOKIE_SECURE: 'false',
      COOKIE_PARTITIONED: String(partitioned),
      PREVIEW_ADMIN_HEADER_SESSION: String(memoryFallback),
    },
    stdio: 'pipe',
  });
  let logs = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test server failed to start: ${logs}`)), 30000);
    child.stdout.on('data', (buffer: Buffer) => {
      logs += buffer.toString();
      if (logs.includes('ready on port')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (buffer: Buffer) => { logs += buffer.toString(); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Test server exited (${code}): ${logs}`));
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  return { child, base: `http://127.0.0.1:${port}`, dataDir };
}

async function stopApp(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function setup(frame: Frame): Promise<void> {
  await frame.getByLabel('Private bootstrap token').fill(TOKEN);
  await frame.getByLabel('Administrator username').fill(USERNAME);
  await frame.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await frame.getByLabel('Confirm password').fill(PASSWORD);
  await frame.getByRole('button', { name: 'Create administrator' }).click();
}

async function login(frame: Frame): Promise<void> {
  await frame.getByLabel('Administrator username').fill(USERNAME);
  await frame.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await frame.getByRole('button', { name: 'Enter console' }).click();
}

async function frameFor(context: BrowserContext, base: string, route: string) {
  const parent = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><iframe title="Store preview" src="${base}${route}" style="width:100vw;height:100vh;border:0"></iframe></body></html>`);
  });
  await new Promise<void>((resolve) => parent.listen(0, '127.0.0.1', resolve));
  const address = parent.address();
  if (!address || typeof address === 'string') throw new Error('Preview parent server did not start');
  const page = await context.newPage();
  await page.goto(`http://localhost:${address.port}/`, { waitUntil: 'domcontentloaded' });
  const element = await page.locator('iframe').elementHandle();
  const frame = await element?.contentFrame();
  if (!frame) throw new Error('Preview frame did not load');
  return { page, frame, close: () => new Promise<void>((resolve) => parent.close(() => resolve())) };
}

async function testStandardFallback(browser: Browser): Promise<void> {
  const { child, base } = await startApp(false);
  let context: BrowserContext | undefined;
  let embedded: Awaited<ReturnType<typeof frameFor>> | undefined;
  try {
    context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    embedded = await frameFor(context, base, '/admin/setup');
    await setup(embedded.frame);
    await embedded.frame.getByRole('alert').waitFor({ timeout: 20000 });
    const message = await embedded.frame.getByRole('alert').innerText();
    assert(message.includes('account was created') && message.includes('new tab'), 'Blocked setup must clearly say the account was created and offer a new tab');
    assert(await embedded.frame.getByRole('button', { name: 'Create administrator' }).isDisabled(), 'Setup must not allow a duplicate account attempt after successful creation');
    assert(await embedded.frame.getByRole('link', { name: /Open administrator sign-in in a new tab/ }).count() === 1, 'Blocked setup must offer a standalone login link');

    // Opening the exact same app top-level uses the ordinary SameSite=Lax cookie.
    const standalone = await context.newPage();
    await standalone.goto(`${base}/admin/login`, { waitUntil: 'domcontentloaded' });
    await login(standalone.mainFrame());
    await standalone.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
    await standalone.locator('.admin-content').waitFor({ timeout: 20000 });
    const standardCookie = (await context.cookies(base)).find((cookie) => cookie.name === 'zzkd_admin');
    assert(standardCookie?.sameSite === 'Lax' && !standardCookie.secure, 'Ordinary HTTP development sessions must keep their existing Lax cookie');
    await standalone.close();
    await embedded.page.close();
    await embedded.close();
    embedded = undefined;
    await context.close();
    context = undefined;

    // With all third-party cookies blocked, correct credentials must never silently
    // loop or show a misleading success message.
    context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    embedded = await frameFor(context, base, '/admin/login');
    await login(embedded.frame);
    await embedded.frame.getByRole('alert').waitFor({ timeout: 20000 });
    assert((await embedded.frame.getByRole('alert').innerText()).includes('secure session could not be kept'), 'Blocked sign-in must explain the session problem');
    assert(await embedded.frame.getByRole('link', { name: /Open administrator sign-in in a new tab/ }).count() === 1, 'Blocked sign-in must offer a standalone login link');
    const disabled = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-zzkd-client': '1', 'sec-fetch-site': 'same-origin', 'origin': base, 'x-zzkd-admin-session-mode': 'memory' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    assert(disabled.status === 403, 'Memory-session mode must be disabled by default');
    console.log('✓ Standard cookie security preserved; blocked embedded setup and login give a clear recovery path');
  } finally {
    await embedded?.page.close();
    await embedded?.close();
    await context?.close();
    await stopApp(child);
  }
}

async function testPartitionedPreview(browser: Browser): Promise<void> {
  const { child, base } = await startApp(true);
  let context: BrowserContext | undefined;
  let embedded: Awaited<ReturnType<typeof frameFor>> | undefined;
  try {
    context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    embedded = await frameFor(context, base, '/admin/setup');
    await setup(embedded.frame);
    await embedded.frame.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
    await embedded.frame.locator('.admin-content').waitFor({ timeout: 20000 });
    let cookie = (await context.cookies(base)).find((item) => item.name === 'zzkd_admin_embed');
    assert(cookie?.sameSite === 'None' && cookie.secure && !!cookie.partitionKey, 'Embedded admin cookie must be Secure, SameSite=None and partitioned');

    // A reload must restore the server-side session in the same embedding partition.
    await embedded.page.reload({ waitUntil: 'domcontentloaded' });
    const reloadedElement = await embedded.page.locator('iframe').elementHandle();
    const reloadedFrame = await reloadedElement?.contentFrame();
    assert(reloadedFrame, 'Preview frame must be present after reload');
    embedded.frame = reloadedFrame;
    await embedded.frame.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
    await embedded.frame.locator('.admin-content').waitFor({ timeout: 20000 });
    await embedded.frame.locator('.admin-sidebar-bottom').getByRole('button', { name: 'Sign out' }).click();
    await embedded.frame.waitForURL((url) => url.pathname === '/admin/login', { timeout: 20000 });
    cookie = (await context.cookies(base)).find((item) => item.name === 'zzkd_admin_embed');
    assert(!cookie, 'Signing out must clear the partitioned admin cookie');
    await login(embedded.frame);
    await embedded.frame.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
    await embedded.frame.locator('.admin-content').waitFor({ timeout: 20000 });

    // Customer sessions use the same cookie mechanism and must coexist with the
    // admin session without signing either role out. This data is disposable.
    const customerCheck = await embedded.frame.evaluate(async ({ mobile, password }) => {
      const headers = { 'Content-Type': 'application/json', 'X-ZZKD-Client': '1' };
      const registration = await fetch('/api/auth/register', {
        method: 'POST', credentials: 'include', headers,
        body: JSON.stringify({ mobile, password, confirmPassword: password }),
      });
      const before = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
      const logout = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers });
      const after = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
      return { registration: registration.status, hadCustomer: !!before.customer, hadAdmin: !!before.admin, logout: logout.status, customerAfter: !!after.customer, adminAfter: !!after.admin };
    }, { mobile: '9876543210', password: 'CustomerTestPassword42' });
    assert(customerCheck.registration === 201 && customerCheck.hadCustomer && customerCheck.hadAdmin, 'Embedded customer and admin sessions must coexist');
    assert(customerCheck.logout === 200 && !customerCheck.customerAfter && customerCheck.adminAfter, 'Customer logout must preserve the admin session');

    // An embedded cookie is isolated from the top-level site's partition, but
    // signing in directly must still work in a normal browser tab.
    const standalone = await context.newPage();
    await standalone.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    await standalone.waitForURL((url) => url.pathname === '/admin/login', { timeout: 20000 });
    await login(standalone.mainFrame());
    await standalone.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
    await standalone.locator('.admin-content').waitFor({ timeout: 20000 });
    await standalone.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    });
    let mobileEmbed: Awaited<ReturnType<typeof frameFor>> | undefined;
    try {
      mobileEmbed = await frameFor(mobile, base, '/admin/login');
      const mobileWidth = await mobileEmbed.frame.evaluate(() => window.innerWidth);
      assert(mobileWidth <= 400, 'Mobile preview must run in a genuine narrow viewport');
      await login(mobileEmbed.frame);
      await mobileEmbed.frame.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
      await mobileEmbed.frame.locator('.admin-content').waitFor({ timeout: 20000 });
    } finally {
      await mobileEmbed?.page.close();
      await mobileEmbed?.close();
      await mobile.close();
    }

    // An explicit cross-site request is still rejected by the existing CSRF guard.
    const csrf = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-zzkd-client': '1', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    assert(csrf.status === 403, 'Cross-site API requests must remain blocked');
    console.log('✓ Embedded admin setup, reload, logout and login work with third-party cookies blocked');
    console.log('✓ Embedded customer/admin sessions coexist; logout and CSRF protections remain intact');
  } finally {
    await embedded?.page.close();
    await embedded?.close();
    await context?.close();
    await stopApp(child);
  }
}

async function testCookieStrippingPreview(browser: Browser): Promise<void> {
  const initial = await startApp(true, true);
  let child = initial.child;
  const { base, dataDir } = initial;
  let context: BrowserContext | undefined;
  let embedded: Awaited<ReturnType<typeof frameFor>> | undefined;
  try {
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const wire: string[] = [];
    // Emulate a preview proxy which strips *all* Cookie and Set-Cookie headers,
    // not just the browser blocking ordinary third-party cookies.
    await context.route('**/api/**', async (route) => {
      const request = route.request();
      const outgoing = await request.allHeaders();
      if (request.url().includes('/api/admin/login')) wire.push(JSON.stringify({ fetchSite: outgoing['sec-fetch-site'], origin: outgoing.origin, mode: outgoing['x-zzkd-admin-session-mode'] }));
      for (const key of ['cookie', 'host', 'content-length', 'accept-encoding', 'connection']) delete outgoing[key];
      // Playwright's intercepted headers omit Fetch Metadata, so supply the
      // same-origin value that the real browser attaches to these requests.
      outgoing['sec-fetch-site'] = 'same-origin';
      // Node fetch has no browser cookie jar, unlike route.fetch(), so the
      // upstream Set-Cookie cannot leak into this Playwright context.
      try {
        const upstream = await fetch(request.url(), {
          method: request.method(),
          headers: outgoing,
          body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postData() ?? undefined,
          redirect: 'manual',
        });
        const headers = Object.fromEntries(upstream.headers.entries());
        for (const key of ['set-cookie', 'content-length', 'content-encoding', 'transfer-encoding']) delete headers[key];
        await route.fulfill({ status: upstream.status, headers, body: Buffer.from(await upstream.arrayBuffer()) });
      } catch {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Test backend temporarily unavailable"}' });
      }
    });
    embedded = await frameFor(context, base, '/admin/setup');
    let capturedToken: string | undefined;
    const events: string[] = [];
    embedded.page.on('request', (request) => {
      const candidate = request.headers()['x-zzkd-admin-preview-session'];
      if (candidate) capturedToken = candidate;
      if (request.url().includes('/api/')) events.push(`${request.method()} ${new URL(request.url()).pathname} memory=${request.headers()['x-zzkd-admin-session-mode'] === 'memory'} header=${Boolean(candidate)}`);
    });
    embedded.page.on('response', (response) => {
      if (response.url().includes('/api/')) events.push(`response ${new URL(response.url()).pathname} ${response.status()}`);
    });
    await setup(embedded.frame);
    try {
      await embedded.frame.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
      await embedded.frame.locator('.admin-content').waitFor({ timeout: 20000 });
    } catch (error) {
      const alert = await embedded.frame.getByRole('alert').innerText().catch(() => 'no alert');
      const secure = await embedded.frame.evaluate(() => window.isSecureContext).catch(() => false);
      console.error('Preview fallback diagnostics:', JSON.stringify({ alert, secure, events, wire }));
      throw error;
    }
    assert((await context.cookies(base)).length === 0, 'Cookie-stripping test must not retain a session cookie');
    assert(capturedToken && /^[A-Za-z0-9_-]{43}$/.test(capturedToken), 'A short-lived in-memory session header must be used');
    const token = capturedToken;

    const stored = await embedded.frame.evaluate((value) => {
      try {
        return Object.values(localStorage).some((item) => item.includes(value)) ||
          Object.values(sessionStorage).some((item) => item.includes(value));
      } catch { return false; }
    }, token);
    assert(!stored, 'Preview session token must never be stored in localStorage or sessionStorage');
    const database = new Database(path.join(dataDir, 'zen.db'), { readonly: true, fileMustExist: true });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = database.prepare('SELECT created_at, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash) as { created_at: number; expires_at: number } | undefined;
    database.close();
    assert(row && row.expires_at - row.created_at === 30 * 60 * 1000, 'Preview bearer session must expire after 30 minutes');

    const sessionResponse = await fetch(`${base}/api/auth/session`);
    assert((sessionResponse.headers.get('cache-control') || '').includes('no-store'), 'Session responses must not be cached');
    const headers = { 'x-zzkd-client': '1', 'sec-fetch-site': 'same-origin', 'x-zzkd-admin-preview-session': token };
    const authorized = await fetch(`${base}/api/admin/overview`, { headers });
    assert(authorized.status === 200, 'The in-memory token must authorize the matching admin session');
    // Restarting the backend must not revoke a still-live in-memory browser token:
    // its hash and expiration are stored in the same persistent test database.
    await embedded.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
    await stopApp(child);
    child = (await startApp(true, true, Number(new URL(base).port))).child;
    const afterRestart = await fetch(`${base}/api/admin/overview`, { headers });
    assert(afterRestart.status === 200, 'A live preview token must survive a backend restart');
    const crossSite = await fetch(`${base}/api/admin/overview`, { headers: { ...headers, 'sec-fetch-site': 'cross-site' } });
    assert(crossSite.status === 403, 'The in-memory session must not bypass cross-site request protection');
    const withoutClientHeader = await fetch(`${base}/api/admin/overview`, { headers: { 'sec-fetch-site': 'same-origin', 'x-zzkd-admin-preview-session': token } });
    assert(withoutClientHeader.status === 401, 'The in-memory token must require the application header');

    const plain = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-zzkd-client': '1', 'origin': base, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    const plainResult = await plain.json() as { previewSessionToken?: string };
    assert(plain.status === 200 && !plainResult.previewSessionToken, 'Normal login must not expose a bearer token');
    const insecure = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-zzkd-client': '1', 'origin': 'http://example.test', 'sec-fetch-site': 'same-origin', 'x-zzkd-admin-session-mode': 'memory' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    assert(insecure.status === 403, 'Memory-mode login must reject insecure non-loopback origins');

    await embedded.frame.locator('.admin-topbar').getByRole('button', { name: 'Sign out' }).click();
    await embedded.frame.waitForURL((url) => url.pathname === '/admin/login', { timeout: 20000 });
    const revoked = await fetch(`${base}/api/admin/overview`, { headers });
    assert(revoked.status === 401, 'Logout must revoke the in-memory token on the server');
    await login(embedded.frame);
    await embedded.frame.waitForURL((url) => url.pathname === '/admin', { timeout: 20000 });
    await embedded.frame.locator('.admin-content').waitFor({ timeout: 20000 });
    await embedded.frame.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    await embedded.frame.waitForURL((url) => url.pathname === '/admin/login', { timeout: 20000 });
    console.log('✓ Cookie-stripping preview: admin setup, login, protected API access and logout work on a narrow mobile viewport');
    console.log('✓ Memory sessions are opt-in, same-origin, HTTPS-only outside localhost, revocable, nonpersistent and limited to 30 minutes');
  } finally {
    await embedded?.page.close();
    await embedded?.close();
    await context?.close();
    await stopApp(child);
  }
}

async function main(): Promise<void> {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('Run npm run build before the preview authentication test');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--test-third-party-cookie-phaseout'] });
  try {
    await testStandardFallback(browser);
    await testPartitionedPreview(browser);
    await testCookieStrippingPreview(browser);
    console.log('ALL PREVIEW AUTHENTICATION CHECKS PASSED');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => rmSync(TEMP_DIR, { recursive: true, force: true }));
