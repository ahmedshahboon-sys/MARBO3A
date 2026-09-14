import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");

test("feed modes type the seed parameter in every production query",()=>{
  const src=read("routes/feed-mode.mjs");
  assert.match(src,/\$2::bigint IS NOT NULL/);
  assert.match(src,/mode===?"friends"|mode==="friends"/);
  assert.match(src,/mode===?"latest"|mode==="latest"/);
  assert.match(src,/mode===?"engaged"|mode==="engaged"/);
  assert.match(src,/mode===?"random"|mode==="random"/);
});

test("public audience stats distinguish tracked identities from live presence",()=>{
  const src=read("routes/stability-overrides.mjs");
  for(const token of ["/api/public/site-stats","presence:users","guest_visitors","onlineGuests","totalVisitors","trackedAudience","guestVisitorIds","registeredUsers","trackingStartedAt","metricDefinition","tracked-identities","/api/admin/advanced/analytics"])
    assert.ok(src.includes(token),`missing ${token}`);
});

test("invalid epoch-era user presence is repaired and prevented",()=>{
  const sql=read("migrations/035_ui_stability_cleanup.sql");
  assert.match(sql,/UPDATE users[\s\S]*last_seen_at=NULL/);
  assert.match(sql,/2020-01-01/);
  assert.match(sql,/users_last_seen_sane/);
});
