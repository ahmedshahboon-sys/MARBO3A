import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
function must(file,tokens){const text=read(file);for(const token of tokens)if(!text.includes(token))throw new Error(`${file}: missing ${token}`)}
must("app/notifications/page.js",["/home?post=${n.ref_id}","/home?story=${n.ref_id}","/live/${n.ref_id}","/chat/${n.ref_id}","/room/${n.ref_id}/chat"]);
must("app/DeepLinkedPost.js",["/api/feed/${id}","/api/auth/me","autoOpen","scrollIntoView"]);
must("app/home/page.js",["DeepLinkedPost","<DeepLinkedPost/>"]);
must("app/messages/page.js",["/api/chats","marbo3a:direct:new","last_message_at","unread_count"]);
must("app/AppDataCoordinator.js",["/api/notifications/unread-count","notification:new","notification:updated","notifications-changed"]);
must("app/PremiumChrome.js",["totalVisitors","هوية زائرة","onlineNow","unread>0"]);
must("app/admin/UnifiedAdmin.js",["AdminCenter","AdvancedAdmin","AdminGuests","سجل الزوار وGuest IDs"]);

// The frontend Docker image is built with frontend/ as its build context, so the
// sibling backend/ tree is intentionally unavailable there. Keep backend source
// assertions when this contract runs from a full checkout, while allowing the
// frontend-only image build to validate the frontend contracts above.
const backendRoot=new URL("../../backend/",import.meta.url);
const backendAvailable=fs.existsSync(new URL("experience-v2.mjs",backendRoot));
if(backendAvailable){
 const backend=p=>fs.readFileSync(new URL(p,backendRoot),"utf8");
 function mustBackend(file,tokens){const text=backend(file);for(const token of tokens)if(!text.includes(token))throw new Error(`backend/${file}: missing ${token}`)}
 mustBackend("experience-v2.mjs",["0x1a,0x45,0xdf,0xa3","audio/webm","UPLOAD_MULTIPART_FAILED","UNSUPPORTED_FILE","receivedType"]);
 mustBackend("realtime.mjs",["30000","presence:users","presence:update","presence:snapshot"]);
 mustBackend("routes/stability-overrides.mjs",["metricDefinition:\"tracked-identities\"","totalVisitors=guestTotal+legacyUsers","registeredUsers"]);
 mustBackend("routes/core-admin-rooms.mjs",["/api/admin/rooms/:id/rail","rail_pinned","rail_hidden","requireAdmin"]);
 const server=backend("server-v3.mjs"),instrumentation=backend("instrumentation.mjs");
 if(server.includes('app.post("/api/telemetry/ping"'))throw new Error("backend/server-v3.mjs: duplicate telemetry owner returned");
 if(!instrumentation.includes('app.post("/api/telemetry/ping"'))throw new Error("backend/instrumentation.mjs: canonical telemetry owner missing");
}else{
 console.log("deep repair backend contracts skipped: backend source is outside frontend Docker build context");
}
console.log("deep repair contracts: ok");
