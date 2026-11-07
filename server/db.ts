import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from './config';
import { seedDatabase } from './seed';
import { seed360Sequences } from './seed360';

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function initializeDatabase(): void {
  const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  db.exec(schema);
  seedDatabase(db);
  seed360Sequences(db);
  pruneSessions();
}

export function pruneSessions(): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').run(
    Date.now(),
    cutoff,
  );
}
