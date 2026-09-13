import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd());
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("guest rooms v2 migration is additive and owns guest/seat schema",()=>{
  const sql=read("migrations/031_guest_rooms_v2_permissions.sql");
  for(const token of ["guest_visitors","guest_activity","guest_room_presence","guest_room_voice_presence","guest_room_voice_signals","speaker_seat_count","seat_index","room_voice_active_seat_unique"])assert.match(sql,new RegExp(token));
  assert.doesNotMatch(sql,/DROP\s+(TABLE|COLUMN)|TRUNCATE\s+/i);
});

test("guest identity stays server-issued and admin-only details stay behind admin routes",()=>{
  const src=read("guest-rooms-v2.mjs");
  for(const token of ["crypto.randomUUID","HttpOnly","SameSite=Lax","/api/public/guest/session","/api/public/guest/activity","/api/admin/advanced/guests","requireAdmin","linked_user_id","last_ip"])
    assert.match(src,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  const publicSession=src.slice(src.indexOf('app.post("/api/public/guest/session"'),src.indexOf('app.get("/api/public/guest/me"'));
  assert.doesNotMatch(publicSession,/last_ip|last_user_agent/);
});

test("guest rooms expose read-only discovery and listener voice endpoints",()=>{
  const src=read("guest-rooms-v2.mjs");
  for(const token of ["/api/public/rooms-v2","/messages","/presence/join","/voice/join","/voice/state","/voice/signals","'listener'::text","recipient_guest_id","sender_guest_id"])
    assert.ok(src.includes(token),`missing ${token}`);
  assert.doesNotMatch(src,/api\/public\/rooms-v2\/:id\/messages"\s*,\s*async[^]*?INSERT INTO messages/);
});

test("room voice v2 owns data-driven seats and guest signaling bridge",()=>{
  const src=read("room-voice.mjs");
  for(const token of ["DEFAULT_SEATS","speaker_seat_count","seat_index","chooseSeat","SEAT_TAKEN","guestSignals","recipient_guest_id","sender_guest_id"])
    assert.ok(src.includes(token),`missing ${token}`);
  assert.match(src,/role='speaker'/);
});

test("guest rooms runtime is registered before request foundation",()=>{
  const src=read("bootstrap.mjs"),guest=src.indexOf('"./guest-rooms-v2.mjs"'),foundation=src.indexOf('"./request-foundation.mjs"');
  assert.ok(guest>0&&foundation>guest);
});
