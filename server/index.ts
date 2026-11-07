import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { db, initializeDatabase, pruneSessions } from './db';
import { errorHandler, HttpError, requireClientHeader } from './http';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { customerRouter } from './routes/customer';
import { publicRouter } from './routes/public';

initializeDatabase();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
app.use(cookieParser(config.sessionSecret));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
// Sessions and protected data must never be reused from a browser or proxy cache.
app.use(['/api/auth', '/api/admin', '/api/customer'], (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

const mediaStaticOptions = {
  immutable: true,
  maxAge: '30d',
  setHeaders: (res: express.Response) => res.setHeader('X-Content-Type-Options', 'nosniff'),
};
app.use('/media', express.static(config.uploadDir, mediaStaticOptions));
// Seed media lives in the project's durable workspace volume. When a test or
// deployment points DATA_DIR at a separate database volume, keep those images
// available instead of duplicating them into the upload volume.
if (path.resolve(config.seedUploadDir) !== path.resolve(config.uploadDir)) {
  app.use('/media', express.static(config.seedUploadDir, mediaStaticOptions));
}
app.use('/media', (_req, res) => res.status(404).type('text/plain').send('Image not found'));

app.use('/api', requireClientHeader);
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ZEN Z KA DUKAN API', storage: 'persistent SQLite + workspace file volume', time: Date.now() });
});
app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
app.use('/api/customer', customerRouter);
app.use('/api/admin', adminRouter);
app.use('/api', (req, _res, next) => next(new HttpError(404, `API route not found: ${req.path}`, 'not_found')));

const distIndex = path.join(config.frontendDist, 'index.html');
if (fs.existsSync(distIndex)) {
  app.use('/admin', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(express.static(config.frontendDist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(distIndex));
} else {
  app.get('*', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('ZEN Z KA DUKAN API is running. Start the Vite frontend with npm run dev, or run npm run build first.');
  });
}

app.use(errorHandler);

const server = app.listen(config.port, '0.0.0.0', () => {
  const tokenPath = path.join(config.dataDir, 'admin-setup.txt');
  console.log(`[api] ZEN Z KA DUKAN ready on port ${config.port}`);
  console.log(`[api] Persistent database: ${config.dbPath}`);
  console.log(`[api] Persistent uploads: ${config.uploadDir}`);
  console.log(`[api] Private first-run admin setup instructions: ${tokenPath}`);
});

const sessionPruner = setInterval(pruneSessions, 60 * 60 * 1000);
sessionPruner.unref();

function shutdown(): void {
  clearInterval(sessionPruner);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
