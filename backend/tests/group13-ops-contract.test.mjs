import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const repo=file=>fs.readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");

test("request observability is bounded and outer-owned",()=>{
 const obs=repo("backend/observability-foundation.mjs"),boot=repo("backend/bootstrap.mjs");
 assert.match(obs,/SLOW_REQUEST_MS/);assert.match(obs,/REQUEST_LOG_SAMPLE_RATE/);assert.match(obs,/status>=500/);assert.match(obs,/X-Request-Id/);assert.match(obs,/operation_logs/);
 assert.ok(boot.indexOf('./observability-foundation.mjs')<boot.indexOf('./request-foundation.mjs'));
});

test("hot path indexes are additive concurrent and runner-compatible",()=>{
 const sql=repo("backend/migrations/021_group13_performance.sql"),runner=repo("backend/migrations.mjs");
 for(const name of ["idx_posts_live_created","idx_messages_room_created_live","idx_direct_messages_conversation_created_live","idx_notifications_user_unread_created","idx_operation_logs_errors_created"])assert.ok(sql.includes(name));
 assert.ok((sql.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/g)||[]).length>=8);
 assert.match(sql,/MARBO3A_MIGRATION_NO_TRANSACTION/);
 assert.match(runner,/NON_TRANSACTIONAL_MARKER="MARBO3A_MIGRATION_NO_TRANSACTION"/);
 assert.match(runner,/if\(nonTransactional\)/);
});

test("encrypted backup fails closed and restore verification is isolated",()=>{
 const backup=repo("ops/backup-database.sh"),restore=repo("ops/verify-backup-restore.sh");
 assert.match(backup,/BACKUP_AGE_RECIPIENT/);assert.match(backup,/refusing to keep an unencrypted scheduled backup/);assert.match(backup,/sha256sum/);assert.match(backup,/BACKUP_OFFSITE_DIR/);
 assert.match(restore,/BACKUP_AGE_IDENTITY/);assert.match(restore,/createdb/);assert.match(restore,/pg_restore/);assert.match(restore,/dropdb/);assert.match(restore,/SELECT COUNT\(\*\) FROM users/);
});

test("compose labels same-host backup honestly",()=>{
 const compose=repo("compose.yml");
 assert.match(compose,/Local emergency copy only/);assert.match(compose,/not an offsite backup/);assert.match(compose,/ops\/backup-database\.sh/);
});
