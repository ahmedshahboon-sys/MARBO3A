import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("Group 4 gives core feed and social profile one explicit owner",()=>{
  const feed=read("routes/core-feed.mjs"),routes=read("routes/index.mjs"),boot=read("bootstrap.mjs");
  for(const token of [
    'app.get("/api/feed"',
    'app.get("/api/public/feed"',
    'app.get("/api/feed/:id/reactions"',
    'app.put("/api/feed/:id/reaction"',
    'app.get("/api/feed/:id/comments"',
    'app.post("/api/feed/:id/comments"',
    'app.get("/api/social/profile/:username"'
  ])assert.ok(feed.includes(token),`missing canonical route ${token}`);
  assert.match(feed,/user_blocks/);
  assert.match(feed,/account_status='active'/);
  assert.match(feed,/await blocked\(viewer\.id,p\.id\)/);
  assert.match(routes,/registerCoreFeed/);
  assert.doesNotMatch(boot,/fgh-regression-hotfix\.mjs/);
});

test("Group 4 social profile and friend discovery are block aware",()=>{
  const social=read("routes/fgh-social.mjs"),core=read("routes/core-social.mjs");
  assert.match(social,/app\.get\("\/api\/users\/:id\/social"/);
  assert.match(social,/await blocked\(u\.id,id\)/);
  assert.match(social,/who_can_see_friends/);
  assert.match(social,/deleted_at IS NULL/);
  assert.match(core,/\/api\/users\/search/);
  assert.match(core,/user_blocks/);
  assert.match(core,/FRIENDSHIP_NOT_FOUND/);
  assert.match(core,/FRIEND_REMOVED/);
});
