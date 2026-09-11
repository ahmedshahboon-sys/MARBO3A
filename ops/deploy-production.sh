#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"; PREVIOUS="${2:-}"; cd "$ROOT"
if [ ! -f .env ]; then echo "ERROR: .env missing" >&2; exit 1; fi
set -a; . ./.env; set +a
rollback(){ code=$?; echo "deploy failed (code=$code)" >&2; if [ -n "$PREVIOUS" ]; then echo "rolling back to $PREVIOUS"; git reset --hard "$PREVIOUS"; docker compose up -d --build api web || true; fi; exit "$code"; }
trap rollback ERR
mkdir -p .deploy-backups
if docker compose ps -q db >/dev/null 2>&1; then TS=$(date +%Y%m%d-%H%M%S); docker compose exec -T db pg_dump -U "${POSTGRES_USER:-marbo3a}" -d "${POSTGRES_DB:-marbo3a}" -Fc > ".deploy-backups/predeploy-$TS.dump" || true; find .deploy-backups -type f -name 'predeploy-*.dump' -mtime +14 -delete || true; fi
docker compose up -d --build
for _ in $(seq 1 30); do if curl -fsS http://127.0.0.1:4000/api/health >/dev/null && curl -fsS http://127.0.0.1:3000/ >/dev/null; then break; fi; sleep 2; done
curl -fsS http://127.0.0.1:4000/api/health >/dev/null
curl -fsS http://127.0.0.1:3000/ >/dev/null
TURN_ID=$(docker compose ps -q turn || true); if [ -n "$TURN_ID" ]; then TURN_STATE=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$TURN_ID"); [ "$TURN_STATE" = "healthy" ]; fi
docker compose ps
trap - ERR
echo "MARBO3A deploy completed"
