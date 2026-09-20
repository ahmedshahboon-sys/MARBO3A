import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const readRepo=file=>fs.readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");

test("explicit admin control owns resilient overview system and readiness",()=>{
 const src=read("routes/core-admin-control.mjs");
 for(const token of ["/api/admin/control/overview","safeRows","safeCount","/api/admin/system","/api/admin/readiness","redis.ping","saveObject","deleteObject","turnConfig","storageInfo"])assert.ok(src.includes(token),`${token} missing`);
 assert.ok(src.includes("registeredUsers")&&src.includes("totalMessages")&&src.includes("frozen")&&src.includes("banned"),"overview summary contract incomplete");
});

test("advanced controls use the canonical bounded operational schema",()=>{
 const src=read("routes/group-o-admin.mjs"),controls=read("operational-controls.mjs");
 assert.match(controls,/upload_max_mb:\{type:"integer",min:1,max:8/);
 assert.match(controls,/live_max_viewers:\{type:"integer",min:1,max:8/);
 assert.match(controls,/voice_participant_max:\{type:"integer",min:4,max:VOICE_HARD_MAX/);
 assert.match(src,/operationalSettingMeta/);
 assert.match(src,/SETTING_NOT_FOUND/);
 assert.match(src,/FEATURE_NOT_FOUND/);
 assert.match(src,/TURNSTILE_NOT_CONFIGURED/);
});

test("destructive room administration is reasoned and audited before delete",()=>{
 const src=read("routes/core-admin-rooms.mjs");
 assert.match(src,/AUDIT_REASON_REQUIRED/);
 assert.match(src,/admin_change_audit/);
 assert.match(src,/room_delete/);
 assert.ok(src.indexOf("INSERT INTO admin_change_audit")<src.indexOf("DELETE FROM rooms"),"audit must be persisted before destructive delete");
});

test("account status and privilege changes enter the change audit",()=>{
 const src=read("audit-completion.mjs");
 assert.match(src,/writeChangeAudit/);
 assert.match(src,/user_status_change/);
 assert.match(src,/user_role_change/);
 assert.match(src,/AUDIT_REASON_REQUIRED/);
 assert.match(src,/DELETE FROM durable_sessions WHERE user_id=\$1/);
});

test("admin UI uses the resilient control overview and reasoned destructive dialogs",()=>{
 const src=readRepo("frontend/app/admin/AdminCenter.js");
 assert.ok(src.includes('/api/admin/control/overview'));
 assert.ok(!src.includes('/api/admin/stats'),"legacy all-or-nothing stats endpoint should not drive the main dashboard");
 assert.ok(src.includes('سبب تغيير الصلاحية — مطلوب'));
 assert.ok(src.includes('سبب الحذف — مطلوب'));
 assert.ok(src.includes('/admin/advanced'));
});
