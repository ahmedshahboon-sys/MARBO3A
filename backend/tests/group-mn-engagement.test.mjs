import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("Group M/N migration defines engagement storage",()=>{
  const sql=read("migrations/029_group_mn_engagement.sql");
  for(const name of ["polls","poll_options","poll_votes","saved_collections","saved_collection_posts","user_experience_preferences","content_views"])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${name}`));
  assert.match(sql,/PRIMARY KEY\(poll_id,user_id\)/);
  assert.match(sql,/PRIMARY KEY\(viewer_id,content_type,content_id,viewed_on\)/);
});

test("streak requires bilateral activity with an accepted friend",()=>{
  const src=read("routes/group-mn-engagement.mjs");
  assert.match(src,/BOOL_OR\(dm\.sender_id=\$1\)/);
  assert.match(src,/BOOL_OR\(dm\.sender_id<>\$1\)/);
  assert.match(src,/JOIN friendships f ON f\.status='accepted'/);
  assert.match(src,/warning:!set\.has\(today\)&&count>0/);
  assert.match(src,/milestone100:count>=100/);
});

test("streak SQL uses an explicit non-keyword date alias",()=>{
  const src=read("routes/group-mn-engagement.mjs");
  assert.doesNotMatch(src,/::date\s+day\b/);
  assert.match(src,/::date AS activity_day/);
  assert.match(src,/rows\.map\(r=>r\.activity_day\)/);
});

test("trending and suggestions protect privacy and block relations",()=>{
  const src=read("routes/group-mn-engagement.mjs");
  assert.match(src,/who_can_see_posts,'everyone'/);
  assert.match(src,/user_blocks/);
  assert.match(src,/\/api\/engagement\/trending/);
  assert.match(src,/\/api\/engagement\/suggestions/);
});

test("polls collections analytics and experience preferences are routed",()=>{
  const src=read("routes/group-mn-engagement.mjs"),index=read("routes/index.mjs");
  for(const route of ["/api/engagement/polls","/api/engagement/memories","/api/engagement/collections","/api/engagement/analytics","/api/experience/preferences"])assert.ok(src.includes(route),`${route} missing`);
  assert.match(index,/registerGroupMNEngagement/);
  assert.match(src,/options\.length<2/);
  assert.match(src,/slice\(0,6\)/);
});
