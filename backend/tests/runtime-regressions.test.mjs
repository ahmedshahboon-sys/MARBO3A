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
