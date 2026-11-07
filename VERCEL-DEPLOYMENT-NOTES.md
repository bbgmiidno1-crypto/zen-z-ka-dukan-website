# Vercel deployment readiness — ZEN Z KA DUKAN

## Current status

The repository is a full-stack Express + React/Vite application. `npm run build` produces the frontend `dist/` directory, but the server is not a Vercel serverless handler: `server/index.ts` initializes SQLite, writes secret/setup files and uploads to local filesystem paths, and calls `app.listen()`.

## Do not deploy the current server as-is to Vercel

Vercel serverless instances do not provide durable writable local storage for the SQLite database, generated admin/session secret files, or customer-uploaded media. A static-only Vercel deployment would serve the storefront but `/api` endpoints and customer/admin workflows would fail (the frontend may show “The atelier is unreachable”).

## Required before production

1. Decide on a durable database compatible with the app (currently SQLite via `better-sqlite3`; migration to PostgreSQL requires schema/query adaptation, not just an environment variable).
2. Move uploaded product/media files to durable object storage and update upload/static-serving code.
3. Refactor Express startup into a serverless-compatible handler or deploy the Express API on a persistent Node host.
4. Configure production secrets in the hosting dashboard (never commit them): `SESSION_SECRET`, admin bootstrap secret, and database/storage credentials.
5. Run typecheck, build, tests, then verify COD checkout, admin login/setup, order placement, and order management.

## COD-only requirement

Keep Cash on Delivery only. Do not add UPI, card payments, net banking, or a payment gateway.

## Current safe work branch

`deployment-readiness-cod` — changes should be reviewed before merging into `main`.
