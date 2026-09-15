import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
function must(file,tokens){const text=read(file);for(const token of tokens)if(!text.includes(token))throw new Error(`${file}: missing ${token}`)}
must("app/notifications/page.js",["/home?post=${n.ref_id}","/home?story=${n.ref_id}","/live/${n.ref_id}","/chat/${n.ref_id}","/room/${n.ref_id}/chat"]);
must("app/DeepLinkedPost.js",["/api/feed/${id}","/api/auth/me","autoOpen","scrollIntoView"]);
must("app/home/page.js",["DeepLinkedPost","<DeepLinkedPost/>"]);
must("app/messages/page.js",["/api/chats","marbo3a:direct:new","last_message_at","unread_count"]);
must("app/AppDataCoordinator.js",["/api/notifications/unread-count","notification:new","notification:updated","notifications-changed"]);
must("app/PremiumChrome.js",["totalVisitors","هوية زائرة","onlineNow","unread>0"]);
const backendRoot=new URL("../../backend/",import.meta.url);
const backend=p=>fs.readFileSync(new URL(p,backendRoot),"utf8");
function mustBackend(file,tokens){const text=backend(file);for(const token of tokens)if(!text.includes(token))throw new Error(`backend/${file}: missing ${token}`)}
mustBackend("experience-v2.mjs",["0x1a,0x45,0xdf,0xa3","audio/webm","UPLOAD_MULTIPART_FAILED","UNSUPPORTED_FILE","receivedType"]);
mustBackend("realtime.mjs",["30000","presence:users","presence:update","presence:snapshot"]);
mustBackend("routes/stability-overrides.mjs",["metricDefinition:\"tracked-identities\"","totalVisitors=guestTotal+legacyUsers","registeredUsers"]);
console.log("deep repair contracts: ok");
