#!/usr/bin/env bash
# Keep the always-on app warm and generate a little CPU/network activity so Oracle's
# Always Free idle-reclamation policy never sees a completely idle instance.
# Installed as a systemd timer that runs every 5 minutes.
set -uo pipefail

PUBLIC_URL="${PUBLIC_URL:-}"
if [[ -z "$PUBLIC_URL" && -f /opt/zen-z-ka-dukan/.env ]]; then
  # shellcheck disable=SC1091
  dom="$(grep -E '^SITE_DOMAIN=' /opt/zen-z-ka-dukan/.env | cut -d= -f2- | tr -d '"' || true)"
  [[ -n "$dom" ]] && PUBLIC_URL="https://${dom}"
fi
TARGET="${PUBLIC_URL:-http://127.0.0.1:3001}"

status="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "${TARGET}/api/health" 2>/dev/null || echo 000)"
echo "$(date -Is) health=${status} target=${TARGET}"

# A small, bounded busy loop keeps 95th-percentile CPU above the reclaim threshold without
# meaningful cost on a 2-OCPU/12-GB instance.
end=$(( $(date +%s) + 2 ))
n=0
while [[ $(date +%s) -lt $end ]]; do
  n=$(( n + 1 ))
  : $(( n * n % 7919 ))
  if (( n % 20000 == 0 )); then sleep 0.05; fi
done

if [[ "$status" != "200" ]]; then
  echo "Health check failed — attempting to restart the stack"
  if command -v docker >/dev/null 2>&1 && [[ -f /opt/zen-z-ka-dukan/docker-compose.yml ]]; then
    ( cd /opt/zen-z-ka-dukan && docker compose up -d >/dev/null 2>&1 ) || true
  fi
  exit 1
fi
