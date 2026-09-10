#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${MARBO3A_APP_DIR:-/opt/marbo3a}"
SERVICE_FILE="/etc/systemd/system/marbo3a-auto-deploy.service"
TIMER_FILE="/etc/systemd/system/marbo3a-auto-deploy.timer"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

cd "$APP_DIR"
chmod +x ops/auto-deploy.sh

cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=MARBO3A automatic deploy check
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
Environment=MARBO3A_APP_DIR=$APP_DIR
Environment=MARBO3A_BRANCH=main
ExecStart=$APP_DIR/ops/auto-deploy.sh
User=root
EOF

cat >"$TIMER_FILE" <<'EOF'
[Unit]
Description=Check MARBO3A main branch for updates

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=20s
Persistent=true
Unit=marbo3a-auto-deploy.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now marbo3a-auto-deploy.timer
systemctl start marbo3a-auto-deploy.service || true

echo
echo "=== MARBO3A AUTO DEPLOY ENABLED ==="
systemctl --no-pager --full status marbo3a-auto-deploy.timer || true
echo
echo "Recent deploy log:"
journalctl -u marbo3a-auto-deploy.service -n 30 --no-pager || true
