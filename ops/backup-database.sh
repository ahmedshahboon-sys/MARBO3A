#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/opt/marbo3a}"
cd "$ROOT"
[ -f .env ] || { echo "ERROR: .env missing" >&2; exit 1; }
set -a; . ./.env; set +a
umask 077
OUT="${BACKUP_DIR:-$ROOT/.backups/database}"
mkdir -p "$OUT"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
RAW="$OUT/marbo3a-$TS.dump"
ENC="$RAW.age"
MANIFEST="$OUT/marbo3a-$TS.sha256"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-marbo3a}" -d "${POSTGRES_DB:-marbo3a}" -Fc > "$RAW"
test -s "$RAW"

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  command -v age >/dev/null || { echo "ERROR: age is required when BACKUP_AGE_RECIPIENT is configured" >&2; rm -f "$RAW"; exit 2; }
  age -r "$BACKUP_AGE_RECIPIENT" -o "$ENC" "$RAW"
  rm -f "$RAW"
  (cd "$OUT" && sha256sum "$(basename "$ENC")" > "$(basename "$MANIFEST")")
  FINAL="$ENC"
else
  echo "ERROR: BACKUP_AGE_RECIPIENT is required; refusing to keep an unencrypted scheduled backup" >&2
  rm -f "$RAW"
  exit 3
fi

REQUIRE_OFFSITE="${BACKUP_REQUIRE_OFFSITE:-true}"
if [ -z "${BACKUP_OFFSITE_DIR:-}" ]; then
  if [ "$REQUIRE_OFFSITE" = "true" ]; then
    echo "ERROR: BACKUP_OFFSITE_DIR is required when BACKUP_REQUIRE_OFFSITE=true" >&2
    exit 4
  fi
  echo "WARN: offsite backup copy disabled" >&2
else
  mkdir -p "$BACKUP_OFFSITE_DIR"
  cp -p "$FINAL" "$MANIFEST" "$BACKUP_OFFSITE_DIR/"
  (cd "$BACKUP_OFFSITE_DIR" && sha256sum -c "$(basename "$MANIFEST")" >/dev/null)
fi
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
find "$OUT" -type f \( -name 'marbo3a-*.dump.age' -o -name 'marbo3a-*.sha256' \) -mtime +"$RETENTION_DAYS" -delete
if [ -n "${BACKUP_OFFSITE_DIR:-}" ]; then
  find "$BACKUP_OFFSITE_DIR" -maxdepth 1 -type f \( -name 'marbo3a-*.dump.age' -o -name 'marbo3a-*.sha256' \) -mtime +"$RETENTION_DAYS" -delete
fi
docker compose exec -T db psql -U "${POSTGRES_USER:-marbo3a}" -d "${POSTGRES_DB:-marbo3a}" -v ON_ERROR_STOP=1 -c "INSERT INTO operational_verifications(kind,status) VALUES ('backup_success','success')" >/dev/null 2>&1 || echo "WARN: backup succeeded but operational verification timestamp could not be recorded" >&2
printf 'backup=%s\nmanifest=%s\n' "$FINAL" "$MANIFEST"
