#!/usr/bin/env bash
# /usr/local/bin/zzkd-duckdns — keep a free DuckDNS subdomain pointed at this VM.
#
#   sudo install -m 0755 deploy/duckdns.sh /usr/local/bin/zzkd-duckdns
#   sudo /usr/local/bin/zzkd-duckdns --configure      # asks for subdomain + token
#
# Then the bundled systemd timer (installed by deploy/setup-vm.sh) refreshes it every 5 minutes,
# which also keeps the free DuckDNS record from expiring.
set -euo pipefail

CONF_DIR="/etc/zzkd"
CONF_FILE="${CONF_DIR}/duckdns.env"

if [[ "${1:-}" == "--configure" ]]; then
  install -d -m 700 "$CONF_DIR"
  read -rp "DuckDNS subdomain (the part before .duckdns.org): " sub
  read -rsp "DuckDNS token (from duckdns.org, hidden): " token
  echo
  cat > "$CONF_FILE" <<EOF
DUCKDNS_SUBDOMAIN=${sub}
DUCKDNS_TOKEN=${token}
EOF
  chmod 600 "$CONF_FILE"
  echo "Saved to $CONF_FILE (mode 600)."
  exit 0
fi

[[ -f "$CONF_FILE" ]] || { echo "Run: sudo $0 --configure" >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONF_FILE"

ip="$(curl -fsS --max-time 8 https://api.ipify.org || true)"
[[ -n "$ip" ]] || { echo "Could not determine the public IP" >&2; exit 1; }

response="$(curl -fsS --max-time 10 \
  "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=${ip}" || true)"

echo "$(date -Is) duckdns ${DUCKDNS_SUBDOMAIN}.duckdns.org -> ${ip} (${response:-no response})"
[[ "$response" == "OK" ]]
