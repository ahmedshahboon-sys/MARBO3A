import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(process.cwd());
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("live hardening schema is additive",()=>{
  const migration=read("migrations/038_live_social_hardening.sql");
  for(const token of ["live_restrictions","live_reports","chat_enabled","slow_mode_seconds","CREATE TABLE IF NOT EXISTS"])assert.match(migration,new RegExp(token));
});

test("live ownership separates canonical runtime from host moderation routes",()=>{
  const runtime=read("routes/live.mjs"),hardening=read("routes/live-hardening.mjs");
  for(const token of ["/api/live/:id/join","/api/live/:id/messages","/api/live/:id/reactions","/api/live/:id/signals","LIVE_CHAT_MUTED","LIVE_CHAT_CLOSED","LIVE_SLOW_MODE","LIVE_BLOCKED","actionRateLimit"])assert.ok(runtime.includes(token),`missing runtime ${token}`);
  for(const token of ["/api/live/:id/announce","/api/live/:id/settings","/api/live/:id/moderation","/api/live/:id/restrictions/:userId","/api/live/:id/report","LIVE_REPORT_RATE_LIMITED"])assert.ok(hardening.includes(token),`missing hardening ${token}`);
  assert.doesNotMatch(hardening,/app\.post\('\/api\/live\/:id\/(join|messages|reactions|signals)'/);
});

test("live runtime and host moderation are both explicit route owners",()=>{
  const index=read("routes/index.mjs");
  assert.ok(index.includes("registerLive(app)"));
  assert.ok(index.includes("registerLiveHardening(app)"));
});
