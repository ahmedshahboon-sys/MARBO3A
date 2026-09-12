import fs from "fs/promises";
import path from "path";
import process from "process";

const root=process.cwd();
const read=rel=>fs.readFile(path.join(root,rel),"utf8");
const checks=[
  ["app/VoiceRecorder.js",["document.addEventListener(\"pointerup\"","voice-record-panel locked","voice-record-panel active","onRecorded?."]],
  ["app/StoryRail.js",["story-overlay-open","/viewers","story-viewers-panel","viewers!==null"]],
  ["app/ReactionHoldBridge.js",["MOVE_TOLERANCE","document.body.appendChild(palette)","HOLD_MS=420"]],
  ["app/RoomVoiceStage.js",["recvonly","scheduleJoinRetry","أنت تستمع الآن","ROOM_VOICE"]],
  ["app/notifications/page.js",["/api/notifications/unread-count"].filter(Boolean)],
  ["app/PremiumChrome.js",["/api/notifications/unread-count","v3-unread-badge"]],
  ["app/SocialFeed.js",["comments/preview","/reactions","const previous=post,next=","reaction-people"]],
  ["app/profile/edit/page.js",["USERNAME_COOLDOWN","7 أيام","usernameNextChangeAt"]],
  ["app/ui-v3-unified-scale.css",["--app-dock-h:62px",".sf-reaction-picker>button:not(:first-child)",".story-viewer{position:fixed",".room-community-compose{position:sticky",".voice-record-btn{touch-action:none"]]
];

let failed=false;
for(const [file,needles] of checks){
  let text="";
  try{text=await read(file)}catch(e){console.error(`Missing interaction contract file: ${file}`);failed=true;continue}
  for(const needle of needles){if(!text.includes(needle)){console.error(`Missing interaction contract in ${file}: ${needle}`);failed=true}}
}

const notifications=await read("app/notifications/page.js");
for(const banned of ["الطلب لم يعد متاحًا"]){if(notifications.includes(banned)){console.error(`Expired friend-request UX regression: ${banned}`);failed=true}}
const layout=await read("app/layout.js");
if(!layout.includes('import "./ui-v3-unified-scale.css"')){console.error("Final unified scale stylesheet must stay loaded last among UI layers");failed=true}
if(failed)process.exit(1);
console.log("Social interaction contracts OK.");
