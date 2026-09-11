#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found in project root" >&2
  exit 1
fi

# Reuse the existing production values instead of silently rotating TURN_SECRET.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

PUBLIC_IP="${TURN_EXTERNAL_IP:-}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(curl -4 -fsS https://api.ipify.org || true)"
fi
if [ -z "$PUBLIC_IP" ]; then
  echo "ERROR: could not detect public IPv4. Run with TURN_EXTERNAL_IP=x.x.x.x" >&2
  exit 1
fi

SECRET="${TURN_SECRET:-}"
if [ -z "$SECRET" ]; then
  SECRET="$(openssl rand -hex 32)"
fi

set_env(){
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=${value}#" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env TURN_EXTERNAL_IP "$PUBLIC_IP"
set_env TURN_HOST "${TURN_HOST:-$PUBLIC_IP}"
set_env TURN_REALM "${TURN_REALM:-marbo3a.ly}"
set_env TURN_SECRET "$SECRET"

echo "TURN configuration ready"
echo "Public IP: $PUBLIC_IP"
echo "Listening: 3478/udp and 3478/tcp"
echo "Relay: 49160-49200/udp and tcp"
if [ -n "${TURN_TLS_HOST:-}" ]; then
  echo "TLS fallback advertised by API: turns:${TURN_TLS_HOST}:${TURN_TLS_PORT:-443}?transport=tcp"
else
  echo "TLS fallback: not configured (optional TURN_TLS_HOST / TURN_TLS_PORT)"
fi

echo
echo "Starting API + web first so TURN cannot take the site offline..."
docker compose up -d --build api web

echo
echo "Starting TURN independently..."
docker compose up -d --force-recreate turn || true

for _ in $(seq 1 18); do
  cid="$(docker compose ps -q turn 2>/dev/null || true)"
  if [ -z "$cid" ]; then
    status="missing"
  else
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  fi
  [ "$status" = "healthy" ] && break
  [ "$status" = "unhealthy" ] && break
  [ "$status" = "exited" ] && break
  sleep 2
done

echo
printf '%s\n' "===== TURN STATUS ====="
docker compose ps turn || true
printf '%s\n' "===== TURN LOGS ====="
docker compose logs --tail=120 turn || true
printf '%s\n' "===== API HEALTH ====="
if curl -fsS http://127.0.0.1:4000/api/health; then
  echo
else
  echo "API health check failed" >&2
fi

cid="$(docker compose ps -q turn 2>/dev/null || true)"
if [ -z "$cid" ]; then
  status="missing"
else
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
fi
if [ "$status" != "healthy" ]; then
  echo "ERROR: TURN is not healthy (status=$status). The site/API stays online, but do not test calls until TURN is fixed." >&2
  exit 2
fi

echo "TURN is healthy."
echo "If UFW is enabled, allow all of these:"
echo "  3478/tcp"
echo "  3478/udp"
echo "  49160:49200/tcp"
echo "  49160:49200/udp"
echo
echo "For a relay-only browser test run in DevTools:"
echo "  localStorage.setItem('marbo3a_force_relay','1'); location.reload();"
echo "After testing:"
echo "  localStorage.removeItem('marbo3a_force_relay'); location.reload();"
