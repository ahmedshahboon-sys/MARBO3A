import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("story visibility rejects bidirectional blocks in both story owners",()=>{
  const legacy=read("stories.mjs"),ijkl=read("ijkl-experience.mjs");
  for(const src of [legacy,ijkl]){
    assert.match(src,/user_blocks/);
    assert.match(src,/blocker_id=\$1 AND blocked_id=\$2/);
    assert.match(src,/blocked_id=\$1 AND blocker_id=\$2/);
  }
  assert.match(legacy,/if\(await blocked\(ownerId,viewerId\)\)return false/);
  assert.match(ijkl,/if\(await blocked\(story\.user_id,viewer\.id\)\)return false/);
});

test("story creation only accepts local media with matching media kind",()=>{
  const src=read("stories.mjs");
  assert.match(src,/const localMediaUrl=/);
  assert.match(src,/INVALID_STORY_MEDIA/);
  assert.match(src,/INVALID_STORY_MEDIA_TYPE/);
  assert.match(src,/startsWith\("image\/"\)/);
  assert.match(src,/startsWith\("video\/"\)/);
  assert.match(src,/mediaUrl=kind==="text"\?null:rawMediaUrl/);
});

test("story reaction notifications track the current reaction lifecycle",()=>{
  const src=read("ijkl-experience.mjs");
  assert.match(src,/DELETE FROM notifications WHERE user_id=\$1 AND actor_id=\$2 AND type='story_reaction' AND ref_id=\$3/);
  assert.match(src,/DELETE FROM story_reactions WHERE story_id=\$1 AND user_id=\$2/);
  assert.match(src,/if\(story\)await pool\.query\(`DELETE FROM notifications/);
});

test("story deletion removes stale highlights and story notifications transactionally",()=>{
  const src=read("stories.mjs");
  const start=src.indexOf('app.delete("/api/stories/:id"');
  assert.ok(start>=0,"story delete route missing");
  const route=src.slice(start);
  assert.match(route,/client\.query\("BEGIN"\)/);
  assert.match(route,/DELETE FROM story_highlights WHERE story_id=\$1/);
  assert.match(route,/type IN\('story_reaction','story_reply'\)/);
  assert.match(route,/client\.query\("COMMIT"\)/);
  assert.match(route,/client\.query\("ROLLBACK"\)/);
});

test("video uploads verify container signatures and discard invalid files",()=>{
  const src=read("post-media.mjs");
  assert.match(src,/validVideoSignature/);
  assert.match(src,/0x1a&&head\[1\]===0x45&&head\[2\]===0xdf&&head\[3\]===0xa3/);
  assert.match(src,/subarray\(4,8\)\.toString\("ascii"\)==="ftyp"/);
  assert.match(src,/discard\(req\.file\)/);
  assert.match(src,/process\.env\.UPLOAD_DIR/);
});
