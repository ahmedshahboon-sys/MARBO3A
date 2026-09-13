import fs from "fs/promises";
import process from "process";

const checks=[
  ["app/RealtimeClient.js",["rejoinScopes","room:join","chat:join","presence:watch","visibilitychange","realtime-resume"]],
  ["app/CallCenter.js",["RTCPeerConnection","/api/calls/config","getUserMedia","rtc_stats","remoteAudio","audioBlocked","/signals"]],
  ["app/RoomVoiceStage.js",["recvonly","sendrecv","roomvoice:signal","scheduleJoinRetry","heartbeat","remote_audio_playing"]],
  ["app/PlatformClient.js",["beforeinstallprompt","appinstalled","serviceWorker.register","display-mode: standalone"]],
  ["public/manifest.webmanifest",["\"display\":\"standalone\"","\"start_url\":\"/home?source=pwa\"","pwa-192.png","pwa-512.png"]],
  ["public/sw.js",["SKIP_WAITING","notificationclick","/offline.html"]],
  ["app/AppDataCoordinator.js",["notification-count","message-unread-count","120000"]],
  ["app/SessionGuard.js",["marbo3a:realtime","visibilitychange","60000"]]
];
let failed=false;
for(const [file,needles] of checks){
  let text="";
  try{text=await fs.readFile(file,"utf8")}catch{console.error(`Missing Group D file: ${file}`);failed=true;continue}
  for(const needle of needles){if(!text.includes(needle)){console.error(`Missing Group D contract in ${file}: ${needle}`);failed=true}}
}
if(failed)process.exit(1);
console.log("Group D production stability contracts OK.");
