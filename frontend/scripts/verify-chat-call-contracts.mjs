import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const fail=m=>{console.error("CHAT_CALL_CONTRACT_FAILED: "+m);process.exitCode=1};

const viewport=read("app/ViewportRuntime.js");
if(!viewport.includes("layoutBaseline=Math.max(maxLayoutHeight,window.innerHeight||0)"))fail("ViewportRuntime must keep a stable pre-keyboard layout baseline");
if(!viewport.includes("data-keyboard-open"))fail("ViewportRuntime must expose keyboard state");

const responsive=read("app/responsive-round.css");
for(const token of [
  "body.ui-v3 .chat-social{height:calc(var(--app-viewport-h) - var(--app-header-total-h",
  "body.ui-v3 .chat-social .chat-stream{flex:1 1 auto!important;min-height:0!important;height:auto!important;overflow-y:auto!important",
  "body.ui-v3 .chat-social .chat-compose{position:relative!important",
  'html[data-keyboard-open] body.ui-v3 .social-dock{visibility:hidden!important',
  "body.ui-v3 .room-community-page .room-community-stream{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important",
  "body.ui-v3 .room-community-page .room-community-compose{position:relative!important"
])if(!responsive.includes(token))fail("responsive chat contract missing "+token);
if(/data-keyboard-open[^\n]*room-live-card\{display:none/i.test(responsive))fail("keyboard handling must not display:none the live room card");
if(!responsive.includes("room-live-card{max-height:0!important"))fail("room live card must collapse without unmounting");

const calls=read("app/calls.css");
if(!calls.includes("height:var(--app-viewport-h,100dvh)"))fail("call overlay must own the visible viewport height");
if(!calls.includes("z-index:var(--ui-z-call,900)"))fail("call overlay must consume central critical stack token");
if(/\.call-overlay\{[^}]*z-index:3000/.test(calls))fail("call overlay still has legacy arbitrary z-index");

const voice=read("app/room-voice.css");
if(!voice.includes(".room-voice-actions button{min-height:44px"))fail("room voice actions are below 44px");
if(!voice.includes(".room-voice-stage>header button{width:44px;height:44px"))fail("room voice header action is below 44px");

const callCenter=read("app/CallCenter.js");
for(const token of ['kind:"critical"',"escapeCloses:false","RTCPeerConnection","getUserMedia"])if(!callCenter.includes(token))fail("CallCenter contract missing "+token);

const room=read("app/ui-v3-room-community.css");
if(!room.includes("height:calc(var(--app-viewport-h) - var(--app-header-total-h))"))fail("room community viewport does not consume central geometry");

if(!process.exitCode)console.log("Chat/call contracts OK · single scroll owners · keyboard viewport · mounted voice stage · critical call layer");
