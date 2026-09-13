import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(process.cwd()),read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("R1 migration is additive and defines feed/comment/ad/voice schema",()=>{
  const sql=read("migrations/033_r1_core_feed_branding.sql");
  for(const token of ["parent_comment_id","comment_reactions","sponsored_posts","sponsored_post_events","forced_muted","room_voice_seat_locks","love","wow"])assert.ok(sql.includes(token),`missing ${token}`);
  assert.doesNotMatch(sql,/DROP\s+(TABLE|COLUMN)|TRUNCATE\s+/i);
});

test("R1 smart feed uses engagement freshness friendship and seeded diversity",()=>{
  const src=read("r1-core-experience.mjs");
  for(const token of ["rankedFeed","hashtext","post_reactions","post_comments","friendships","NOW()-p.created_at","seedOf","ranking:\"smart-v1\"","interleaveSponsored","(i+1)%4===0"])assert.ok(src.includes(token),`missing ${token}`);
  assert.ok(src.includes('/api/public/feed'));
  assert.ok(src.includes('/api/feed'));
});

test("R1 threaded comments and custom reactions are first class",()=>{
  const src=read("r1-core-experience.mjs");
  for(const token of ["parentCommentId","REPLY_DEPTH_LIMIT","comment_reactions","comment_reply","comment_reaction","love","laugh","wow","sad","angry"])assert.ok(src.includes(token),`missing ${token}`);
});

test("R1 sponsored posts have admin control and metrics events",()=>{
  const src=read("r1-core-experience.mjs");
  for(const token of ["/api/admin/sponsored-posts","sponsored_post_events","impression","click","sponsored_label","destination_url","weight"])assert.ok(src.includes(token),`missing ${token}`);
});

test("R1 room voice resets stale join state and adds manager moderation",()=>{
  const src=read("r1-core-experience.mjs");
  for(const token of ["join-reset","forced_muted","room_voice_seat_locks","voice/seats/:seat","voice/moderate","force-mute","forced-listener","roomvoice:kicked"])assert.ok(src.includes(token),`missing ${token}`);
  assert.match(src,/ON CONFLICT\(room_id,user_id\) DO UPDATE SET role='listener',seat_index=NULL/);
});

test("R1 safety preserves blocked-user and orphan-reply behavior",()=>{
  const src=read("r1-safety.mjs");
  assert.ok(src.includes("user_blocks"));
  assert.ok(src.includes("posts.filter"));
  assert.ok(src.includes("comments.filter"));
  assert.ok(src.includes("!c.parent_comment_id"));
});

test("bootstrap keeps R1 routes inside safety and request foundation",()=>{
  const src=read("bootstrap.mjs"),core=src.indexOf('"./r1-core-experience.mjs"'),safety=src.indexOf('"./r1-safety.mjs"'),foundation=src.indexOf('"./request-foundation.mjs"');
  assert.ok(core>0&&safety>core&&foundation>safety);
});
