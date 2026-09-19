import fs from "fs";
const read=p=>fs.readFileSync(p,"utf8");
let failed=false;
function must(file,tokens,label=file){const src=read(file);for(const token of tokens)if(!src.includes(token)){console.error(`Missing Group9 ${label}: ${token}`);failed=true}}

must("app/admin/advanced/AdvancedAdmin.js",[
  "/api/admin/operations","setSchema","settingEditor","groupedSettings","groupLabels",
  "login_rate_limit_15m","captcha_escalation_enabled","post_limit_per_hour","allowed_media_types",
  "voice_participant_max","live_max_viewers","maintenance_mode","push","Release SHA"
]);
must("app/admin/advanced/AdvancedAdmin.js",["controlReason","reason:controlReason.trim()","Before / After / Admin / Time / Reason"]);
if(failed)process.exit(1);
console.log("Group 9 admin operational control frontend contracts OK");
