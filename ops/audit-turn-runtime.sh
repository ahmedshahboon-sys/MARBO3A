#!/usr/bin/env bash
# Read-only TURN production audit. Makes no firewall/container/config changes.
set -u
cd "$(dirname "$0")/.."
MIN_PORT=49152
MAX_PORT=49663

echo "===== TURN CONTAINER ====="
docker compose ps turn 2>&1 || true

echo
echo "===== TURN EFFECTIVE COMPOSE ====="
docker compose config 2>/dev/null | grep -E -A28 '^[[:space:]]+turn:' | grep -E 'image:|3478|49152|49663|min-port|max-port|external-ip|no-tls|static-auth-secret' || true

echo
echo "===== LISTENERS ====="
ss -lntup 2>/dev/null | grep -E ':(3478|5349)\b' || true

echo
echo "===== FIREWALL ====="
if command -v ufw >/dev/null 2>&1; then
  ufw status numbered 2>&1 || true
else
  echo "ufw not installed"
fi

echo
echo "===== TURN RECENT CAPACITY/ALLOCATION LOGS ====="
docker compose logs --since=24h turn 2>&1 | grep -Ei 'no available ports|allocation|relay|socket|error|fail' | tail -n 250 || true

echo
echo "===== TURN RESOURCE LIMITS ====="
CID="$(docker compose ps -q turn 2>/dev/null || true)"
if [ -n "$CID" ]; then
  PID="$(docker inspect --format '{{.State.Pid}}' "$CID" 2>/dev/null || true)"
  docker stats --no-stream "$CID" 2>&1 || true
  if [ -n "$PID" ] && [ -r "/proc/$PID/limits" ]; then
    grep -E 'Max open files|Max processes' "/proc/$PID/limits" || true
  fi
else
  echo "TURN container not running"
fi

echo
echo "===== HOST UDP RANGE / FD STATE ====="
sysctl net.ipv4.ip_local_port_range 2>/dev/null || true
ulimit -n 2>/dev/null || true

echo
echo "===== EXPECTED PUBLIC PORTS ====="
echo "3478/tcp + 3478/udp"
echo "$MIN_PORT:$MAX_PORT/tcp + $MIN_PORT:$MAX_PORT/udp"
echo "TLS 5349/tcp only when TURN_TLS_HOST/TLS listener is actually configured."
echo
echo "Read-only audit complete. This script does not prove relay success; run a forced-relay two-network E2E separately."
