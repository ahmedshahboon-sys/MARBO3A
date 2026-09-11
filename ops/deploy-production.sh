#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"; PREVIOUS="${2:-}"; cd "$ROOT"
if [ ! -f .env ]; then echo "ERROR: .env missing" >&2; exit 1; fi
chmod 600 .env
set -a; . ./.env; set +a
rollback(){ code=$?; echo "deploy failed (code=$code)" >&2; if [ -n "$PREVIOUS" ]; then echo "rolling application code back to $PREVIOUS"; git reset --hard "$PREVIOUS"; docker compose up -d --build api web || true; fi; exit "$code"; }
trap rollback ERR
mkdir -p .deploy-backups
PRE_DUMP=""
if [ -n "$(docker compose ps -q db 2>/dev/null || true)" ]; then
  TS=$(date +%Y%m%d-%H%M%S); PRE_DUMP=".deploy-backups/predeploy-$TS.dump"
  docker compose exec -T db pg_dump -U "${POSTGRES_USER:-marbo3a}" -d "${POSTGRES_DB:-marbo3a}" -Fc > "$PRE_DUMP"
  test -s "$PRE_DUMP"
  find .deploy-backups -type f -name 'predeploy-*.dump' -mtime +14 -delete || true
fi

echo "[deploy] validating compose"
docker compose config >/dev/null

echo "[deploy] building locked application images"
docker compose build --pull api web

echo "[deploy] ensuring Web Push keys"
docker compose run --rm --no-deps -v "$ROOT/.env:/config/.env" api node ensure-vapid.mjs /config/.env
chmod 600 .env
set -a; . ./.env; set +a

echo "[deploy] pulling infrastructure images"
docker compose pull turn db redis backup

echo "[deploy] starting services"
docker compose up -d --force-recreate --remove-orphans

for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:4000/api/health >/dev/null
curl -fsS http://127.0.0.1:3000/ >/dev/null
curl -fsSI https://marbo3a.ly/ >/dev/null

TURN_ID=$(docker compose ps -q turn || true)
if [ -n "$TURN_ID" ]; then
  TURN_STATE=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$TURN_ID")
  [ "$TURN_STATE" = "healthy" ]
fi

if [ -n "$PRE_DUMP" ] && [ -s "$PRE_DUMP" ]; then
  echo "[deploy] verifying pre-deploy backup can be restored"
  CHECK_DB="marbo3a_restorecheck_$(date +%s)"
  docker compose cp "$PRE_DUMP" db:/tmp/marbo3a-predeploy.dump >/dev/null
  docker compose exec -T db sh -lc "set -e; createdb -U \"\${POSTGRES_USER:-marbo3a}\" '$CHECK_DB'; trap 'dropdb -U \"\${POSTGRES_USER:-marbo3a}\" --if-exists '$CHECK_DB' >/dev/null 2>&1 || true; rm -f /tmp/marbo3a-predeploy.dump' EXIT; pg_restore -U \"\${POSTGRES_USER:-marbo3a}\" -d '$CHECK_DB' --no-owner --no-privileges /tmp/marbo3a-predeploy.dump; test \"\$(psql -U \"\${POSTGRES_USER:-marbo3a}\" -d '$CHECK_DB' -Atc \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'\")\" -gt 0"
fi

echo "[deploy] final status"
docker compose ps
git log -1 --oneline
trap - ERR
echo "MARBO3A deploy completed"
