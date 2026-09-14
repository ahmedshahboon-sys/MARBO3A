import fs from "fs/promises";
import process from "process";

const frontendChecks=[
  ["app/RealtimeClient.js",["rejoinScopes","room:join","chat:join","presence:watch","visibilitychange","realtime-resume"]],
  ["app/CallCenter.js",["RTCPeerConnection","/api/calls/config","getUserMedia","rtc_stats","remoteAudio","audioBlocked","/signals"]],
  ["app/RoomVoiceStage.js",["recvonly","sendrecv","roomvoice:signal","scheduleJoinRetry","heartbeat","remote_audio_playing"]],
  ["app/PlatformClient.js",["beforeinstallprompt","appinstalled","serviceWorker.register","display-mode: standalone"]],
  ["public/manifest.webmanifest",["\"display\":\"standalone\"","\"start_url\":\"/home?source=pwa\"","pwa-192.png","pwa-512.png"]],
  ["public/sw.js",["SKIP_WAITING","notificationclick","/offline.html"]],
  ["app/AppDataCoordinator.js",["notification-count","message-unread-count","120000"]],
  ["app/SessionGuard.js",["marbo3a:realtime","visibilitychange","60000"]],
  ["app/VoiceRecorder.js",["pointermove","pointerup","CANCEL_PX","dy<-CANCEL_PX","onRecorded?.","audio/webm"]],
  ["app/notifications/page.js",["تعليم الكل كمقروء","notification:updated","notifications-changed"]],
  ["app/InterfaceFixes.js",["overflow-y:auto","width:fit-content","global-search-box:focus-within","sf-profile-actions"]],
  ["app/DebugTrace.js",["marbo3a:rtc-debug","api_error","ui_overlap","media_permissions"]]
];
const backendChecks=[
  ["../backend/social-auth.mjs",["code_challenge_method:\"S256\"","OAUTH_STATE_INVALID","SOCIAL_ACCOUNT_CONFLICT","oauth:pending"]],
  ["../backend/security-p0.mjs",["audio/webm","audio/ogg","audio/mp4"]]
];

async function exists(path){try{await fs.access(path);return true}catch{return false}}
let failed=false;
for(const [file,needles] of frontendChecks){
  let text="";
  try{text=await fs.readFile(file,"utf8")}catch{console.error(`Missing Group D file: ${file}`);failed=true;continue}
  for(const needle of needles){if(!text.includes(needle)){console.error(`Missing Group D contract in ${file}: ${needle}`);failed=true}}
}

// The production web Docker image is built with frontend/ as its build context,
// so ../backend is intentionally unavailable there. In repository/CI builds the
// backend directory exists and these cross-stack contracts remain enforced.
if(await exists("../backend")){
  for(const [file,needles] of backendChecks){
    let text="";
    try{text=await fs.readFile(file,"utf8")}catch{console.error(`Missing Group D file: ${file}`);failed=true;continue}
    for(const needle of needles){if(!text.includes(needle)){console.error(`Missing Group D contract in ${file}: ${needle}`);failed=true}}
  }
}else{
  console.log("Group D backend contracts skipped in frontend-only build context.");
}

if(failed)process.exit(1);
console.log("Group D production stability contracts OK.");
