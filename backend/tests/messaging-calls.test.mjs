import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const readFrontend=file=>fs.readFileSync(new URL(`../../frontend/app/${file}`,import.meta.url),"utf8");

test("rich direct messages emit realtime delivery and validate reply ownership",()=>{
  const src=read("routes/core-messaging.mjs");
  assert.match(src,/emitChat/);
  assert.match(src,/direct:new/);
  assert.match(src,/conversation_id=\$2/);
  assert.match(src,/INVALID_REPLY_TARGET/);
});

test("message forwarding requires access to the source message scope",()=>{
  const src=read("routes/core-messaging.mjs");
  assert.match(src,/JOIN direct_conversations c ON c\.id=dm\.conversation_id/);
  assert.match(src,/c\.user1_id=\$2 OR c\.user2_id=\$2/);
  assert.match(src,/EXISTS\(SELECT 1 FROM room_members rm WHERE rm\.room_id=m\.room_id AND rm\.user_id=\$2\)/);
  assert.match(src,/emitChat\(conversationId,"direct:new"/);
  assert.match(src,/emitRoom\(roomId,"message:new"/);
});

test("calls enforce blocks and who_can_call privacy",()=>{
  const src=read("routes/core-calls.mjs");
  assert.match(src,/async function callAllowed/);
  assert.match(src,/who_can_call/);
  assert.match(src,/user_blocks/);
  assert.match(src,/friends_of_friends/);
  assert.match(src,/CALL_PRIVACY_RESTRICTED/);
});

test("call signaling is limited to active calls and correct offer answer roles",()=>{
  const src=read("routes/core-calls.mjs");
  assert.match(src,/CALL_NOT_ACTIVE/);
  assert.match(src,/BAD_SIGNAL_ROLE/);
  assert.match(src,/kind==="offer"&&Number\(c\.caller_id\)!==Number\(u\.id\)/);
  assert.match(src,/kind==="answer"&&Number\(c\.callee_id\)!==Number\(u\.id\)/);
});

test("call ICE config advertises external IP relay fallback",()=>{
  const src=read("routes/core-calls.mjs");
  assert.match(src,/TURN_EXTERNAL_IP/);
  assert.match(src,/turn:\$\{external\}:3478\?transport=udp/);
  assert.match(src,/turn:\$\{external\}:3478\?transport=tcp/);
});

test("voice recorder keeps one pointer target mounted while recording",()=>{
  const src=readFrontend("VoiceRecorder.js");
  assert.match(src,/return <button type="button" className=\{`voice-record-btn hold/);
  assert.match(src,/state==="recording"\?<span className=\{`voice-record-panel active/);
  assert.match(src,/document\.addEventListener\("pointerup",upGlobal/);
  assert.match(src,/finish\(true\)/);
  assert.match(src,/finish\(false\)/);
});
