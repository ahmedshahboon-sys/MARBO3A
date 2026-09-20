import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("IJKL migration owns room map and story schema",()=>{const sql=read("migrations/028_ijkl_social_surfaces.sql");for(const token of ["rooms_visibility_check","visibility_mode","ghost_mode","story_reactions","story_mutes","story_highlights"])assert.match(sql,new RegExp(token))});
test("canonical stories own story lifecycle while IJKL keeps public discovery",()=>{
  const stories=read("routes/core-stories.mjs"),ijkl=read("ijkl-experience.mjs");
  for(const token of ["/api/stories/:id/reply","/api/stories/:id/reaction","/api/stories/mutes/:userId","/api/stories/:id/highlight"])assert.ok(stories.includes(token));
  for(const token of ["/api/public/rooms","/api/public/stats","visibility"])assert.ok(ijkl.includes(token));
  assert.doesNotMatch(ijkl,/app\.(get|post|put|delete)\("\/api\/stories/);
});
test("map enforces ghost and friends visibility",()=>{const src=read("real-map.mjs");assert.match(src,/ghost_mode/);assert.match(src,/visibility_mode/);assert.match(src,/is_friend/)});
