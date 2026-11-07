#!/usr/bin/env bash
# Consistent SQLite backup from inside the running app container.
# SQLite's online backup API is used through better-sqlite3, so the copy is safe while the
# site is live. Backups rotate: the last 7 daily files, then one per week is left in place.
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/zen-z-ka-dukan}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/zen-z-ka-dukan}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

container="$(docker ps --filter 'name=zzkd-app' --format '{{.Names}}' | head -1)"
if [[ -z "$container" ]]; then
  echo "zzkd-app container is not running; skipping backup" >&2
  exit 1
fi

TMP_DB="/app/data/.backup-${STAMP}.db"
docker exec "$container" node -e "
const Database = require('better-sqlite3');
const src = new Database('/app/data/zen.db', { readonly: true });
src.backup('${TMP_DB}')
  .then(() => { src.close(); console.log('backup ok'); })
  .catch((error) => { console.error(error); process.exit(1); });
" || { echo "Database backup failed" >&2; exit 1; }

docker cp "${container}:${TMP_DB}" "${BACKUP_DIR}/zen-${STAMP}.db" >/dev/null
docker exec "$container" rm -f "$TMP_DB" || true
chmod 600 "${BACKUP_DIR}/zen-${STAMP}.db"

# Uploads are user data too: archive them (seed media can be regenerated, admin media cannot).
docker exec "$container" tar -czf "/tmp/uploads-${STAMP}.tar.gz" -C /app/data uploads/products uploads/categories uploads/spin uploads/models 2>/dev/null || true
docker cp "${container}:/tmp/uploads-${STAMP}.tar.gz" "${BACKUP_DIR}/uploads-${STAMP}.tar.gz" >/dev/null 2>&1 || true
docker exec "$container" rm -f "/tmp/uploads-${STAMP}.tar.gz" || true
chmod 600 "${BACKUP_DIR}/uploads-${STAMP}.tar.gz" 2>/dev/null || true

find "$BACKUP_DIR" -maxdepth 1 -name 'zen-*.db' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup complete: ${BACKUP_DIR}/zen-${STAMP}.db ($(du -h "${BACKUP_DIR}/zen-${STAMP}.db" | cut -f1))"
