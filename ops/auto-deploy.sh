#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARBO3A_APP_DIR:-/opt/marbo3a}"
BRANCH="${MARBO3A_BRANCH:-main}"
LOCK_FILE="/var/lock/marbo3a-auto-deploy.lock"
LOG_TAG="marbo3a-auto-deploy"

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

log(){ logger -t "$LOG_TAG" -- "$*"; printf '[%s] %s\n' "$(date -Is)" "$*"; }

cd "$APP_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "ERROR: $APP_DIR is not a git repository"
  exit 1
fi

log "checking origin/$BRANCH"
git fetch --quiet origin "$BRANCH"
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"

if [[ "$LOCAL_SHA" == "$REMOTE_SHA" ]]; then
  log "no changes"
  exit 0
fi

log "deploying $LOCAL_SHA -> $REMOTE_SHA"
git reset --hard "origin/$BRANCH"

docker compose up -d --build

for i in {1..30}; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null; then
    log "deploy successful: $REMOTE_SHA"
    exit 0
  fi
  sleep 2
done

log "ERROR: health check failed after deploy $REMOTE_SHA"
docker compose ps || true
docker compose logs --tail=120 api || true
docker compose logs --tail=80 web || true
exit 1
