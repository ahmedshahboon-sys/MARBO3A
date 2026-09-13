import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("Group A/B migration seeds automatic maintenance controls",()=>{
 const sql=read("migrations/031_group_ab_operations.sql");
 for(const key of ["maintenance_mode","maintenance_message","maintenance_eta_minutes","maintenance_started_at"])assert.ok(sql.includes(key),`${key} missing`);
 assert.match(sql,/ON CONFLICT\(key\) DO NOTHING/);
});

test("request foundation exposes maintenance state and blocks normal APIs",()=>{
 const src=read("request-foundation.mjs");
 assert.match(src,/\/api\/system\/maintenance/);
 assert.match(src,/MAINTENANCE_MODE/);
 assert.match(src,/maintenance_mode===true/);
 assert.match(src,/Cache-Control/);
 assert.match(src,/req\.path\.startsWith\("\/api\/admin\/"\)/);
});
