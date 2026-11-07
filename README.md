# ZEN Z KA DUKAN

A full-stack, multi-page luxury fashion commerce application. The React/TypeScript storefront is backed by an Express API and persistent SQLite database, with customer accounts, Cash-on-Delivery ordering, order tracking, direct image uploads and a protected administrator console.

**Brand:** ZEN Z KA DUKAN  
**Palette:** espresso and mocha, cream text and restrained metallic gold  
**Payment:** Cash on Delivery only · delivery charge ₹0 · no cart, no payment gateway, no OTP or SMS  
**Local URL:** `http://localhost:3001` after starting the app.

---

> [`DEPLOY.md`](DEPLOY.md) describes an optional VM-based deployment with Docker Compose. Free-tier availability, capacity and uptime are not guaranteed. Vercel deployment requires separate durable database and media storage; the VM instructions are not a Vercel deployment.

## Run it

Use Node.js 20 or newer and npm:

```bash
npm ci
npm run build
npm start                 # API + built React app on port 3001
```

Development mode runs the API and Vite together:

```bash
npm run dev               # API on 3001, Vite on 5173
```

Optional settings are documented in `.env.example`. The frontend calls same-origin relative `/api` and `/media` URLs; Vite proxies both to the API during development. No database credential or API secret is present in frontend code.

### Repository contents and runtime data

The repository includes the complete storefront and server source, configuration templates, automated tests, seed catalogue and bundled catalogue/editorial/360° media. On the first run, the server creates a fresh SQLite database and populates it from the included seed files.

For security, the live database (including administrator and customer accounts, sessions and orders), private setup tokens, session secrets, local environment files, and user-uploaded runtime media are **not** committed. Generated dependencies, builds and test screenshots are also excluded. A fresh clone therefore requires its own administrator setup; it does not migrate a live store's accounts, orders, catalogue edits or later uploads. Back up and transfer those separately through a secure private channel—never commit them to a public repository. Preserve both the database and its associated uploads when migrating a running store.

### GitHub Pages project-path build (non-commercial preview only)

`npm run build:pages` creates a separate `dist-pages/` artifact with Vite's base set to `/zen-z-ka-dukan-website/`, a matching React Router basename, bundled seed media, `.nojekyll` and a 404 redirect for direct application routes. `npm run test:pages` exercises that build with the real API through an **isolated local test proxy**; the proxy is not part of GitHub Pages. The `pages-build.yml` workflow checks and saves this artifact but deliberately does **not** deploy it while the backend is unavailable.

**This artifact alone is not the complete store.** GitHub Pages cannot run the Express API, SQLite database or upload processing. A Pages frontend requires a separately hosted API with durable database/media storage, explicit cross-origin access and browser-compatible secure sessions. `VITE_API_ORIGIN` can point the built frontend at an HTTPS API origin; it is a public URL, not a secret. Merely setting it does not make the existing server cross-origin or serverless-ready. Do not deploy this build as a working store until the real backend and every authenticated flow have been validated.

