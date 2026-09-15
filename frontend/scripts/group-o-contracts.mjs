import fs from "node:fs/promises";
const read=file=>fs.readFile(file,"utf8");
const [admin,telemetry,runtime,page,unified]=await Promise.all([read("app/admin/advanced/AdvancedAdmin.js"),read("app/UsageTelemetry.js"),read("app/AppRuntime.js"),read("app/admin/page.js"),read("app/admin/UnifiedAdmin.js")]);
const checks=[
 [admin.includes('/api/admin/advanced/analytics'),"advanced analytics"],
 [admin.includes('/api/admin/advanced/users'),"advanced user search"],
 [admin.includes('/api/admin/advanced/moderation'),"advanced moderation"],
 [admin.includes('/api/admin/advanced/settings'),"system controls"],
 [admin.includes('/api/admin/advanced/audit'),"advanced audit"],
 [admin.includes('/api/admin/advanced/anomalies'),"anomaly alerts"],
 [admin.includes('reported_messages'),"reported message moderation surface"],
 [admin.includes('AppDialog'),"audited reason dialog"],
 [telemetry.includes('/api/telemetry/activity'),"usage telemetry endpoint"],
 [runtime.includes('<UsageTelemetry/>'),"usage telemetry runtime"],
 [page.includes('UnifiedAdmin')&&unified.includes('AdvancedAdmin'),"advanced admin discovery surface"]
];
for(const [ok,name] of checks)if(!ok)throw new Error(`Group O contract failed: ${name}`);
for(const src of [admin,telemetry])if(/\b(alert|confirm|prompt)\s*\(/.test(src))throw new Error("Group O must not use browser-native dialogs");
console.log("Group O contracts passed");
