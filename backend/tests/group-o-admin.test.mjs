import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("Group O migration defines controls analytics audit and anomaly storage",()=>{
 const sql=read("migrations/030_group_o_advanced_admin.sql");
 for(const name of ["admin_system_settings","feature_flags","admin_change_audit","usage_sessions","usage_page_views","platform_login_events","admin_anomaly_alerts"])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${name}`));
 assert.match(sql,/registration_enabled/);assert.match(sql,/rooms_enabled/);assert.match(sql,/upload_max_mb/);assert.match(sql,/story_lifetime_hours/);assert.match(sql,/pinned_post_limit/);
 assert.match(sql,/durable_sessions_login_event/);assert.match(sql,/stories_lifetime_control/);
});

test("advanced admin exposes requested analytics and strict private-message policy",()=>{
 const src=read("routes/group-o-admin.mjs");
 for(const token of ["registrations","gender","averageSessionSeconds","returningUsers","peakHours","topDays","topPages","/api/admin/advanced/users","/api/admin/advanced/moderation","/api/admin/advanced/settings","/api/admin/advanced/audit","/api/admin/advanced/anomalies"])assert.ok(src.includes(token),`${token} missing`);
 assert.match(src,/target_type='direct_message'/);
 assert.match(src,/AUDIT_REASON_REQUIRED/);
 assert.match(src,/private_message_report_access/);
 assert.doesNotMatch(src,/FROM direct_messages[^`]*ORDER BY[^`]*LIMIT[^`]*\)\.rows;res\.json\(\{ok:true,messages/i);
});

test("operational controls are enforced before compatibility routes",()=>{
 const src=read("request-foundation.mjs");
 assert.match(src,/REGISTRATION_DISABLED/);assert.match(src,/ROOMS_DISABLED/);assert.match(src,/FILE_TOO_LARGE/);assert.match(src,/PINNING_DISABLED/);assert.match(src,/FEATURE_DISABLED/);
 assert.match(src,/admin_system_settings/);assert.match(src,/feature_flags/);
});

test("Group O route is explicitly registered",()=>{
 const index=read("routes/index.mjs");
 assert.match(index,/registerGroupOAdmin/);assert.match(index,/group-o-admin\.mjs/);
});
