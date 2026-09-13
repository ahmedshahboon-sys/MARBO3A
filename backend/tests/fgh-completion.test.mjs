import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("FGH privacy compatibility enforces calls room invites and interactive avatar posts",()=>{
  const src=read("fgh-privacy-compat.mjs");
  assert.match(src,/CALL_PRIVACY_RESTRICTED/);
  assert.match(src,/\/api\/rooms\/:id\/invite-user/);
  assert.match(src,/ROOM_INVITE_PRIVACY_RESTRICTED/);
  assert.match(src,/\/api\/users\/:id\/avatar-post\/ensure/);
  assert.match(src,/حدّث صورته الشخصية/);
});
