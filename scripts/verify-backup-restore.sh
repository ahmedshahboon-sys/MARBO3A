#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
TMP_DB="marbo3a_restorecheck_$(date +%s)"
echo "[restore-check] locating newest backup..."
LATEST=$(docker compose exec -T backup sh -lc 'ls -1t /backups/marbo3a-*.dump 2>/dev/null | head -n1')
[ -n "$LATEST" ] || { echo "[restore-check] no backup found" >&2; exit 1; }
echo "[restore-check] validating archive catalog..."
docker compose exec -T backup sh -lc "pg_restore -l '$LATEST' >/dev/null"
echo "[restore-check] restoring into temporary database $TMP_DB ..."
docker compose exec -T backup sh -lc "export PGPASSWORD=\"\$POSTGRES_PASSWORD\"; createdb -h db -U \"\${POSTGRES_USER:-marbo3a}\" '$TMP_DB'; pg_restore -h db -U \"\${POSTGRES_USER:-marbo3a}\" -d '$TMP_DB' --no-owner --no-privileges '$LATEST'; psql -h db -U \"\${POSTGRES_USER:-marbo3a}\" -d '$TMP_DB' -Atc \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';\"; dropdb -h db -U \"\${POSTGRES_USER:-marbo3a}\" '$TMP_DB'"
echo "[restore-check] OK — backup can be restored"
