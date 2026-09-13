import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd());
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const must=(src,needle,label)=>{if(!src.includes(needle))throw new Error(`${label}: missing ${needle}`)};
const reject=(src,needle,label)=>{if(src.includes(needle))throw new Error(`${label}: forbidden ${needle}`)};

const landing=read("app/page.js");
must(landing,"hasLinkFlow","auth link flow must use parsed callback state");
must(landing,"if(!dead&&hasLinkFlow)","authenticated OAuth linking must stay on landing");
reject(landing,"if(!dead&&linkFlow){return}","auth link flow must not depend on stale React state");
must(landing,"/api/auth/oauth/link/confirm","auth link confirmation route");
must(landing,"/api/auth/verify-2fa","2FA login flow");
must(landing,"/api/auth/reset-password","password reset flow");

const privacy=read("app/settings/privacy/page.js");
for(const key of ["who_can_message","who_can_add","show_last_seen","show_online","read_receipts","message_requests_enabled","who_can_call","who_can_see_friends","who_can_invite_room"]){must(privacy,key,`privacy ${key}`)}
must(privacy,"disabled={saving}","privacy controls must serialize saves");
must(privacy,'aria-busy={saving}',"privacy save state accessibility");

const notifications=read("app/notifications/page.js");
for(const item of ["/api/notifications","/read-all","friend_request","friend_accepted","marbo3a:notification:new","marbo3a:notification:updated","notification-actions"]){must(notifications,item,`notifications ${item}`)}

const messages=read("app/messages/page.js");
for(const item of ["/api/message-requests","message-request:new","message-request:accepted","unread_count","/api/calls/history"]){must(messages,item,`messages ${item}`)}

const chat=read("app/chat/[id]/page.js");
for(const item of ["VoiceRecorder","VoiceMessage","/api/chats/${id}/read","/api/chats/${id}/receipt","/api/calls/history?conversationId=${id}","marbo3a:direct:new","marbo3a:direct:updated","marbo3a:direct:deleted"]){must(chat,item,`direct chat ${item}`)}

const recorder=read("app/VoiceRecorder.js");
for(const item of ["MAX_SECONDS=120","navigator.mediaDevices.getUserMedia","pointermove","pointerup","pointercancel","cancelRecording","onRecorded"]){must(recorder,item,`voice recorder ${item}`)}

console.log("Group C/D/G/H frontend contracts OK");
