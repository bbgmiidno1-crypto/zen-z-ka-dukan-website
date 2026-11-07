#!/usr/bin/env bash
# Install Docker (free, open source) and start ZEN Z KA DUKAN on an Ubuntu 22.04/24.04
# or Oracle Linux 8/9 Always Free VM. Safe to re-run.
#
#   sudo ./deploy/setup-vm.sh
#
# After it finishes: edit .env, then `sudo docker compose up -d --build`.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo: sudo ./deploy/setup-vm.sh" >&2
  exit 1
fi

log "Detecting distribution"
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  DISTRO="${ID:-unknown}"
else
  DISTRO="unknown"
fi
echo "Distribution: $DISTRO ($(uname -m))"

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine and the Compose plugin"
  if [[ "$DISTRO" == "ol" || "$DISTRO" == "rhel" || "$DISTRO" == "centos" || "$DISTRO" == "fedora" ]]; then
    dnf install -y dnf-plugins-core
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME:-jammy} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  systemctl enable --now docker
else
  log "Docker already installed: $(docker --version)"
fi

log "Opening host firewall ports 80 and 443 (if firewalld/ufw is active)"
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http >/dev/null
  firewall-cmd --permanent --add-service=https >/dev/null
  firewall-cmd --reload >/dev/null
  echo "firewalld updated."
elif command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  echo "ufw updated."
else
  echo "No active host firewall detected (Oracle's security list still applies — see DEPLOY.md)."
fi

if [[ ! -f .env ]]; then
  log "Creating .env from the template with freshly generated secrets"
  SESSION_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  ADMIN_TOKEN="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sed -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" \
      -e "s|^ADMIN_BOOTSTRAP_TOKEN=.*|ADMIN_BOOTSTRAP_TOKEN=${ADMIN_TOKEN}|" \
      .env.deploy.example > .env
  chmod 600 .env
  echo "Wrote .env with new secrets. Edit SITE_DOMAIN and ACME_EMAIL before starting."
else
  chmod 600 .env
  log ".env already exists — leaving it untouched"
fi

log "Installing the keepalive timer (prevents Oracle's 7-day idle reclamation)"
install -m 0755 deploy/keepalive.sh /usr/local/bin/zzkd-keepalive
cat > /etc/systemd/system/zzkd-keepalive.service <<'UNIT'
[Unit]
Description=ZEN Z KA DUKAN keepalive ping (keeps the Oracle Always Free instance active)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/zzkd-keepalive
UNIT
cat > /etc/systemd/system/zzkd-keepalive.timer <<'UNIT'
[Unit]
Description=Run the ZEN Z KA DUKAN keepalive every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now zzkd-keepalive.timer

log "Installing the DuckDNS updater timer (free subdomain)"
install -m 0755 deploy/duckdns.sh /usr/local/bin/zzkd-duckdns
cat > /etc/systemd/system/zzkd-duckdns.service <<'UNIT'
[Unit]
Description=Refresh the free DuckDNS subdomain for ZEN Z KA DUKAN
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/zzkd-duckdns
UNIT
cat > /etc/systemd/system/zzkd-duckdns.timer <<'UNIT'
[Unit]
Description=Run the DuckDNS updater every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now zzkd-duckdns.timer || echo "DuckDNS timer enabled; run 'sudo zzkd-duckdns --configure' to set the subdomain and token."

log "Installing the daily SQLite backup timer"
install -m 0755 deploy/backup-db.sh /usr/local/bin/zzkd-backup
cat > /etc/systemd/system/zzkd-backup.service <<'UNIT'
[Unit]
Description=Back up the ZEN Z KA DUKAN SQLite database

[Service]
Type=oneshot
WorkingDirectory=/opt/zen-z-ka-dukan
ExecStart=/usr/local/bin/zzkd-backup
UNIT
cat > /etc/systemd/system/zzkd-backup.timer <<'UNIT'
[Unit]
Description=Daily ZEN Z KA DUKAN database backup

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now zzkd-backup.timer

log "Done. Next steps:"
cat <<'NEXT'
  1. Free subdomain: sudo zzkd-duckdns --configure   (subdomain + token from duckdns.org)
  2. Edit .env: set SITE_DOMAIN (e.g. zen-z-ka-dukan.duckdns.org) and ACME_EMAIL.
  3. In the Oracle console, allow inbound TCP 80 and 443 in the subnet's security list.
  4. sudo docker compose up -d --build
  5. Open https://YOUR_DOMAIN/admin/setup and create the administrator with the
     ADMIN_BOOTSTRAP_TOKEN from .env, then remove that value from .env.

NEXT
