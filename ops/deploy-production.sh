#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"
PREVIOUS="${2:-}"
REQUESTED_RELEASE_SHA="${3:-}"
cd "$ROOT"
if [ ! -f .env ]; then echo "ERROR: .env missing" >&2; exit 1; fi
if ! [[ "$REQUESTED_RELEASE_SHA" =~ ^[a-fA-F0-9]{40}$ ]]; then echo "ERROR: explicit 40-character release SHA required" >&2; exit 2; fi
if ! [[ "$PREVIOUS" =~ ^[a-fA-F0-9]{40}$ ]]; then echo "ERROR: explicit 40-character rollback SHA required" >&2; exit 3; fi
git cat-file -e "$REQUESTED_RELEASE_SHA^{commit}"
git cat-file -e "$PREVIOUS^{commit}"
CURRENT_HEAD="$(git rev-parse HEAD)"
if [ "$CURRENT_HEAD" != "$REQUESTED_RELEASE_SHA" ]; then echo "ERROR: worktree HEAD $CURRENT_HEAD does not match requested release $REQUESTED_RELEASE_SHA" >&2; exit 4; fi
chmod 600 .env
set -a; . ./.env; set +a
export MARBO3A_RELEASE_SHA="$REQUESTED_RELEASE_SHA"
mkdir -p .runtime/maintenance .deploy-backups
exec 9>"$ROOT/.runtime/deploy.lock"
if ! flock -n 9; then echo "ERROR: another MARBO3A deploy/maintenance operation is active" >&2; exit 1; fi
NEW_COMPOSE_SNAPSHOT="$ROOT/.runtime/compose.deploy.yml"
cp compose.yml "$NEW_COMPOSE_SNAPSHOT"
MAINTENANCE_STARTED=0

maintenance_db_on(){
  cat <<'SQL' | docker compose exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
INSERT INTO admin_system_settings(key,value,description) VALUES
 ('maintenance_mode','true'::jsonb,'Automatic deploy maintenance mode'),
 ('maintenance_eta_minutes','15'::jsonb,'Approximate deploy maintenance duration in minutes'),
 ('maintenance_started_at',to_jsonb(NOW()::text),'Timestamp for the current automatic maintenance window')
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW();
SQL
}
maintenance_db_off(){
  cat <<'SQL' | docker compose exec -T db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 || true
INSERT INTO admin_system_settings(key,value,description) VALUES
 ('maintenance_mode','false'::jsonb,'Automatic deploy maintenance mode'),
 ('maintenance_started_at','null'::jsonb,'Timestamp for the current automatic maintenance window')
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW();
SQL
}
wait_api(){
  for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1 && return 0; sleep 2; done
  return 1
}
wait_web_internal(){
  for _ in $(seq 1 60); do docker compose exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1 && return 0; sleep 2; done
  return 1
}
wait_public(){
  for _ in $(seq 1 30); do curl -fsS https://marbo3a.ly/ >/dev/null 2>&1 && return 0; sleep 2; done
  return 1
}
remove_new_gate(){
  docker compose --project-directory "$ROOT" -f "$NEW_COMPOSE_SNAPSHOT" rm -sf gate >/dev/null 2>&1 || true
}
rollback(){
  code=$?
  trap - ERR
  echo "deploy failed (code=$code)" >&2
  if [ "$MAINTENANCE_STARTED" = "1" ]; then echo "[rollback] keeping maintenance visible while restoring the previous release" >&2; fi
  if [ -n "$PREVIOUS" ]; then
    echo "[rollback] restoring application code to $PREVIOUS"
    if ! git reset --hard "$PREVIOUS"; then
      echo "[rollback] ERROR: could not reset to exact previous SHA; maintenance remains enabled" >&2
      exit "$code"
    fi
    ROLLBACK_HEAD="$(git rev-parse HEAD 2>/dev/null || true)"
    if [ "$ROLLBACK_HEAD" != "$PREVIOUS" ]; then
      echo "[rollback] ERROR: rollback HEAD mismatch; expected $PREVIOUS got $ROLLBACK_HEAD" >&2
      exit "$code"
    fi
    export MARBO3A_RELEASE_SHA="$ROLLBACK_HEAD"
    if grep -qE '^  gate:' compose.yml 2>/dev/null; then
      docker compose build api web || true
      docker compose up -d api web gate || true
      wait_api || true
      wait_web_internal || true
      maintenance_db_off
      sleep 6
      rm -f "$ROOT/.runtime/maintenance/enabled"
    else
      remove_new_gate
      rm -f "$ROOT/.runtime/maintenance/enabled"
      docker compose up -d --build api web || true
      wait_api || true
      for _ in $(seq 1 45); do curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1 && break; sleep 2; done
      maintenance_db_off
    fi
  else
    echo "[rollback] no previous revision was supplied; maintenance remains enabled for safety" >&2
  fi
  exit "$code"
}
trap rollback ERR

