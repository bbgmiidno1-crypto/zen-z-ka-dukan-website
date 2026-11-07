import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { AdminUser, PublicUser } from '../shared/types';
import { config } from './config';
import { randomToken, sha256 } from './crypto';
import { db } from './db';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'request_error',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function wrap(handler: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function requireClientHeader(req: Request, _res: Response, next: NextFunction): void {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (unsafe && req.get('x-zzkd-client') !== '1') {
    next(new HttpError(403, 'This API request must originate from the ZEN Z KA DUKAN application.', 'csrf_rejected'));
    return;
  }
  if (req.get('sec-fetch-site') === 'cross-site') {
    next(new HttpError(403, 'Cross-site API requests are not permitted.', 'csrf_rejected'));
    return;
  }
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function authLimiter(maxAttempts = 8, windowMs = 15 * 60 * 1000): RequestHandler {
  return (req, _res, next) => {
    const identity = String(req.body?.mobile || req.body?.username || '').toLowerCase();
    const key = `${req.ip || 'unknown'}:${req.path}:${identity}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxAttempts) {
      next(new HttpError(429, 'Too many attempts. Please try again in a few minutes.', 'rate_limited'));
      return;
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

// Give embedded-preview cookies their own names so a legacy first-party cookie cannot
// shadow a new partitioned cookie when both happen to exist in the same browser.
const cookieNames = config.cookiePartitioned
  ? { customer: 'zzkd_customer_embed', admin: 'zzkd_admin_embed' } as const
  : { customer: 'zzkd_customer', admin: 'zzkd_admin' } as const;

type SessionType = keyof typeof cookieNames;

function cookieOptions(req: Request) {
  const partitioned = config.cookiePartitioned;
  return {
    httpOnly: true,
    signed: true,
    // Cross-site embeds need SameSite=None and Secure; Partitioned confines the
    // session to the embedding site's cookie partition. Normal sessions stay Lax.
    sameSite: partitioned ? 'none' as const : 'lax' as const,
    secure: partitioned || (config.cookieSecure ?? req.secure),
    partitioned: partitioned || undefined,
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  };
}

export function createSession(req: Request, res: Response, type: SessionType, userId: number, maxAgeMs?: number): string {
  const token = randomToken();
  const now = Date.now();
  const maxAge = maxAgeMs ?? config.sessionDays * 24 * 60 * 60 * 1000;
  db.prepare(
    `INSERT INTO sessions (token_hash, user_type, user_id, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sha256(token), type, userId, now + maxAge, now, now);
  res.cookie(cookieNames[type], token, { ...cookieOptions(req), maxAge });
  return token;
}

function sessionToken(req: Request, type: SessionType): string | null {
  // Preview-only fallback for platforms that strip every cookie. The opaque token
  // stays in browser memory, is never placed in a URL or persistent storage, and
  // is accepted only for same-origin application requests. Production stays cookie-only.
  if (type === 'admin' && config.previewAdminHeaderSession &&
      req.get('x-zzkd-client') === '1' && req.get('sec-fetch-site') === 'same-origin') {
    const token = req.get('x-zzkd-admin-preview-session');
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) return token;
  }
  const token = req.signedCookies?.[cookieNames[type]];
  return typeof token === 'string' && token ? token : null;
}

export function readSession(req: Request, type: SessionType): PublicUser | AdminUser | null {
  const token = sessionToken(req, type);
  if (!token) return null;
  const now = Date.now();
  const session = db
    .prepare(
      `SELECT id, user_id FROM sessions
       WHERE token_hash = ? AND user_type = ? AND revoked_at IS NULL AND expires_at > ?`,
    )
    .get(sha256(token), type, now) as { id: number; user_id: number } | undefined;
  if (!session) return null;
  if (type === 'customer') {
    const user = db
      .prepare('SELECT id, name, mobile, created_at FROM customers WHERE id = ?')
      .get(session.user_id) as Record<string, unknown> | undefined;
    if (!user) return null;
    return {
      id: Number(user.id),
      name: user.name ? String(user.name) : null,
      mobile: String(user.mobile),
      createdAt: Number(user.created_at),
    } satisfies PublicUser;
  }
  const user = db
    .prepare('SELECT id, username, created_at FROM admins WHERE id = ?')
    .get(session.user_id) as Record<string, unknown> | undefined;
  if (!user) return null;
  return {
    id: Number(user.id),
    username: String(user.username),
    createdAt: Number(user.created_at),
  } satisfies AdminUser;
}

export function revokeSession(req: Request, res: Response, type: SessionType): void {
  const token = sessionToken(req, type);
  if (token) {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(
      Date.now(),
      sha256(token),
    );
  }
  const options = cookieOptions(req);
  // Partitioned cookies must be cleared in the same partition in which they were set.
  res.clearCookie(cookieNames[type], {
    path: options.path,
    sameSite: options.sameSite,
    secure: options.secure,
    partitioned: options.partitioned,
  });
}

export function revokeAllCustomerSessions(customerId: number): void {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_type = 'customer' AND user_id = ? AND revoked_at IS NULL").run(
    Date.now(),
    customerId,
  );
}

export const requireCustomer: RequestHandler = (req, _res, next) => {
  const customer = readSession(req, 'customer');
  if (!customer) {
    next(new HttpError(401, 'Please sign in to continue.', 'customer_auth_required'));
    return;
  }
  req.customer = customer as PublicUser;
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const admin = readSession(req, 'admin');
  if (!admin) {
    next(new HttpError(401, 'Administrator authentication is required.', 'admin_auth_required'));
    return;
  }
  req.admin = admin as AdminUser;
  next();
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Please check the highlighted information and try again.',
      code: 'validation_error',
      details: err.flatten(),
    });
    return;
  }
  if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'MulterError') {
    const multerError = err as { code?: string; message?: string };
    res.status(400).json({
      error: multerError.code === 'LIMIT_FILE_SIZE'
        ? 'Each image must be smaller than 6 MB.'
        : 'Invalid upload. Please use JPEG, PNG, WebP or AVIF images only.',
      code: 'upload_error',
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'The request body could not be read.', code: 'invalid_json' });
    return;
  }
  if (err && typeof err === 'object' && 'code' in err && String((err as { code?: string }).code).startsWith('SQLITE_CONSTRAINT')) {
    res.status(409).json({ error: 'This record conflicts with an existing entry.', code: 'conflict' });
    return;
  }
  console.error('[api-error]', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'server_error' });
}
