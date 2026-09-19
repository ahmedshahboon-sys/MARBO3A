import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(process.cwd());
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("Group 7 uses Redis-backed action limits across RTC surfaces",()=>{
  const runtime=read("runtime.mjs"),calls=read("routes/core-calls.mjs"),voice=read("routes/core-room-voice.mjs"),live=read("routes/live.mjs"),hardening=read("routes/live-hardening.mjs");
  for(const token of ["actionRateLimit","Retry-After","actionlimit:"])assert.ok(runtime.includes(token),`runtime missing ${token}`);
  for(const token of ["call-create","call-signal","CALL_RATE_LIMITED","SIGNAL_RATE_LIMITED"])assert.ok(calls.includes(token),`calls missing ${token}`);
  for(const token of ["voice-join","voice-signal","VOICE_JOIN_RATE_LIMITED","VOICE_SIGNAL_RATE_LIMITED"])assert.ok(voice.includes(token),`voice missing ${token}`);
  for(const token of ["live-create","live-join","live-signal","live-message","live-reaction"])assert.ok(live.includes(token),`live missing ${token}`);
  assert.ok(hardening.includes("LIVE_REPORT_RATE_LIMITED"));
});

test("canonical room voice enforces capacity hierarchy and signal roles",()=>{
  const src=read("routes/core-room-voice.mjs");
  for(const token of ["MAX_PARTICIPANTS","VOICE_ROOM_FULL","ROOM_ROLE_PROTECTED","forced_muted","room_voice_seat_locks","activeVoiceRole","BAD_SIGNAL_ROLE","VOICE_NOT_JOINED","guest_room_voice_signals"])assert.ok(src.includes(token),`missing ${token}`);
  assert.match(src,/moderationAllowed/);
  assert.match(src,/senderRole!=="speaker"&&recipientRole!=="speaker"/);
});

test("live canonical owner enforces capacity restriction slow mode signal isolation and cleanup",()=>{
  const src=read("routes/live.mjs"),hard=read("routes/live-hardening.mjs");
  for(const token of ["LIVE_FULL","LIVE_BLOCKED","LIVE_CHAT_MUTED","LIVE_CHAT_CLOSED","LIVE_SLOW_MODE","BAD_SIGNAL_ROLE","BAD_RECIPIENT","VIEWER_GONE","wipeTransient"])assert.ok(src.includes(token),`missing live ${token}`);
  assert.doesNotMatch(hard,/app\.post\('\/api\/live\/:id\/(join|messages|reactions|signals)'/);
});

test("TURN relay range matches the reviewed 512-port capacity plan",()=>{
  const compose=read("../compose.yml"),setup=read("../ops/setup-turn.sh");
  for(const token of ["49152-49663:49152-49663/udp","49152-49663:49152-49663/tcp","--min-port=49152","--max-port=49663"])assert.ok(compose.includes(token),`compose missing ${token}`);
  for(const token of ["49152:49663/tcp","49152:49663/udp","ROTATE_TURN_SECRET"])assert.ok(setup.includes(token),`setup missing ${token}`);
});

test("Group 7 retires voice and live duplicate runtime ownership",()=>{
  const allow=JSON.parse(read("route-compatibility-allowlist.json")),boot=read("bootstrap.mjs"),index=read("routes/index.mjs");
  assert.equal(allow.observedDuplicateCount,6);
  for(const route of Object.keys(allow.duplicates))assert.ok(!route.includes("/voice/")&&!route.startsWith("POST /api/live/"),`unexpected RTC duplicate ${route}`);
  assert.doesNotMatch(boot,/room-voice\.mjs|room-voice-discovery\.mjs|r1-voice-preserve-mute\.mjs/);
  assert.ok(index.includes("registerCoreRoomVoice"));
});
