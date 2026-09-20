#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"
[ "$(id -u)" = "0" ] || { echo "ERROR: run as root" >&2; exit 1; }
cd "$ROOT"
[ -f .env ] || { echo "ERROR: .env missing" >&2; exit 2; }
set -a; . ./.env; set +a
[ -n "${BACKUP_AGE_RECIPIENT:-}" ] || { echo "ERROR: BACKUP_AGE_RECIPIENT missing" >&2; exit 3; }
[ -n "${BACKUP_OFFSITE_DIR:-}" ] || { echo "ERROR: BACKUP_OFFSITE_DIR missing" >&2; exit 4; }
[ -n "${BACKUP_AGE_IDENTITY:-}" ] && [ -f "$BACKUP_AGE_IDENTITY" ] || { echo "ERROR: BACKUP_AGE_IDENTITY missing/unreadable" >&2; exit 5; }
install -m 0644 ops/systemd/marbo3a-backup.service /etc/systemd/system/marbo3a-backup.service
install -m 0644 ops/systemd/marbo3a-backup.timer /etc/systemd/system/marbo3a-backup.timer
install -m 0644 ops/systemd/marbo3a-restore-drill.service /etc/systemd/system/marbo3a-restore-drill.service
install -m 0644 ops/systemd/marbo3a-restore-drill.timer /etc/systemd/system/marbo3a-restore-drill.timer
systemctl daemon-reload
systemctl enable --now marbo3a-backup.timer marbo3a-restore-drill.timer
systemctl list-timers --all 'marbo3a-*'
