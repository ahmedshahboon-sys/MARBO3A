import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("comment preview uses the real post_comments edit timestamp",()=>{
  const src=read("social-experience.mjs");
  const start=src.indexOf('app.get("/api/feed/:id/comments/preview"');
  const end=src.indexOf('app.get("/api/notifications/unread-count"',start);
  assert.ok(start>=0&&end>start,"comment preview route must exist before notifications route");
  const preview=src.slice(start,end);
  assert.match(preview,/c\.edited_at/);
  assert.doesNotMatch(preview,/c\.updated_at/);
});

test("friend request notification history expires when friendship row is gone",()=>{
  const src=read("routes/core-social.mjs");
  const start=src.indexOf('app.get("/api/notifications"');
  const end=src.indexOf('app.post("/api/notifications/read"',start);
  assert.ok(start>=0&&end>start,"notifications route must exist before read route");
  const notifications=src.slice(start,end);
  assert.match(notifications,/f\.id IS NULL THEN 'expired'/);
  assert.match(notifications,/friend_action/);
});

test("presence API separates online and last-seen privacy and filters blocks",()=>{
  const src=read("routes/core-presence.mjs");
  assert.match(src,/show_online/);
  assert.match(src,/show_last_seen/);
  assert.match(src,/user_blocks/);
  assert.match(src,/online:Boolean\(row\.show_online\)&&actualOnline/);
  assert.match(src,/last_seen_at:Boolean\(row\.show_last_seen\)&&!actualOnline/);
});

test("realtime presence keeps online privacy separate and blocks watchers",()=>{
  const src=read("realtime.mjs");
  assert.match(src,/COALESCE\(p\.show_online,TRUE\) show_online/);
  assert.match(src,/COALESCE\(p\.show_last_seen,TRUE\) show_last_seen/);
  assert.match(src,/user_blocks/);
  assert.match(src,/snapshot\(ids,uid\)/);
  assert.match(src,/publishConnectedPrivacy/);
});

test("map never bypasses block, precise opt-in, or online privacy",()=>{
  const src=read("real-map.mjs");
  assert.match(src,/user_blocks/);
  assert.match(src,/COALESCE\(p\.show_online,TRUE\) show_online/);
  assert.match(src,/row\.share_precise/);
  assert.match(src,/online:onlineVisible&&actualOnline/);
  assert.match(src,/last_seen_at:lastSeenVisible&&!actualOnline/);
});

test("chat list respects show_online independently from last seen",()=>{
  const src=read("message-media-fix.mjs");
  assert.match(src,/COALESCE\(pp\.show_online,TRUE\) show_online/);
  assert.match(src,/COALESCE\(pp\.show_last_seen,TRUE\) show_last_seen/);
  assert.match(src,/online:showOnline&&actualOnline/);
  assert.match(src,/last_seen_at:showLastSeen&&!actualOnline/);
});
