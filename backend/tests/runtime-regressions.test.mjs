import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("comment preview uses the real post_comments edit timestamp",()=>{
  const src=read("social-experience.mjs");
  const start=src.indexOf('app.get("/api/feed/:id/comments/preview"');
  const end=src.indexOf('app.get("/api/profile/identity"',start);
  assert.ok(start>=0&&end>start,"comment preview route must exist before profile identity route");
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

test("map city activity honors privacy and validates precise coordinates",()=>{
  const src=read("routes/core-location.mjs");
  assert.match(src,/l\.ghost_mode=FALSE/);
  assert.match(src,/COALESCE\(p\.show_city,TRUE\)=TRUE/);
  assert.match(src,/l\.visibility_mode='friends'/);
  assert.match(src,/user_blocks/);
  assert.match(src,/INVALID_PRECISE_LOCATION/);
  assert.match(src,/lat>=-90&&lat<=90/);
  assert.match(src,/lng>=-180&&lng<=180/);
});

test("chat list respects show_online independently from last seen",()=>{
  const src=read("message-media-fix.mjs");
  assert.match(src,/COALESCE\(pp\.show_online,TRUE\) show_online/);
  assert.match(src,/COALESCE\(pp\.show_last_seen,TRUE\) show_last_seen/);
  assert.match(src,/online:showOnline&&actualOnline/);
  assert.match(src,/last_seen_at:showLastSeen&&!actualOnline/);
});

test("direct post interactions enforce the smart-feed visibility contract",()=>{
  const src=read("r1-safety.mjs");
  assert.match(src,/canAccessPost/);
  assert.match(src,/who_can_see_posts/);
  assert.match(src,/user_blocks/);
  assert.match(src,/friends_of_friends/);
  assert.match(src,/POST_NOT_FOUND/);
  assert.match(src,/reactions\?/);
  assert.match(src,/comments/);
  assert.match(src,/save/);
});

test("authenticated profile feed honors post visibility and blocks",()=>{
  const src=read("feed-extensions.mjs");
  assert.match(src,/who_can_see_posts/);
  assert.match(src,/canSeePosts/);
  assert.match(src,/await blocked\(viewer\.id,p\.id\)/);
  assert.match(src,/postVisible\?/);
  assert.match(src,/postRows=postVisible\?/);
});

test("public profile summary only counts guest-visible posts",()=>{
  const src=read("social-ui-backend.mjs");
  assert.match(src,/who_can_see_posts/);
  assert.match(src,/COALESCE\(pp\.who_can_see_posts,'everyone'\)='everyone'/);
  assert.match(src,/delete user\.who_can_see_posts/);
});

test("post edits cannot create an empty text-only post and delete clears stale pins",()=>{
  const src=read("feed-extensions.mjs");
  assert.match(src,/SELECT 1 FROM post_media WHERE post_id=\$1 LIMIT 1/);
  assert.match(src,/if\(!body&&!hasMedia\)return res\.status\(400\)\.json\(\{ok:false,error:"EMPTY_POST"\}\)/);
  assert.match(src,/UPDATE users SET pinned_post_id=NULL WHERE pinned_post_id=\$1/);
  assert.match(src,/client\.query\("BEGIN"\)/);
  assert.match(src,/client\.query\("COMMIT"\)/);
});

test("deleting a root comment soft-deletes its replies and reports the count",()=>{
  const src=read("release-hardening.mjs");
  const start=src.indexOf('app.delete("/api/feed/:postId/comments/:commentId"');
  const end=src.indexOf('app.use(async(req,_res,next)',start);
  assert.ok(start>=0&&end>start,"comment delete route must exist before notification middleware");
  const route=src.slice(start,end);
  assert.match(route,/parent_comment_id/);
  assert.match(route,/parent_comment_id=\$2/);
  assert.match(route,/deletedCount:deleted\.length/);
  assert.match(route,/deletedIds:deleted\.map/);
});

test("saved post queries enforce privacy and blocks in SQL without per-row checks",()=>{
  const src=read("closure-routes.mjs");
  assert.match(src,/const savedVisibilitySql=/);
  assert.match(src,/who_can_see_posts/);
  assert.match(src,/NOT EXISTS\(SELECT 1 FROM user_blocks/);
  assert.match(src,/friends_of_friends/);
  assert.match(src,/JOIN friendships mine/);
  assert.match(src,/\$\{savedVisibilitySql\}/);
  assert.doesNotMatch(src,/visibleSavedRows/);
});
