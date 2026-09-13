import fs from "fs/promises";
const files=["app/RealtimeClient.js","app/CallCenter.js","app/RoomVoiceStage.js","app/PlatformClient.js"];
for(const file of files){await fs.access(file)}
console.log("Group D files present");
