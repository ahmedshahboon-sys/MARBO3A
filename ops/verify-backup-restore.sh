#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"
BACKUP="${2:-}"
cd "$ROOT"
[ -n "$BACKUP" ] && [ -f "$BACKUP" ] || { echo "usage: $0 ROOT backup.dump.age" >&2; exit 1; }
[ -f .env ] || { echo "ERROR: .env missing" >&2; exit 1; }
set -a; . ./.env; set +a
command -v age >/dev/null || { echo "ERROR: age missing" >&2; exit 2; }
[ -n "${BACKUP_AGE_IDENTITY:-}" ] || { echo "ERROR: BACKUP_AGE_IDENTITY must point to the private age identity" >&2; exit 3; }
[ -f "$BACKUP_AGE_IDENTITY" ] || { echo "ERROR: age identity file missing" >&2; exit 4; }
MANIFEST="${BACKUP%.dump.age}.sha256"
if [ -f "$MANIFEST" ]; then
  (cd "$(dirname "$BACKUP")" && sha256sum -c "$(basename "$MANIFEST")" >/dev/null)
else
  echo "WARN: checksum manifest not found beside backup; continuing restore verification" >&2
fi
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
age -d -i "$BACKUP_AGE_IDENTITY" -o "$TMP" "$BACKUP"
test -s "$TMP"
CHECK_DB="marbo3a_restorecheck_$(date +%s)_$RANDOM"
docker compose cp "$TMP" db:/tmp/marbo3a-restorecheck.dump >/dev/null
docker compose exec -T db sh -lc "set -e; createdb -U \"\${POSTGRES_USER:-marbo3a}\" '$CHECK_DB'; trap 'dropdb -U \"\${POSTGRES_USER:-marbo3a}\" --if-exists '$CHECK_DB' >/dev/null 2>&1 || true; rm -f /tmp/marbo3a-restorecheck.dump' EXIT; pg_restore -U \"\${POSTGRES_USER:-marbo3a}\" -d '$CHECK_DB' --no-owner --no-privileges /tmp/marbo3a-restorecheck.dump; TABLES=\$(psql -U \"\${POSTGRES_USER:-marbo3a}\" -d '$CHECK_DB' -Atc \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'\"); test \"$TABLES\" -gt 0; psql -U \"\${POSTGRES_USER:-marbo3a}\" -d '$CHECK_DB' -Atc \"SELECT COUNT(*) FROM users\" >/dev/null"
docker compose exec -T db psql -U "${POSTGRES_USER:-marbo3a}" -d "${POSTGRES_DB:-marbo3a}" -v ON_ERROR_STOP=1 -c "INSERT INTO operational_verifications(kind,status) VALUES ('restore_success','success')" >/dev/null 2>&1 || echo "WARN: restore verification succeeded but timestamp could not be recorded" >&2
echo "restore verification passed: $BACKUP"
