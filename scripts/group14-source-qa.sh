#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

echo '[group14] backend source contracts'
node --test backend/tests/*.test.mjs

echo '[group14] frontend source contracts'
(
  cd frontend
  npm run test:contracts
)

echo '[group14] deployment/config syntax'
docker compose config >/dev/null
bash -n ops/deploy-production.sh ops/backup-database.sh ops/verify-backup-restore.sh scripts/verify-backup-restore.sh

echo '[group14] forbidden source regressions'
! grep -RIn --exclude-dir=node_modules --exclude-dir=.next -E 'supabase\.co|@supabase|createClient\([^)]*supabase' backend frontend
! grep -RIn --exclude-dir=node_modules --exclude-dir=.next -E 'docker compose down[[:space:]]+-v|docker-compose down[[:space:]]+-v' ops scripts

echo '[group14] source QA passed'
