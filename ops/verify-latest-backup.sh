#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"
cd "$ROOT"
[ -f .env ] || { echo "ERROR: .env missing" >&2; exit 1; }
set -a; . ./.env; set +a
DIR="${BACKUP_OFFSITE_DIR:-${BACKUP_DIR:-$ROOT/.backups/database}}"
LATEST="$(find "$DIR" -maxdepth 1 -type f -name 'marbo3a-*.dump.age' -printf '%T@ %p\n' | sort -nr | awk 'NR==1{sub(/^[^ ]+ /,"");print}')"
[ -n "$LATEST" ] && [ -f "$LATEST" ] || { echo "ERROR: no encrypted backup found in $DIR" >&2; exit 2; }
exec "$ROOT/ops/verify-backup-restore.sh" "$ROOT" "$LATEST"
