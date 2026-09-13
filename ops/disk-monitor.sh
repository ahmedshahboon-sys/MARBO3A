#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"
WARN="${MARBO3A_DISK_WARN_PERCENT:-70}"
CRITICAL="${MARBO3A_DISK_CRITICAL_PERCENT:-85}"
cd "$ROOT"
mkdir -p .runtime
exec 8>"$ROOT/.runtime/deploy.lock"
if ! flock -n 8; then
  exit 0
fi

usage_percent(){ df -P / | awk 'NR==2{gsub(/%/,"",$5); print $5+0}'; }
record_alert(){
  local severity="$1" usage="$2" before="$3" window
  window="$(date -u +%Y%m%d%H)"
  if [ -n "$(docker compose ps -q db 2>/dev/null || true)" ]; then
    docker compose exec -T db sh -lc "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"INSERT INTO admin_anomaly_alerts(alert_type,window_key,severity,metric_value,threshold_value,details) VALUES ('disk_usage','$window','$severity',$usage,$WARN,jsonb_build_object('usage_percent',$usage,'before_cleanup',$before,'warning_percent',$WARN,'critical_percent',$CRITICAL,'filesystem','/')) ON CONFLICT(alert_type,window_key) DO UPDATE SET severity=EXCLUDED.severity,metric_value=EXCLUDED.metric_value,threshold_value=EXCLUDED.threshold_value,details=EXCLUDED.details,detected_at=NOW(),status='open',acknowledged_by=NULL,acknowledged_at=NULL;\"" >/dev/null 2>&1 || true
  fi
}

before="$(usage_percent)"
after="$before"
if [ "$before" -ge "$CRITICAL" ]; then
  logger -t marbo3a-disk "critical disk usage ${before}% - pruning unused Docker cache" 2>/dev/null || true
  docker builder prune -af >/dev/null 2>&1 || true
  docker image prune -af --filter "until=24h" >/dev/null 2>&1 || true
  after="$(usage_percent)"
  record_alert critical "$after" "$before"
elif [ "$before" -ge "$WARN" ]; then
  logger -t marbo3a-disk "warning disk usage ${before}%" 2>/dev/null || true
  record_alert warning "$before" "$before"
fi

printf 'MARBO3A disk usage: %s%% (warning=%s%% critical=%s%%)\n' "$after" "$WARN" "$CRITICAL"
