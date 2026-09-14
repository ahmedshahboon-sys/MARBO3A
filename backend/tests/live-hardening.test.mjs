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

test("live hardening routes cover moderation and safety",()=>{
  const route=read("routes/live-hardening.mjs");
  for(const token of ["/api/live/:id/announce","/api/live/:id/settings","/api/live/:id/moderation","/api/live/:id/restrictions/:userId","/api/live/:id/report","LIVE_CHAT_MUTED","LIVE_CHAT_CLOSED","LIVE_SLOW_MODE","LIVE_BLOCKED"])assert.ok(route.includes(token),`missing ${token}`);
});

test("live guards register before base live routes",()=>{
  const index=read("routes/index.mjs");
  const guard=index.indexOf("registerLiveHardening(app)"),base=index.indexOf("registerLive(app)");
  assert.ok(guard>=0&&base>=0&&guard<base,"live hardening must register before base live routes");
});
