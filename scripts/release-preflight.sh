#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
EXPECTED_SHA="${RELEASE_CANDIDATE_SHA:-}"
[ -n "$EXPECTED_SHA" ] || { echo 'ERROR: RELEASE_CANDIDATE_SHA is required' >&2; exit 2; }
ACTUAL_SHA="$(git rev-parse HEAD)"
[ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || { echo "ERROR: candidate mismatch expected=$EXPECTED_SHA actual=$ACTUAL_SHA" >&2; exit 3; }
[ -z "$(git status --porcelain)" ] || { echo 'ERROR: working tree is not clean' >&2; exit 4; }

for f in docs/GROUP14-E2E-MATRIX.md docs/RELEASE-CLOSURE.md scripts/group14-source-qa.sh scripts/group14-runtime-smoke.mjs ops/backup-database.sh ops/verify-backup-restore.sh; do [ -s "$f" ] || { echo "ERROR: missing release artifact $f" >&2; exit 5; }; done

if grep -Eq 'PRODUCTION_READY:[[:space:]]*YES|RELEASED:[[:space:]]*YES' docs/RELEASE-CLOSURE.md; then echo 'ERROR: static source must not self-certify production/released state' >&2; exit 6; fi

bash scripts/group14-source-qa.sh "$ROOT"
echo "release source preflight passed for $ACTUAL_SHA"
echo 'Runtime Group 14 evidence, CI gate (while paused), offsite restore proof and explicit deployment approval remain separate mandatory release gates.'
