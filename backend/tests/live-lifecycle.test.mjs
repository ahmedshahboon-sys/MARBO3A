import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const readFrontend=file=>fs.readFileSync(new URL(`../../frontend/app/live/${file}`,import.meta.url),"utf8");

test("live discovery and detail hide social and session blocks",()=>{
  const src=read("routes/live.mjs");
  assert.match(src,/user_blocks/);
  assert.match(src,/live_restrictions/);
  assert.match(src,/LIVE_NOT_FOUND/);
});

test("live join is serialized and enforces capacity",()=>{
  const src=read("routes/live.mjs");
  assert.match(src,/FOR UPDATE/);
  assert.match(src,/MAX_VIEWERS=8/);
  assert.match(src,/LIVE_FULL/);
  assert.match(src,/BEGIN/);
  assert.match(src,/COMMIT/);
});

test("live signaling enforces host offer and viewer answer roles",()=>{
  const src=read("routes/live.mjs");
  assert.match(src,/kind==='offer'&&sender!==host/);
  assert.match(src,/kind==='answer'&&sender===host/);
  assert.match(src,/BAD_SIGNAL_ROLE/);
});

test("live relay config advertises external IP fallback from the canonical runtime owner",()=>{
  const src=read("routes/live.mjs");
  assert.match(src,/TURN_EXTERNAL_IP/);
  assert.match(src,/turn:\$\{external\}:3478\?transport=udp/);
  assert.match(src,/turn:\$\{external\}:3478\?transport=tcp/);
});

test("viewer moderation events use realtime event names and close media",()=>{
  const src=readFrontend("[id]/page.js");
  assert.match(src,/marbo3a:live:moderation/);
  assert.match(src,/marbo3a:live:kicked/);
  assert.match(src,/videoRef\.current\.srcObject=null/);
  assert.match(src,/cleanup\(true\)/);
  assert.doesNotMatch(src,/marbo3a:live-moderation/);
  assert.doesNotMatch(src,/marbo3a:live-kicked/);
});

test("host live creation serializes one active session per user",()=>{
  const src=read("routes/live.mjs");
  assert.match(src,/SELECT id FROM users WHERE id=\$1 FOR UPDATE/);
  assert.match(src,/status='ended'/);
  assert.match(src,/INSERT INTO live_sessions/);
});
