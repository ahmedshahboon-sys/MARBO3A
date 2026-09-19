import fs from "fs/promises";
import path from "path";
import process from "process";

const root=process.cwd();
const read=rel=>fs.readFile(path.join(root,rel),"utf8");
const checks=[
  ["app/VoiceRecorder.js",["document.addEventListener(\"pointerup\"","voice-record-panel active","اسحب لفوق للإلغاء","onRecorded?."]],
  ["app/StoryRail.js",["story-overlay-open","/viewers","story-viewers-panel","viewers!==null","beginSwipe","STILL_MS=6500","onTimeUpdate","filterName","overlayX","story-overlay-edit","<Link key={v.viewer_id}"]],
  ["app/ReactionHoldBridge.js",["MOVE_TOLERANCE","createPortal","useState(null)","HOLD_MS=420","position:\"fixed\""]],
  ["app/RoomVoiceStage.js",["recvonly","scheduleJoinRetry","أنت تستمع الآن","room-voice-remote-audio"]],
  ["app/notifications/page.js",["notification:updated","notification-actions","respond(n,\"accept\")","تعليم الكل كمقروء"]],
  ["app/PremiumChrome.js",["marbo3a:notification-count","v3-unread-badge"]],
  ["app/AppDataCoordinator.js",["/api/notifications/unread-count","notification:updated","/api/chats","120000"]],
  ["app/RealtimeClient.js",["notification:updated","presence:update","presence:snapshot","presence:watch"]],
  ["app/SocialFeed.js",["comments/preview","/reactions","const previous=post,next=","reaction-people"]],
  ["app/profile/edit/page.js",["USERNAME_COOLDOWN","7 أيام","usernameNextChangeAt"]],
  ["app/ui-v3-unified-scale.css",["--app-dock-h:62px",".sf-reaction-picker>button:not(:first-child)",".story-viewer{position:fixed",".room-community-compose{position:sticky",".voice-record-btn{touch-action:none"]],
  ["app/ui-contract-lock.css",["settings-overlay","global-search-box:focus-within","chat-bubble","profile-v3-route"]]
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
const expectedTail=["ui-v3-unified-scale.css","ui-contract-lock.css"];
const actualTail=cssImports.slice(-expectedTail.length);
if(actualTail.join("|")!==expectedTail.join("|")){
  console.error(`Final UI cascade must end with ${expectedTail.join(" -> ")}`);
  failed=true;
}
if(failed)process.exit(1);
console.log("Social interaction contracts OK.");
