# Vercel Migration Roadmap — ZEN Z KA DUKAN

This file tracks the migration from the current Express + SQLite + local uploads deployment to Vercel.

## Non-negotiable requirements
- COD-only checkout; do not add online payment collection.
- Preserve storefront, product catalogue, customer orders, sessions/authentication, admin dashboard, and product media.
- Never expose admin bootstrap credentials or session secrets to browser/client code.
- Do not deploy/merge to production until migration tests pass.

## Why a configuration-only deploy is unsafe
The current application initializes `better-sqlite3` synchronously, creates local data directories and secret files, stores uploaded media on disk, and starts Express with `app.listen()`. Vercel functions have ephemeral local storage and do not run as a persistent server. A Vercel config alone would break durable order/catalogue state, uploads, and server lifecycle.

## Target architecture
- **Frontend:** Vite/React static output served by Vercel.
- **API:** Express routes adapted into Vercel Node functions (or split into function handlers); no persistent `app.listen()` in function entrypoints.
- **Database:** Neon PostgreSQL. Replace SQLite-specific SQL and synchronous calls with a PostgreSQL-compatible async data layer. Keep schema migrations and seed data explicit.
- **Media:** Cloudinary for uploaded product/category/model images. Existing seeded assets can remain in the repository/static build if appropriate; user-uploaded files must not depend on local function disk.
- **Secrets:** Vercel Environment Variables (production/preview/development separately). Secrets are server-only.
- **Sessions:** PostgreSQL-backed sessions or a secure stateless session design compatible with the current authentication and revocation needs.
- **Checkout:** COD only.

## Migration phases
1. Inventory and map all SQLite-specific queries, transaction patterns, schema, session/auth flows, file upload routes, and seed data.
2. Create a PostgreSQL schema/migration and replace DB access with an async repository layer. Preserve constraints and transaction semantics.
3. Move upload routes to Cloudinary; store media IDs/URLs in PostgreSQL; retain safe deletion/update behavior.
4. Refactor Express startup into Vercel-compatible API entrypoints; configure Vite frontend output and SPA routing without routing API/media paths into the frontend.
5. Configure environment variables and connection pooling for Neon/Vercel.
6. Run build/typecheck, API tests, authentication/admin setup tests, order creation/management tests, media tests, and preview smoke tests.
7. Deploy Preview first, verify all workflows, then promote to Production only after explicit approval.

## Current status
- [x] Repository and deployment blockers reviewed.
- [x] Vercel target confirmed.
- [ ] SQLite-to-PostgreSQL migration.
- [ ] Local-upload-to-Cloudinary migration.
- [ ] Express serverless adapter/refactor.
- [ ] Vercel routing and environment configuration.
- [ ] Preview deployment and end-to-end verification.
- [ ] Production deployment.

## Safety
Do not place real credentials in GitHub files. Use Vercel Environment Variables and provider dashboards. Do not claim the site is deployed until the deployment URL and smoke tests are verified.
