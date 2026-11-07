import { Router } from 'express';
import type { SessionResponse } from '../../shared/types';
import { hashSecret, newRecoveryCode, randomToken, verifySecret } from '../crypto';
import { db } from '../db';
import {
  authLimiter,
  createSession,
  HttpError,
  readSession,
  requireCustomer,
  revokeAllCustomerSessions,
  revokeSession,
  wrap,
} from '../http';
import { rowToPublicUser } from '../serializers';
import {
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  regenerateRecoverySchema,
  registerSchema,
} from '../validation';

type Row = Record<string, unknown>;

export const authRouter = Router();

const DUMMY_PASSWORD_HASH = hashSecret(randomToken(24));

function adminConfigured(): boolean {
  const row = db.prepare('SELECT COUNT(*) AS count FROM admins').get() as Row;
  return Number(row.count) > 0;
}

authRouter.get('/session', wrap((req, res) => {
  const customer = readSession(req, 'customer');
  const admin = readSession(req, 'admin');
  const response: SessionResponse = {
    customer: customer && 'mobile' in customer ? customer : null,
    admin: admin && 'username' in admin ? admin : null,
    adminConfigured: adminConfigured(),
  };
  res.json(response);
}));

authRouter.post('/register', authLimiter(), wrap((req, res) => {
  const input = registerSchema.parse(req.body);
  const passwordHash = hashSecret(input.password);
  const recoveryCode = newRecoveryCode();
  const recoveryHash = hashSecret(recoveryCode);
  const now = Date.now();
  const transaction = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM customers WHERE mobile = ?').get(input.mobile);
    if (existing) {
      throw new HttpError(409, 'An account with this mobile number already exists. Please sign in.', 'mobile_taken');
    }
    const result = db.prepare(`
      INSERT INTO customers (mobile, name, password_hash, recovery_hash, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?, ?)
    `).run(input.mobile, passwordHash, recoveryHash, now, now);
    return Number(result.lastInsertRowid);
  });
  const customerId = transaction.immediate();
  createSession(req, res, 'customer', customerId);
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as Row;
  res.status(201).json({ customer: rowToPublicUser(row), recoveryCode });
}));

authRouter.post('/login', authLimiter(), wrap((req, res) => {
  const input = loginSchema.parse(req.body);
  const row = db.prepare('SELECT * FROM customers WHERE mobile = ?').get(input.mobile) as Row | undefined;
  const valid = verifySecret(input.password, row ? String(row.password_hash) : DUMMY_PASSWORD_HASH);
  if (!row || !valid) {
    throw new HttpError(401, 'Mobile number or password is incorrect.', 'invalid_credentials');
  }
  createSession(req, res, 'customer', Number(row.id));
  res.json({ customer: rowToPublicUser(row) });
}));

authRouter.post('/logout', wrap((req, res) => {
  revokeSession(req, res, 'customer');
  res.json({ ok: true });
}));

authRouter.post('/forgot-password', authLimiter(6), wrap((req, res) => {
  const input = forgotPasswordSchema.parse(req.body);
  const row = db.prepare('SELECT * FROM customers WHERE mobile = ?').get(input.mobile) as Row | undefined;
  const valid = row ? verifySecret(input.recoveryCode, String(row.recovery_hash)) : verifySecret(input.recoveryCode, DUMMY_PASSWORD_HASH);
  if (!row || !valid) {
    throw new HttpError(401, 'The mobile number or recovery code is incorrect.', 'recovery_failed');
  }
  const newPasswordHash = hashSecret(input.newPassword);
  const newCode = newRecoveryCode();
  const newCodeHash = hashSecret(newCode);
  const now = Date.now();
  const transaction = db.transaction(() => {
    db.prepare('UPDATE customers SET password_hash = ?, recovery_hash = ?, updated_at = ? WHERE id = ?').run(
      newPasswordHash,
      newCodeHash,
      now,
      Number(row.id),
    );
    revokeAllCustomerSessions(Number(row.id));
  });
  transaction.immediate();
  res.json({
    ok: true,
    newRecoveryCode: newCode,
    message: 'Password updated. Save your new recovery code — it will not be shown again.',
  });
}));

authRouter.post('/recovery/regenerate', requireCustomer, authLimiter(), wrap((req, res) => {
  const input = regenerateRecoverySchema.parse(req.body);
  const customerId = Number(req.customer!.id);
  const row = db.prepare('SELECT password_hash FROM customers WHERE id = ?').get(customerId) as Row | undefined;
  if (!row || !verifySecret(input.password, String(row.password_hash))) {
    throw new HttpError(401, 'Current password is incorrect.', 'invalid_password');
  }
  const recoveryCode = newRecoveryCode();
  db.prepare('UPDATE customers SET recovery_hash = ?, updated_at = ? WHERE id = ?').run(
    hashSecret(recoveryCode),
    Date.now(),
    customerId,
  );
  res.json({ recoveryCode });
}));

authRouter.put('/profile', requireCustomer, wrap((req, res) => {
  const input = profileSchema.parse(req.body);
  db.prepare('UPDATE customers SET name = ?, updated_at = ? WHERE id = ?').run(input.name, Date.now(), req.customer!.id);
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer!.id) as Row;
  res.json({ customer: rowToPublicUser(row) });
}));
