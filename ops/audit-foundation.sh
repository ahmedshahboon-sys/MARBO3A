#!/usr/bin/env bash
set -u
ROOT="${1:-/opt/marbo3a}"
cd "$ROOT" || exit 2
FAIL=0
WARNINGS=0
ok(){ printf 'FULL    %s\n' "$1"; }
warn(){ printf 'PARTIAL %s\n' "$1"; WARNINGS=$((WARNINGS+1)); }
fail(){ printf 'FAILED  %s\n' "$1"; FAIL=$((FAIL+1)); }

printf '===== MARBO3A FOUNDATION AUDIT =====\n'
printf 'HEAD: '; git log -1 --oneline 2>/dev/null || true
printf 'Branch: '; git branch --show-current 2>/dev/null || true
if git diff --quiet && git diff --cached --quiet; then ok 'tracked working tree clean'; else warn 'tracked working tree has local changes'; fi

if docker compose config >/dev/null 2>&1; then ok 'compose configuration valid'; else fail 'compose configuration invalid'; fi
services="$(docker compose config --services 2>/dev/null || true)"
for service in db redis turn api web gate backup; do
  if grep -qx "$service" <<<"$services"; then ok "service declared: $service"; else fail "service missing: $service"; fi
done

if curl -fsS http://127.0.0.1:4000/api/health >/tmp/marbo3a-audit-health.json 2>/dev/null; then ok 'API health reachable'; cat /tmp/marbo3a-audit-health.json; echo; else fail 'API health unavailable'; fi
if curl -fsS http://127.0.0.1:3000/__gate_health >/dev/null 2>&1; then ok 'maintenance gate reachable on :3000'; else fail 'maintenance gate unavailable on :3000'; fi
if docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then ok 'web application healthy behind gate'; else fail 'web application internal health failed'; fi
if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then ok 'Redis connected'; else fail 'Redis ping failed'; fi

if docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1"' >/tmp/marbo3a-audit-migration.txt 2>/dev/null; then
  latest="$(cat /tmp/marbo3a-audit-migration.txt)"; ok "database migrations applied; latest=${latest:-unknown}"
else fail 'database migration state unavailable'; fi

TURN_ID="$(docker compose ps -q turn 2>/dev/null || true)"
if [ -n "$TURN_ID" ]; then
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$TURN_ID" 2>/dev/null || true)"
  if [ "$state" = healthy ]; then ok 'TURN healthy'; else fail "TURN state=$state"; fi
else fail 'TURN container missing'; fi

maintenance="$(docker compose exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT COALESCE(value::text,'\''false'\'') FROM admin_system_settings WHERE key='\''maintenance_mode'\''"' 2>/dev/null || true)"
if [ "$maintenance" = false ]; then ok 'maintenance mode disabled'; else warn "maintenance mode state=${maintenance:-unknown}"; fi

usage="$(df -P / | awk 'NR==2{gsub(/%/,"",$5);print $5+0}')"
avail="$(df -h / | awk 'NR==2{print $4}')"
if [ "$usage" -lt 70 ]; then ok "disk usage ${usage}% (${avail} available)"; elif [ "$usage" -lt 85 ]; then warn "disk usage ${usage}% (${avail} available)"; else fail "disk usage critical ${usage}% (${avail} available)"; fi

echo '===== DOCKER DISK ====='
docker system df 2>/dev/null || warn 'docker disk report unavailable'
echo '===== CONTAINERS ====='
docker compose ps 2>/dev/null || true

if docker compose exec -T backup sh -lc 'latest=$(ls -1t /backups/marbo3a-*.dump 2>/dev/null | head -1); [ -n "$latest" ] && [ -s "$latest" ] && echo "$latest"' >/tmp/marbo3a-audit-backup.txt 2>/dev/null; then
  ok "daily backup present: $(cat /tmp/marbo3a-audit-backup.txt)"
else warn 'no completed daily backup visible yet'; fi

if [ "$FAIL" -gt 0 ]; then
  printf 'FOUNDATION_AUDIT=FAIL failures=%s warnings=%s\n' "$FAIL" "$WARNINGS"
  exit 1
fi
if [ "$WARNINGS" -gt 0 ]; then
  printf 'FOUNDATION_AUDIT=PASS_WITH_WARNINGS warnings=%s\n' "$WARNINGS"
else
  echo 'FOUNDATION_AUDIT=PASS'
fi