GitHub says [Pages is not for operating an online store](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), and [Vercel's Hobby plan is limited to non-commercial use](https://vercel.com/docs/limits/fair-use-guidelines). Use an appropriate commercial hosting plan for a live store. No production deployment or data migration is implied by this build.

### Embedded HTTPS preview sessions

When an HTTPS preview is embedded in another site, browsers may block ordinary `SameSite=Lax` cookies. For that preview only, `COOKIE_PARTITIONED=true` enables signed, HTTP-only, `Secure; SameSite=None; Partitioned` cookies. Normal deployments leave it off and keep `SameSite=Lax`.

Some preview proxies strip or block all cookies. Only for such a temporary HTTPS preview, additionally opt in to `PREVIEW_ADMIN_HEADER_SESSION=true`. If the cookie fails after credentials are verified, the admin UI revalidates the credentials and obtains an opaque, server-side session token valid for at most 30 minutes. It is held only in JavaScript memory and sent to same-origin admin/session APIs in a custom header—never in a URL, localStorage or sessionStorage. Reloading the page signs the admin out; logout revokes the token. This fallback is **not HTTP-only**, so it does not have all the protections of the normal cookie. It is off by default and must not be enabled for the public production store. Both modes retain CSRF checks.

### First-run administrator setup

There is **no public hardcoded admin password**. On a fresh database:

1. Open `/admin`.
2. The app redirects to `/admin/setup`.
3. Read the private one-time token from `data/admin-setup.txt` on the server/workspace.
4. Enter that token, choose an administrator username and a strong password.
5. Sign in at `/admin/login` on later visits.

`data/admin-setup.txt`, `data/session-secret.txt` and `data/admin-bootstrap-token.txt` are private server-side files. They are not served under `/media` or exposed through the API. The generated secret files use `0600` permissions.

---

## What is implemented

### Storefront

- Cinematic loading screen with a selectively loaded Three.js golden `Z` monogram and a lightweight CSS fallback.
- Premium fixed navigation, mobile menu, product search, editorial hero, animated brand typography, shop-by-category, featured/new-arrival/best-seller rails, collections, promotional banner, testimonials, newsletter and footer.
- GSAP + ScrollTrigger reveals, alternating scroll-rail directions, page curtain transitions, gold shimmer, image zoom and guarded 3D hover tilt.
- Nine seeded categories: Men, Women, Kids, Shoes, Bags, Beauty, Accessories, New Arrivals, Best Sellers.
- Product pages with colour-specific image galleries, size selection, quantity, stock feedback, related products, an interactive **360° VIEW** button and a prominent **BUY NOW** button.
- Responsive `<img>` `srcSet`/`sizes`, width/height placeholders, lazy loading, bundled fonts, code-split routes and a separate lazily imported Three.js chunk.
- Mobile-first CSS for Android/iPhone, tablets, laptops and desktops; touch-friendly controls; reduced-motion and low-power fallbacks.

### Customer accounts and security

- Registration with mobile number, password and confirm password.
- Login with mobile and password; persistent HTTP-only, signed, server-side sessions; logout; profile and saved addresses.
- A unique `ZZKD-XXXX-XXXX-XXXX` recovery secret is generated at registration, shown once in a secure overlay with copy/download/acknowledgement, and stored only as an scrypt hash.
- Forgot-password uses registered mobile + recovery code, rotates the recovery code and revokes existing sessions.
- No OTP, SMS, email reset link or online payment.
- `scrypt` password/recovery hashing, timing-safe verification, CSRF/origin checks, Helmet, rate-limited authentication, Zod input validation, separate customer/admin roles and server-side authorization on every protected route.

### Buy Now and COD orders

- Checkout shows the selected product image, colour, size, quantity, price, subtotal, ₹0 delivery and final amount.
- The server recalculates the final amount from stored prices; client-supplied price, payment method and delivery values are ignored.
- The complete delivery address, city, state, PIN code and recipient mobile are collected and validated.
- An `IMMEDIATE` SQLite transaction checks availability and stock, creates the order/order items/status history/address snapshot and decrements stock atomically.
- Unique `ZZKD-YYYYMMDD-XXXXXXXX` order IDs and exact statuses: `Order Placed`, `Order Confirmed`, `Packed`, `Shipped`, `Out for Delivery`, `Delivered`, `Cancelled`.
- Customer order history, order detail and a visual seven-step tracking timeline. Customer cancellation is limited to early statuses and restores stock once.
- Orders and their product snapshots remain available after product deletion or server restart; they are never automatically purged.

### Admin console at `/admin`

- Server-session-protected black-and-gold dashboard with no unauthenticated data.
- Overview totals for orders, products, customers and sales, recent orders and low-stock alerts.
- Product creation/editing/deletion, direct device image uploads, separate images per colour variant, per-colour **360° PRODUCT IMAGES** sequences (8/12/16/24/36 angles plus an optional GLB/glTF model), sizes, per-variant/per-size stock, availability and featured/new-arrival/best-seller flags.
- Category CRUD with direct image upload and special New Arrivals / Best Sellers filters.
- Customer records with saved delivery addresses and complete order histories.
- Order search/filter, order details, delivery addresses, status history and status updates.
- Uploaded files are validated by MIME type, magic bytes, pixel dimensions and Sharp re-encoding to optimized WebP; external image URLs are not accepted.
- Important actions use database transactions and clean up replaced upload files.

### Persistence

- SQLite database: `data/zen.db` by default, with `customers`, `admins`, `sessions`, `categories`, `products`, `product_variants`, `product_images`, `product_sizes`, `variant_inventory`, `product_360_sequences`, `product_360_images`, `addresses`, `orders`, `order_items`, `order_status_history`, `newsletter_subscribers` and supporting indexes/constraints.
- Durable uploads: `data/uploads/` by default. Seed WebP media lives in `data/uploads/seed/`; admin product photographs, 360° angle frames and optional GLB/glTF models live in `data/uploads/products/`, `data/uploads/spin/` and `data/uploads/models/`; category images live in `data/uploads/categories/`.
- The server also serves the canonical seed-media directory when `DATA_DIR` points at a different volume.
- WAL mode, foreign keys, busy timeout, hourly session pruning and graceful shutdown.
- The catalogue is seeded idempotently from `shared/catalog-seed.json` and `data/seed-manifest.json`; seeded products are real database rows, not fake frontend placeholders.

---

## Verification

All checks below were run successfully in this workspace on **2026-11-07**.

```bash
npx tsc --noEmit --pretty false   # clean
npm run build                     # clean production build
npm test                          # backend + persistence end-to-end suite
npm run test:browser              # real Chromium desktop/mobile/tablet suite
npm run test:liquid               # liquid surface, floating gallery, wishlist, reduced motion
npm run test:preview-auth         # embedded authentication with blocked/stripped cookies
npm run test:pages                # project-path build using an isolated local API proxy
```

`npm test` starts an isolated server on port `3102`, verifies health, catalogue, protected admin access, private bootstrap, admin login, registration, scrypt hashing, login, forgot-password rotation, product upload with two colour-image sets, price tampering protection, colour/size selection, COD checkout preview, order creation, stock decrement, saved addresses, out-of-stock rejection, admin search/filter, status updates, cancellation stock restoration, quick stock management, category CRUD, product deletion, order-history retention, newsletter idempotency, **server restart**, persistent sessions/orders and uploaded image availability after restart.

The same suite verifies the 360° pipeline end to end: 72 seeded colourway sequences with 576 stored seed frames served as WebP, a real 12-angle admin upload stored in `product_360_sequences`/`product_360_images`, per-colour isolation, an invalid angle count returning a warning without damaging the stored sequence, persisted reordering, rejection of a malformed GLB, a valid GLB attach/serve/remove round trip, clearing a sequence deleting its media from disk, a fresh 8-angle replacement, and 360° rows, media and seeded sequences surviving a server restart with no duplicated sequence per colourway and no orphaned record after product deletion.

`npm run test:browser` starts the built production app on port `3104` and uses Playwright Chromium to verify:

- desktop home, loader/fallback, hero and all editorial sections, lazy responsive images, no Add-to-Cart/Add-to-Bag text, navigation, category filter and search;
- registration, recovery overlay copy/download/acknowledge, profile, logout, login and forgot-password with rotated recovery code;
- admin protection, one-time setup, logout/login and all five protected dashboard destinations;
- real device-file product upload through the admin UI with two colour variants, a four-cell stock matrix and a real 8-angle upload through the **360° PRODUCT IMAGES** editor (preview, reorder, remove, count validation, re-add);
- the storefront 360° viewer: navbar-safe portalled overlay, no clipped stage or horizontal overflow, drag rotation, thumbnail jumps, wrap-around past the last angle, zoom in/reset, disabled 3D mode without a model, keyboard rotation, `Esc` close restoring page scroll, the honest empty state for a colour without angles, and distinct seeded "Editorial 360° sequence" frames;
- colour-driven gallery changes, size selection, BUY NOW, COD checkout, order creation and the seven-step timeline;
- admin order search, status updates, product edit/stock management, delete confirmation and retained order history;
- mobile `390×844`, tablet `820×1180`, desktop `1440×900`, mobile admin and `prefers-reduced-motion` contexts with no horizontal overflow and no browser console/page errors;
- refined gold motion, global click/press interactions (a 110 ms press scale over the 190 ms click / 260 ms hover tokens), tiny non-blocking ripples and Android touch interactions across all major storefront and admin pages;
- the liquid layer: a WebGL water surface running in the brown/gold family, the endless right-to-left floating gallery (two identical copies, seamless wrap, pause under the pointer), two independent ripples from two simultaneous touches, and the droplet transition into a product page;
- the persisted wishlist: guest hearts held in `localStorage`, merged into the SQLite wishlist on sign-up/sign-in, then listed in `/account?tab=wishlist` and surviving a reload;
- `prefers-reduced-motion`: `data-water="static"`, a non-animating rail that becomes a normal horizontal scroller, and every flow still usable.

`npm run test:preview-auth` uses isolated temporary databases and real cross-site iframes. It checks normal-cookie fallback, embedded admin setup/login/reload/logout on desktop and Android-sized viewports, customer/admin session coexistence, partition isolation and CSRF rejection. It also emulates a proxy that strips all cookies and verifies the opt-in admin memory fallback, 30-minute expiry, revocation, same-origin/secure-origin guards and no persistent token storage. Run `npm run build` first.

`npm run test:liquid` is the focused suite for the immersive layer. It serves the built app on port `3106` with an isolated `data/liquid-test` database and verifies water motion and palette, rail drift + two-copy wrap + pause-on-hover, dual ripples, the droplet navigation, guest→account wishlist merge, a `390×844` Android viewport with no horizontal scroll, and the reduced-motion branch. Screenshots: `desktop-product-page.png`, `desktop-wishlist.png`, `mobile-liquid-home.png`, `mobile-product-liquid.png`.

Additional live-server checks confirmed all **302** seed-manifest `/media/*.webp` URLs return HTTP 200 with correct WebP content, `/` and `/admin` serve the SPA, health/home APIs work, and private setup files are not exposed over HTTP.

Screenshots from the browser suite are in `test-results/`: `desktop-loader.png`, `desktop-home.png`, `desktop-360-viewer.png`, `desktop-order-tracking.png`, `mobile-menu.png`, `mobile-home.png`, `mobile-360-viewer.png`, `mobile-order-tracking.png`, `tablet-home.png` and `tablet-product.png`.

On a fresh Linux machine, Playwright may require one-time browser installation:

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium
```

---

## Luxury animation restoration

The cinematic layer was rebuilt in `src/lib/motion.ts`, `src/components/GoldenZLoader.tsx`, `src/components/TiltCard.tsx` and `src/index.css`, without changing the design language, catalogue, authentication, checkout or admin logic.

- GSAP + ScrollTrigger again drive hero and section reveals, staggered card entrances, the alternating left/right scroll rails, editorial parallax and the page transition.
- The page transition is a short dark curtain with a single centred gold hairline accent. It is a deliberate motion detail, not a screen-wide gold flash, and it never delays a real route change.
- The loader is a cinematic gold `Z` monogram with a fine low-opacity gold ring and a small particle field on capable desktops. It is bounded to `min(220px, 48vw)` and finishes in about 2.1 s once per session. Android, low-memory and reduced-motion browsers get the lightweight CSS monogram instead of Three.js.
- `TiltCard` restores guarded pointer tilt with `perspective`, clamped rotation and a soft sheen, enabled only for fine pointers on capable desktops.
- The delegated layer in `src/lib/interactions.ts` still provides a ≤30px gold ripple, a `0.97` press state and a smooth release on every enabled control, using `190ms` press and `260ms` hover timings.
- Glows, shadows, particles, opacity and blur are all kept low so the gold reads as metal rather than neon; `prefers-reduced-motion` disables ripples, shimmer, loader animation and nonessential transforms.

## Liquid surface, floating gallery and wishlist

The immersive layer is additive: it sits on top of the existing React Router routes, catalogue, checkout and admin, and never intercepts or delays a purchase.

- **Water surface** (`src/lib/water.ts`, `src/components/WaterSurface.tsx`): a fixed WebGL surface with a band-limited sine swell field (no per-pixel noise loops) plus up to six independent expanding ripple rings, tinted espresso/mocha/burnt-amber with a champagne-gold specular. Ripples come from `pointerdown` (every finger gets its own ring) and rate-limited `pointermove`, plus scroll-driven drift. There is no cartoon splash and no bright blue anywhere.
- **Fallback chain:** WebGL → 2D canvas → static gradient. `hasWebGL()` probes support, `detectWaterTier()` picks `full`/`lite`/`off` from pointer type, width, core count and device memory, and `prefers-reduced-motion` switches the surface to `data-water="static"`.
- **Adaptive resolution:** the surface renders below CSS resolution (it is a soft backdrop) and a frame-time governor steps the pixel budget down — never oscillating — when frames exceed ~22 ms, so a weak GPU loses sharpness instead of smoothness. Software rasterisers (SwiftShader/llvmpipe) start at a low budget. It also pauses with `IntersectionObserver`/`visibilitychange` and tears down its canvas, context (`WEBGL_lose_context`), listeners and rAF on unmount.
- **Floating gallery** (`src/components/LiquidRail.tsx`, `.liquid-*` in `src/index.css`): products drift right→left endlessly with a duplicate copy for a seamless wrap, each card bobbing and rotating on its own phase. Pointer, focus or touch pauses the drift (and the bob) completely so a product can be inspected and clicked; it resumes gently after a 1200 ms grace period. Drag-to-scrub and momentum are retained, and the rail is a normal horizontal scroller under reduced motion.
- **Droplet transition** (`src/components/WaterDroplet.tsx`): clicking a product or category drops a droplet that lands, ripples and briefly distorts the target, then completes a short liquid morph into the next route. The listener is capture-phase so React Router's own `preventDefault()` cannot cancel it, and it never blocks the navigation itself.
- **Wishlist** (`src/context/WishlistContext.tsx`, `server/routes/customer.ts`): hearts on every product card and on the product detail page (`data-no-water-drop` keeps the droplet off the heart). Guests are stored in `localStorage['zzkd.wishlist.guest']` and merged into the account on sign-in; the account has a `?tab=wishlist` panel listing saved products with thumbnails, prices and remove buttons. There is still no cart or bag — BUY NOW / COD is unchanged.
- **Palette:** the hybrid re-skin keeps espresso/mocha surfaces and cream text with gold accents; the water is warm, never blue.

## 360° product viewer

Every colour variant can carry its own ordered multi-angle sequence, plus an optional 3D model.

- **Persistence:** `product_360_sequences` stores the product, variant, frame count, source (`seed_derived` or `admin_upload`), optional `model_path`/`model_mime` and soft-delete state; `product_360_images` stores each frame's full WebP path, thumbnail, position, width, height and byte size.
- **Frame counts:** exactly `8`, `12`, `16`, `24` or `36` angles. Any other count is rejected with an explicit warning while the rest of the product save still succeeds, so a half-finished photo shoot never destroys a working sequence.
- **Admin:** the product form has a per-colour **360° PRODUCT IMAGES** section with multi-file upload from Android or desktop, thumbnails, reorder, single-frame removal, replace-all, remove-all, live `n / declared` count, a blocking count message, an optional GLB/glTF upload (20 MB limit) and a note that normal product photos can still be saved without angles.
- **Uploads:** angle frames are validated by MIME type, magic bytes and Sharp re-encoding to a high-quality 1600×2000 WebP plus a 600×750 thumbnail; GLB/glTF models are validated by header/JSON structure. Replaced, removed and cleared media files are deleted from disk.
- **Storefront:** product pages have a **360° VIEW** button showing the angle count for the selected colour. It opens a portalled modal viewer with mouse/finger drag rotation, full 360° wrap, wheel/pinch/`+`/`−`/button zoom to 250%, reset, fullscreen, keyboard control (arrows, `+`/`−`, `R`/`0`, `F`, `Esc`), an angle filmstrip and ±2 high-resolution preloads. When a model exists, a lazily loaded Three.js GLB/glTF mode with orbit and pinch/zoom is available.
- **Honest empty state:** a colour with no complete sequence shows "360° angles are being prepared" and explains the requirement. A single static photograph is never presented as 3D.
- **Seed data:** `scripts/generate_360_seed.py` derives eight upright 900×1125 angle-transition frames per seeded colourway (72 colourways, 576 full + 576 thumbnail WebP files) from the two existing catalogue photographs of that colour. They are labelled `seed_derived` and shown in the viewer as "Editorial 360° sequence" with a note that they are catalogue-derived transitions, not photographed front/side/rear angles. Real admin uploads replace them for the exact colour and are labelled `admin_upload`.

## Scope and environment limitations

- The application is running locally in Arena's live preview. **No domain, paid hosting, paid API or paid subscription was purchased or activated**, in line with the brief.
- Persistence is real for this workspace's durable `data/` volume. If the entire workspace volume is deleted, or if the app is later deployed to a serverless platform with an ephemeral filesystem, the SQLite database and uploads would not survive. A production deployment would need a persistent disk/volume (and, for multi-instance hosting, shared object storage plus a managed database). No such external paid service is configured here.
- The user mentioned a futuristic reference video but did not supply a video file or URL; the cinematic treatment was built from the written design brief, generated black/gold imagery and locally saved editorial photography.
- No requested feature was replaced with static mock data or a non-functional button. The only intentionally unavailable capabilities are those excluded by the brief: cart/bag, online payment, OTP/SMS and external image URLs.

---

## Deploying 24/7 for free

`DEPLOY.md` is a complete runbook for putting this exact application online for ₹0 on Oracle
Cloud's Always Free tier: a 2-OCPU/12-GB Arm VM running `docker compose` — the Node/SQLite app
in one container, Caddy with automatic Let's Encrypt TLS in front — with the database and every
upload on a Docker volume, a 5-minute keepalive timer that prevents Oracle's idle reclamation,
a DuckDNS updater for the free subdomain, and a daily consistent SQLite + uploads backup.

Supporting files: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.deploy.example`,
`deploy/Caddyfile`, `deploy/setup-vm.sh`, `deploy/keepalive.sh`, `deploy/backup-db.sh`,
`deploy/duckdns.sh`.

## Project structure

```text
Dockerfile              production image (Node 20, ARM/AMD64, non-root, healthcheck)
docker-compose.yml      app + Caddy (automatic HTTPS) with a persistent data volume
deploy/                 Caddyfile, VM setup, keepalive, backups, DuckDNS updater
DEPLOY.md               free 24/7 hosting runbook (Oracle Always Free + DuckDNS)
server/
  index.ts              Express app, static media, SPA fallback, shutdown
  schema.sql            SQLite schema and constraints
  config.ts             durable paths, secrets, limits
  crypto.ts             scrypt, signed-token helpers, recovery/order IDs
  db.ts / seed.ts       WAL database initialization and idempotent seeding
  order-service.ts      transactional COD orders, stock, status and cancellation
  product-service.ts    transactional product/variant/image/inventory/360 writes
  seed360.ts            links seed-derived 360° sequences without overwriting admin uploads
  routes/               auth, public, customer and admin APIs
  uploads.ts            Multer + Sharp validated WebP upload pipeline
  validation.ts         Zod schemas and parsed inputs
  test/                 backend and Playwright end-to-end suites
shared/
  types.ts              shared frontend/backend contracts
  catalog-seed.json     real seed catalogue
src/
  App.tsx               site/admin route shell
  components/           brand, loader, nav, footer, cards, rails, timeline, auth,
                        360° viewer, optional Three.js model viewer
  pages/                home, shop, product, checkout, auth, account, orders, policies
  admin/                protected console, setup/login and management pages
  context/              auth and toast providers
  lib/                  API client, formatting, motion and viewer helpers
  index.css             responsive black/gold design system
assets/                 source JPGs used to generate optimized media
scripts/                deterministic WebP media preparation and 360° seed generation
data/                   persistent SQLite database, uploads and private setup files
```
