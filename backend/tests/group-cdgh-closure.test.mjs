import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("password reset revokes durable sessions after success",()=>{
  const src=read("v1-completion.mjs");
  assert.match(src,/\/api\/auth\/reset-password/);
  assert.match(src,/DELETE FROM durable_sessions WHERE user_id IN/);
  assert.match(src,/res\.statusCode<200\|\|res\.statusCode>=300/);
});

test("direct read receipts honor the owner privacy toggle",()=>{
  const src=read("v1-completion.mjs");
  assert.match(src,/async function readReceiptsEnabled/);
  const readStart=src.indexOf('app.post("/api/chats/:id/read"');
  const receiptStart=src.indexOf('app.get("/api/chats/:id/receipt"',readStart);
  const roomsStart=src.indexOf('app.get("/api/rooms/:id/members"',receiptStart);
  assert.ok(readStart>=0&&receiptStart>readStart&&roomsStart>receiptStart);
  const readRoute=src.slice(readStart,receiptStart);
  const receiptRoute=src.slice(receiptStart,roomsStart);
  assert.match(readRoute,/readReceiptsEnabled\(u\.id\)/);
  assert.match(readRoute,/readReceipts:false/);
  assert.match(receiptRoute,/readReceiptsEnabled\(peer\)/);
  assert.match(receiptRoute,/receipt:null,readReceipts:false/);
});

test("profile privacy covers communication presence and message requests",()=>{
  const src=read("routes/fgh-social.mjs");
  for(const field of ["who_can_message","who_can_add","show_last_seen","show_online","read_receipts","message_requests_enabled","who_can_call","who_can_see_friends","who_can_invite_room"]){
    assert.ok(src.includes(field),`missing privacy field ${field}`);
  }
  assert.match(src,/USER_BLOCKED/);
  assert.match(src,/PRIVACY_RESTRICTED/);
  assert.match(src,/MESSAGE_REQUESTS_DISABLED/);
  assert.match(src,/MESSAGE_REQUEST_PENDING/);
});

test("notification friend request lifecycle stays synchronized",()=>{
  const src=read("routes/core-social.mjs");
  assert.match(src,/notification:new/);
  assert.match(src,/notification:updated/);
  assert.match(src,/friend_action/);
  assert.match(src,/expired/);
});

test("core messaging keeps presence privacy and pending-request guards",()=>{
  const src=read("routes/core-messaging.mjs");
  assert.match(src,/show_online/);
  assert.match(src,/show_last_seen/);
  assert.match(src,/pendingIncoming/);
  assert.match(src,/canPublishRead/);
  assert.match(src,/MESSAGE_REQUEST_PENDING/);
});
