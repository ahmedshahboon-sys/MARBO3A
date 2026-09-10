#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found in project root" >&2
  exit 1
fi

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
set_env TURN_HOST "$PUBLIC_IP"
set_env TURN_REALM "marbo3a.ly"
set_env TURN_SECRET "$SECRET"

echo "TURN configuration written to .env"
echo "Public IP: $PUBLIC_IP"
echo "Relay UDP range: 49160-49200"
echo "Listening: 3478/udp and 3478/tcp"
echo

echo "Starting TURN + API..."
docker compose up -d --build turn api web
sleep 8

echo
printf '%s\n' "===== TURN STATUS ====="
docker compose ps turn
printf '%s\n' "===== TURN LOGS ====="
docker compose logs --tail=40 turn
printf '%s\n' "===== API HEALTH ====="
curl -fsS http://127.0.0.1:4000/api/health || true
echo

echo "If UFW is enabled, allow:"
echo "  3478/tcp"
echo "  3478/udp"
echo "  49160:49200/udp"
