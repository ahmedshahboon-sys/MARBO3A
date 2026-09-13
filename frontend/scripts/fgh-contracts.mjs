import fs from "fs/promises";
const checks=[
 ["app/GenderMark.js",["♂","♀","gender-mark"]],
 ["app/profile/edit/page.js",["/api/profile/social","birthVisibility","birthDate","GenderMark"]],
 ["app/settings/privacy/page.js",["/api/privacy/v2","message_requests_enabled","who_can_see_story","read_receipts"]],
 ["app/messages/page.js",["/api/message-requests","طلبات المراسلة","message-request:new","message-request:accepted","GenderMark"]],
 ["app/RealtimeClient.js",["message-request:new","message-request:accepted"]]
];
let failed=false;
for(const [file,needles] of checks){let text="";try{text=await fs.readFile(file,"utf8")}catch{console.error(`Missing FGH file: ${file}`);failed=true;continue}for(const needle of needles)if(!text.includes(needle)){console.error(`Missing FGH contract in ${file}: ${needle}`);failed=true}}
if(failed)process.exit(1);
console.log("FGH profile/privacy/messaging contracts OK.");