usage_percent(){ df -P / | awk 'NR==2{gsub(/%/,"",$5);print $5+0}'; }
DISK_BEFORE="$(usage_percent)"
echo "[deploy] disk preflight: ${DISK_BEFORE}% used"
if [ "$DISK_BEFORE" -ge 85 ]; then
  echo "[deploy] disk usage is critical; pruning unused Docker cache before deployment"
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -af --filter "until=24h" >/dev/null 2>&1 || true
fi
DISK_AFTER="$(usage_percent)"
if [ "$DISK_AFTER" -ge 92 ]; then echo "ERROR: disk usage remains ${DISK_AFTER}% after safe cache cleanup" >&2; exit 70; fi
if [ "$DISK_AFTER" -ge 70 ]; then echo "WARNING: disk usage is ${DISK_AFTER}%" >&2; fi

echo "[deploy] validating compose"
docker compose config >/dev/null

echo "[deploy] ensuring maintenance gate image is available"
docker compose pull gate >/dev/null

PRE_DUMP=""
if [ -n "$(docker compose ps -q db 2>/dev/null || true)" ]; then
  TS=$(date +%Y%m%d-%H%M%S); PRE_DUMP=".deploy-backups/predeploy-$TS.dump"
  docker compose exec -T db pg_dump -U "${POSTGRES_USER:-marbo3a}" -d "${POSTGRES_DB:-marbo3a}" -Fc > "$PRE_DUMP"
  test -s "$PRE_DUMP"
  find .deploy-backups -type f -name 'predeploy-*.dump' -mtime +14 -delete || true
fi

echo "[deploy] enabling automatic maintenance mode"
maintenance_db_on
MAINTENANCE_STARTED=1
touch "$ROOT/.runtime/maintenance/enabled"
# First Group A/B rollout migrates the public :3000 listener from web to the
# stable gate. Future deployments keep gate alive continuously.
docker compose stop web >/dev/null 2>&1 || true
docker compose up -d --no-deps gate
for _ in $(seq 1 20); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || true)"
  [ "$code" = "503" ] && break
  sleep 1
done
test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/)" = "503"

echo "[deploy] building locked application images"
docker compose build --pull api web

echo "[deploy] ensuring Web Push keys"
docker compose run --rm --no-deps -v "$ROOT/.env:/config/.env" api node ensure-vapid.mjs /config/.env
chmod 600 .env
set -a; . ./.env; set +a

echo "[deploy] pulling infrastructure images"
docker compose pull turn db redis backup gate

echo "[deploy] starting infrastructure"
docker compose up -d db redis turn backup gate

echo "[deploy] switching application containers behind maintenance gate"
docker compose up -d --force-recreate api web
wait_api
wait_web_internal
curl -fsS http://127.0.0.1:4000/api/health >/dev/null

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

echo "[deploy] disabling maintenance after successful health/restore checks"
maintenance_db_off
sleep 6
rm -f "$ROOT/.runtime/maintenance/enabled"
wait_public
curl -fsS https://marbo3a.ly/api/health >/dev/null

echo "[deploy] pruning unused build cache and stale images"
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -af --filter "until=24h" >/dev/null 2>&1 || true

if [ "$(id -u)" = "0" ] && [ -d /etc/cron.d ]; then
  cat > /etc/cron.d/marbo3a-disk-monitor <<EOF
*/15 * * * * root cd $ROOT && /usr/bin/env bash $ROOT/ops/disk-monitor.sh $ROOT >/dev/null 2>&1
EOF
  chmod 0644 /etc/cron.d/marbo3a-disk-monitor
fi

echo "[deploy] final foundation audit"
bash ops/audit-foundation.sh "$ROOT"

echo "[deploy] final status"
FINAL_HEAD="$(git rev-parse HEAD)"
test "$FINAL_HEAD" = "$REQUESTED_RELEASE_SHA"
docker compose ps
git log -1 --oneline
df -h /
docker system df
trap - ERR
echo "MARBO3A deploy completed at immutable SHA $FINAL_HEAD"
