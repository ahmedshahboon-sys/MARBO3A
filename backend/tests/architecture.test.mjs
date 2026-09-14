import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd());
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("server-v3 owns explicit routes and realtime attachment",()=>{
  const server=read("server-v3.mjs");
  assert.match(server,/registerExplicitRoutes\(app\)/);
  assert.match(server,/attachRealtime\(server\)/);
});

test("legacy bootstrap no longer owns stage1 presence or realtime",()=>{
  const bootstrap=read("bootstrap.mjs");
  assert.doesNotMatch(bootstrap,/experience-stage1\.mjs/);
  assert.doesNotMatch(bootstrap,/realtime-v2\.mjs/);
  assert.equal(fs.existsSync(path.join(root,"experience-stage1.mjs")),false);
  assert.equal(fs.existsSync(path.join(root,"realtime-v2.mjs")),false);
});

test("presence is an explicit domain and realtime supports watch events",()=>{
  const registry=read("routes/index.mjs"),presence=read("routes/core-presence.mjs"),realtime=read("realtime.mjs");
  assert.match(registry,/registerCorePresence/);
  assert.match(presence,/\/api\/presence\/users/);
  assert.match(realtime,/presence:watch/);
  assert.match(realtime,/presence:update/);
  assert.match(realtime,/\/rt-v2\/socket\.io/);
});

test("notification unread count has one transitional owner",()=>{
  const legacyOwner=read("v1-social-extra.mjs");
  const socialExperience=read("social-experience.mjs");
  const route=/app\.get\("\/api\/notifications\/unread-count"/;
  assert.match(legacyOwner,route);
  assert.doesNotMatch(socialExperience,route);
});
