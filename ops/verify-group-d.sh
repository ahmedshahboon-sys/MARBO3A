#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"
cd "$ROOT"

echo "===== GROUP D · SOURCE ====="
git log -1 --oneline

echo "===== GROUP D · CONTAINERS ====="
docker compose ps

echo "===== GROUP D · API HEALTH ====="
curl -fsS http://127.0.0.1:4000/api/health
echo

echo "===== GROUP D · PUBLIC HEALTH ====="
curl -fsS https://marbo3a.ly/api/health
echo

echo "===== GROUP D · PWA ====="
curl -fsS https://marbo3a.ly/manifest.webmanifest >/dev/null
curl -fsS https://marbo3a.ly/sw.js >/dev/null
curl -fsSI https://marbo3a.ly/pwa-192.png >/dev/null
curl -fsSI https://marbo3a.ly/pwa-512.png >/dev/null
echo "PWA assets: OK"

echo "===== GROUP D · TURN ====="
TURN_ID=$(docker compose ps -q turn || true)
if [ -z "$TURN_ID" ]; then
  echo "TURN container missing" >&2
  exit 1
fi
TURN_STATE=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$TURN_ID")
echo "TURN: $TURN_STATE"
[ "$TURN_STATE" = "healthy" ]

echo "===== GROUP D · FRONTEND CONTRACTS ====="
docker compose exec -T web sh -lc 'test -f /app/public/sw.js || test -f /app/.next/server/app-paths-manifest.json'

echo "GROUP D server verification passed"
