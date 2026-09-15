import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
function must(file,tokens){const text=read(file);for(const token of tokens)if(!text.includes(token))throw new Error(`${file}: missing ${token}`)}
must("app/notifications/page.js",["/home?post=${n.ref_id}","/home?story=${n.ref_id}","/live/${n.ref_id}","/chat/${n.ref_id}","/room/${n.ref_id}/chat"]);
must("app/DeepLinkedPost.js",["/api/feed/${id}","/api/auth/me","autoOpen","scrollIntoView"]);
must("app/home/page.js",["DeepLinkedPost","<DeepLinkedPost/>"]);
must("app/messages/page.js",["/api/chats","marbo3a:direct:new","last_message_at","unread_count"]);
console.log("deep repair contracts: ok");
