import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(serverDir, '..');

function absolutePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

const rawDataDir = process.env.DATA_DIR || path.join(ROOT, 'data');
const dataDir = absolutePath(rawDataDir);
const rawUploadDir = process.env.UPLOAD_DIR || path.join(dataDir, 'uploads');
const uploadDir = absolutePath(rawUploadDir);

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(path.join(uploadDir, 'products'), { recursive: true });
fs.mkdirSync(path.join(uploadDir, 'categories'), { recursive: true });
fs.mkdirSync(path.join(uploadDir, 'spin', 'admin'), { recursive: true });
fs.mkdirSync(path.join(uploadDir, 'models'), { recursive: true });
const spinUploadDir = path.join(uploadDir, 'spin');
const modelUploadDir = path.join(uploadDir, 'models');

function ensureSecret(envName: string, fileName: string): string {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  const secretPath = path.join(dataDir, fileName);
  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing) return existing;
  }
  const generated = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(secretPath, generated, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

export const sessionSecret = ensureSecret('SESSION_SECRET', 'session-secret.txt');
export const adminBootstrapToken = ensureSecret('ADMIN_BOOTSTRAP_TOKEN', 'admin-bootstrap-token.txt');

const setupNotePath = path.join(dataDir, 'admin-setup.txt');
if (!fs.existsSync(setupNotePath)) {
  fs.writeFileSync(
    setupNotePath,
    [
      'ZEN Z KA DUKAN — PRIVATE FIRST-RUN ADMIN SETUP',
      '',
      `One-time bootstrap token: ${adminBootstrapToken}`,
      '',
      'Open /admin/setup, enter this token, then choose your own administrator username',
      'and a strong password. The token is never sent to the browser by the API.',
      'This file is server-side workspace storage and is not served under /media.',
      '',
    ].join('\n'),
    { encoding: 'utf8', mode: 0o600 },
  );
}

export const config = {
  ROOT,
  dataDir,
  uploadDir,
  spinUploadDir,
  modelUploadDir,
  seedUploadDir: path.join(ROOT, 'data', 'uploads'),
  dbPath: path.join(dataDir, 'zen.db'),
  seedManifestPath: absolutePath(process.env.SEED_MANIFEST_PATH || path.join(ROOT, 'data', 'seed-manifest.json')),
  seed360ManifestPath: absolutePath(process.env.SEED_360_MANIFEST_PATH || path.join(ROOT, 'data', 'seed-360-manifest.json')),
  catalogSeedPath: path.join(ROOT, 'shared', 'catalog-seed.json'),
  frontendDist: path.join(ROOT, 'dist'),
  port: Number(process.env.PORT || 3001),
  isProduction: process.env.NODE_ENV === 'production',
  sessionSecret,
  adminBootstrapToken,
  sessionDays: 30,
  maxUploadBytes: 12 * 1024 * 1024,
  maxModelBytes: 20 * 1024 * 1024,
  maxUploadFiles: 80,
  cookieSecure: process.env.COOKIE_SECURE === 'true' ? true : undefined,
  // Opt in only for HTTPS previews embedded on a different site. Ordinary deployments
  // keep their existing first-party, SameSite=Lax cookies.
  cookiePartitioned: process.env.COOKIE_PARTITIONED === 'true',
  // Temporary opt-in for preview proxies that strip or block cookies completely.
  // Never enable this on the public production store.
  previewAdminHeaderSession: process.env.PREVIEW_ADMIN_HEADER_SESSION === 'true',
};

export type AppConfig = typeof config;
