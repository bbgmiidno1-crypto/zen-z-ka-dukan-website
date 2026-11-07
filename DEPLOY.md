# Deploying ZEN Z KA DUKAN 24/7 for free

This guide puts the real application — Express API, SQLite database, server sessions, admin
console and every uploaded image — on an **Oracle Cloud Always Free** Arm VM, reachable over
HTTPS on a free subdomain. No paid services, no code rewrite, no serverless compromise.

| | |
|---|---|
| Host | Oracle Cloud **Always Free**: `VM.Standard.A1.Flex`, 2 OCPU / 12 GB RAM, 200 GB block storage |
| Cost | ₹0 / $0 — Always Free has no end date, and it runs 24/7 (no sleep, no cold start) |
| Runtime | Docker Compose: `app` (Node 20 + `tsx` + SQLite) behind `caddy` (automatic Let's Encrypt TLS) |
| Data | Docker volume `zzkd-data` → `/app/data` holds `zen.db`, sessions and all uploads |
| Address | Free DuckDNS subdomain, e.g. `zen-z-ka-dukan.duckdns.org` |

Files used: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.deploy.example`,
`deploy/Caddyfile`, `deploy/setup-vm.sh`, `deploy/keepalive.sh`, `deploy/backup-db.sh`,
`deploy/duckdns.sh`.

---

## 0. Create the free server (≈15 minutes, one time)

1. Sign up at <https://www.oracle.com/cloud/free/>. A card is used for **identity verification
   only**; Always Free resources are not charged. Keep **Pay As You Go unchecked**.
2. Choose your **home region** as the closest to Chennai (e.g. *India South (Hyderabad)* or
   *India West (Mumbai)*). Always Free instances can only be created in the home region.
3. In the console: **Compute → Instances → Create instance**
   - Image: **Ubuntu 24.04** (or Oracle Linux 9)
   - Shape: **Ampere → VM.Standard.A1.Flex**, **2 OCPUs**, **12 GB** memory
   - Boot volume: leave the default (fits inside the 200 GB free allowance)
   - **Upload your SSH public key** (`~/.ssh/id_ed25519.pub`), then create.
   - If you see *"Out of host capacity"*, try another availability domain, or retry later —
     free Arm capacity fluctuates. An AMD `VM.Standard.E2.1.Micro` (1 GB) also works for this
     app, just slower on image processing.
4. Note the instance's **public IPv4 address**.
5. **Open the firewall in the Oracle console.** Two layers exist; both must allow HTTP/HTTPS:
   - *Networking → Virtual Cloud Networks → your VCN → Security Lists → Default Security List* →
     **Add Ingress Rule**: source `0.0.0.0/0`, protocol TCP, destination ports **80, 443**.
   - Keep port 22 open for SSH.

## 1. Create the free subdomain

1. Sign in at <https://www.duckdns.org> (GitHub/Google login works).
2. Create a subdomain, e.g. `zen-z-ka-dukan`, and set its IP to the VM's public IPv4.
3. Copy the **token** shown at the top of the page.

The VM will keep this record fresh automatically (step 3), so it never expires.

## 2. Copy the project to the server

From your own machine, in the project folder:

```bash
ssh ubuntu@<VM_PUBLIC_IP> 'sudo mkdir -p /opt/zen-z-ka-dukan && sudo chown $USER /opt/zen-z-ka-dukan'

# 65 MB total: source + 53 MB of seed WebP media. No node_modules, no database.
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude 'data/zen.db*' --exclude 'data/uploads' --exclude 'data/test-e2e' --exclude 'data/browser-e2e' \
  --exclude 'test-results' --exclude '.env' \
  ./ ubuntu@<VM_PUBLIC_IP>:/opt/zen-z-ka-dukan/
```

`data/uploads/seed/` **is** included — that is the catalogue photography and the 360° frames;
`zen.db` is not, because the server rebuilds and seeds it on first start.

## 3. Install Docker, timers and secrets

```bash
ssh ubuntu@<VM_PUBLIC_IP>
cd /opt/zen-z-ka-dukan
sudo ./deploy/setup-vm.sh
```

That script installs Docker Engine + Compose, opens the host firewall, writes `.env` with
freshly generated `SESSION_SECRET` and `ADMIN_BOOTSTRAP_TOKEN`, and enables three timers:

- `zzkd-keepalive.timer` — 5-minute health ping + small activity burst, so Oracle never treats
  the instance as idle and reclaims it.
- `zzkd-duckdns.timer` — refreshes the free subdomain every 5 minutes.
- `zzkd-backup.timer` — daily consistent SQLite + uploads backup into `/var/backups/zen-z-ka-dukan`.

Then set the domain and register the DuckDNS credentials:

```bash
sudo zzkd-duckdns --configure        # subdomain + token, stored 0600 in /etc/zzkd/duckdns.env
sudo zzkd-duckdns                    # should print: duckdns <name>.duckdns.org -> <ip> (OK)
nano .env                            # SITE_DOMAIN=zen-z-ka-dukan.duckdns.org ; ACME_EMAIL=you@example.com
```

## 4. Build and start

```bash
cd /opt/zen-z-ka-dukan
sudo docker compose up -d --build      # first build ≈ 3–6 minutes on 2 Arm cores
sudo docker compose ps                 # app must be "healthy"
sudo docker compose logs -f caddy      # watch the certificate being issued
```

Open `https://zen-z-ka-dukan.duckdns.org` — the storefront, `/shop`, a product page with the
360° viewer, and `/admin`.

## 5. Create the administrator (one time)

1. Open `https://<your-subdomain>/admin` → you are sent to `/admin/setup`.
2. Paste the `ADMIN_BOOTSTRAP_TOKEN` value from `.env`.
3. Choose your own username and password.
4. Remove the token from `.env` so it cannot be reused:

```bash
sed -i 's|^ADMIN_BOOTSTRAP_TOKEN=.*|ADMIN_BOOTSTRAP_TOKEN=|' .env
sudo docker compose up -d app
```

## 6. Day-to-day operations

```bash
cd /opt/zen-z-ka-dukan

sudo docker compose logs -f app              # live logs
sudo docker compose restart app              # restart the app only
sudo docker compose down && sudo docker compose up -d   # full stack bounce

# Deploy a code change (data is never touched — it lives in the zzkd-data volume):
rsync -az --delete ... ./ ubuntu@<IP>:/opt/zen-z-ka-dukan/    # from your machine, same flags as step 2
ssh ubuntu@<IP> 'cd /opt/zen-z-ka-dukan && sudo docker compose up -d --build'

# Database + upload backups
sudo zzkd-backup && sudo ls -lh /var/backups/zen-z-ka-dukan | tail

# Restore a backup
sudo docker compose stop app
sudo docker run --rm -v zen-z-ka-dukan_zzkd-data:/data -v /var/backups/zen-z-ka-dukan:/backup alpine \
  sh -c 'cp /backup/zen-YYYYMMDD-HHMMSS.db /data/zen.db'
sudo docker compose start app
```

Volume name can be confirmed with `docker volume ls | grep zzkd-data`.

## 7. Verification checklist

Run these from any machine after step 4:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/                    # 200
curl -s https://<domain>/api/health                                          # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/product/aurum-chronograph   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/media/seed/editorial/hero.webp  # 200
curl -sI https://<domain>/ | grep -i strict-transport-security               # HSTS present
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/data/admin-setup.txt        # 200 = SPA fallback, never the file
```

Then in the browser: place a COD order, reload the page, restart the container
(`sudo docker compose restart app`) and confirm the order, the customer session, the uploaded
product image and its 360° sequence are all still there — that proves the volume persistence.

Also check the immersive layer on a real phone (not just a resized desktop window):

- the water surface animates, ripples follow your finger and stays in the brown/gold family;
- the home-page product rail drifts right→left, holds still while you touch it, and a product can
  be tapped; the droplet effect plays and the product page opens;
- save two hearts as a guest, sign in, and confirm both appear in **Account → Wishlist** and survive
  a reload (that read/write path is SQLite, so it also proves the volume is mounted);
- with **reduce motion** enabled in the OS, the surface is still and the rail becomes an ordinary
  horizontal scroller while everything remains usable.

`npm run test:liquid` is the fastest way to re-verify all of this in Chromium before you deploy.
The water shader budgets its own resolution on slow GPUs (it lowers the pixel cost instead of
dropping frames), and it tears its WebGL context down on unmount — no extra server configuration is
needed for it.

## 8. Why this architecture (and what it does not do)

- **Always free, always on.** Nothing sleeps; there is no 15-minute idle spin-down and no cold
  start. Only Oracle's 7-day idle-reclamation policy needed handling, hence the keepalive timer.
- **Real persistence.** SQLite, sessions, uploaded product photographs and 360° frames live on
  the VM's block volume, not on an ephemeral container layer.
- **HTTPS automatically.** Caddy obtains and renews the Let's Encrypt certificate; cookies are
  `Secure` behind the proxy (`COOKIE_SECURE=true`) and the app trusts `X-Forwarded-*`.
- **Honest limits:** a free DuckDNS subdomain (not a purchased domain); a single VM with no
  redundancy or SLA, so free-tier capacity may occasionally be reclaimed and backups are your
  safety net; 10 TB/month free egress is far above what this catalogue needs; and images are
  processed by Sharp on a 2-core Arm CPU, so large bulk uploads are slower than on a paid box.
- **No managed database or object storage** is used, so there is no extra cost — and no extra
  safety net either. Keep the backup timer enabled and copy `/var/backups/zen-z-ka-dukan`
  off the VM occasionally (`rsync` to your laptop).

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Out of host capacity` when creating the instance | Free Arm capacity is contended: retry, try the other availability domain, or use an AMD micro shape |
| Site times out on port 80/443 | Oracle security list ingress rule missing, or `sudo ufw status` blocking — run step 0.5 and step 3 |
| Certificate not issued | DNS not pointing at the VM yet (`dig +short <domain>`), or ports closed. Caddy retries automatically; check `docker compose logs caddy` |
| `docker compose` not found | Log out/in after `setup-vm.sh`, or `sudo usermod -aG docker $USER` |
| App container restarts in a loop | `sudo docker compose logs app` — usually a missing `.env` value (the compose file requires `SESSION_SECRET` and `ADMIN_BOOTSTRAP_TOKEN`) |
| Storefront loads but API calls fail | Check `https://<domain>/api/health`; if 502, the app container is unhealthy — inspect logs |
| Uploads rejected on a slow connection | Large angle sets on 2 Arm cores take time; the API limit is 12 MB per image, 20 MB per model |
| Need to move to a paid VM later | The same `docker-compose.yml` works on any Ubuntu server; move the named volume and `.env` |
