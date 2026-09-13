import fs from "fs/promises";
import path from "path";
import process from "process";

const root=process.cwd();
const read=rel=>fs.readFile(path.join(root,rel),"utf8");
const checks=[
  ["app/VoiceRecorder.js",["document.addEventListener(\"pointerup\"","voice-record-panel locked","voice-record-panel active","onRecorded?."]],
  ["app/StoryRail.js",["story-overlay-open","/viewers","story-viewers-panel","viewers!==null","beginSwipe","STILL_MS=6500","onTimeUpdate","filterName","overlayX","story-overlay-edit","<Link key={v.viewer_id}"]],
  ["app/ReactionHoldBridge.js",["MOVE_TOLERANCE","createPortal","useState(null)","HOLD_MS=420","position:\"fixed\""]],
  ["app/RoomVoiceStage.js",["recvonly","scheduleJoinRetry","أنت تستمع الآن","room-voice-remote-audio"]],
  ["app/notifications/page.js",["friend_action:\"expired\"","notification-actions","respond(n,\"accept\")"]],
  ["app/PremiumChrome.js",["marbo3a:notification-count","v3-unread-badge"]],
  ["app/AppDataCoordinator.js",["/api/notifications/unread-count","/api/chats","120000"]],
  ["app/RealtimeClient.js",["presence:update","presence:snapshot","presence:watch"]],
  ["app/SocialFeed.js",["comments/preview","/reactions","const previous=post,next=","reaction-people"]],
  ["app/profile/edit/page.js",["USERNAME_COOLDOWN","7 أيام","usernameNextChangeAt"]],
  ["app/ui-v3-unified-scale.css",["--app-dock-h:62px",".sf-reaction-picker>button:not(:first-child)",".story-viewer{position:fixed",".room-community-compose{position:sticky",".voice-record-btn{touch-action:none"]]
];

let failed=false;
for(const [file,needles] of checks){
  let text="";
  try{text=await read(file)}catch{console.error(`Missing interaction contract file: ${file}`);failed=true;continue}
  for(const needle of needles){if(!text.includes(needle)){console.error(`Missing interaction contract in ${file}: ${needle}`);failed=true}}
}

const notifications=await read("app/notifications/page.js");
for(const banned of ["الطلب لم يعد متاحًا"]){if(notifications.includes(banned)){console.error(`Expired friend-request UX regression: ${banned}`);failed=true}}
const layout=await read("app/layout.js");
const cssImports=[...layout.matchAll(/import\s+["']\.\/(.+?\.css)["'];/g)].map(x=>x[1]);
if(cssImports.at(-1)!=="ui-v3-unified-scale.css"){console.error("Final unified scale stylesheet must stay the final UI layer");failed=true}
if(failed)process.exit(1);
console.log("Social interaction contracts OK.");
