import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("room join enforces bans capacity and owner cannot leave",()=>{
  const src=read("routes/core-rooms.mjs");
  assert.match(src,/room_bans/);
  assert.match(src,/max_members/);
  assert.match(src,/ROOM_FULL/);
  assert.match(src,/OWNER_CANNOT_LEAVE/);
  assert.match(src,/NOT EXISTS\(SELECT 1 FROM room_bans rb/);
});

test("early room guard protects rich messages and reply scope",()=>{
  const src=read("ijkl-room-guard.mjs");
  assert.match(src,/\/messages\$/);
  assert.match(src,/NOT_ROOM_MEMBER/);
  assert.match(src,/ROOM_BANNED/);
  assert.match(src,/INVALID_REPLY_TARGET/);
  assert.match(src,/room_id=\$2 AND deleted_at IS NULL/);
});

test("invite redemption is atomic and capacity aware",()=>{
  const src=read("ijkl-room-guard.mjs");
  assert.match(src,/app\.post\("\/api\/invites\/:token\/redeem"/);
  assert.match(src,/FOR UPDATE OF i,r/);
  assert.match(src,/BEGIN/);
  assert.match(src,/COMMIT/);
  assert.match(src,/ROLLBACK/);
  assert.match(src,/uses>=Number\(inv\.max_uses\)/);
  assert.match(src,/ROOM_FULL/);
});

test("room moderation hierarchy protects owner and moderators",()=>{
  const src=read("ijkl-room-guard.mjs");
  assert.match(src,/moderationTargetAllowed/);
  assert.match(src,/actorRole==="owner"/);
  assert.match(src,/actorRole==="moderator"/);
  assert.match(src,/ROOM_ROLE_PROTECTED/);
  assert.match(src,/voice\\\/(kick\|role)/);
});

test("room scoped pins search read typing and reactions require membership",()=>{
  const src=read("ijkl-room-guard.mjs");
  assert.match(src,/pins\|search/);
  assert.match(src,/read\|typing/);
  assert.match(src,/messages\\\/room/);
  assert.match(src,/MESSAGE_NOT_FOUND/);
  assert.match(src,/requireRoomMember/);
});

test("kick and ban revoke stale room voice presence and signals",()=>{
  const src=read("ijkl-room-guard.mjs");
  assert.match(src,/cleanupRoomVoice/);
  assert.match(src,/DELETE FROM room_voice_presence/);
  assert.match(src,/DELETE FROM room_voice_signals/);
  assert.match(src,/roomvoice:kicked/);
  assert.match(src,/roomvoice:state/);
});
