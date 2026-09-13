import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const checks=[
 ["app/rooms/page.js",["visibility","joinPolicy","للأصدقاء","خاصة"]],
 ["app/room/manage/[id]/page.js",["ظهور الغرفة","visibility","joinPolicy"]],
 ["app/StoryRail.js",["❤️","story-social-tools","/reply","/reaction","/highlight","mutes"]],
 ["app/map/page.js",["ghostMode","visibilityMode","الأصدقاء","ذكر","أنثى"]],
 ["app/explore/page.js",["PublicRoomRail","/api/public/stats","غرف عامة"]],
 ["app/PublicRoomRail.js",["/api/public/rooms-v2","/guest/room/","دخول الغرفة"]],
 ["app/about/page.js",["0912992050","0922992050","0911984045","0921984045"]]
];
for(const[file,tokens]of checks){const src=read(file);for(const token of tokens)if(!src.includes(token))throw new Error(`Missing IJKL contract ${token} in ${file}`)}
console.log("IJKL frontend contracts OK");
