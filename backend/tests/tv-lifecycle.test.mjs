import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const readRepo=file=>fs.readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");

test("TV channel listing never exposes stream credentials and playback tickets are minted on demand",()=>{
 const src=read("routes/tv.mjs");
 assert.match(src,/SELECT id,name,logo_url,group_title FROM tv_channels WHERE enabled=TRUE/);
 assert.match(src,/\/api\/tv\/channels\/:id\/play/);
 assert.match(src,/SELECT id,stream_url FROM tv_channels WHERE id=\$1 AND enabled=TRUE/);
 assert.ok(!src.includes("channels:rows.map(({stream_url"),"listing must not mint thousands of playback tickets");
 assert.match(src,/TICKET_TTL=15\*60\*1000/);
});

test("TV outbound fetches reject private-network sources and unsafe redirects",()=>{
 const src=read("routes/tv.mjs"),admin=read("routes/tv-admin.mjs");
 for(const code of [src,admin]){assert.match(code,/lookup\(/);assert.match(code,/privateIp/);assert.match(code,/redirect:'error'|redirect:'manual'/)}
 assert.match(src,/UNSAFE_STREAM_URL/);
});

test("M3U file import bypasses global JSON ceiling safely with an explicit text limit",()=>{
 const src=read("routes/tv.mjs"),ui=readRepo("frontend/app/admin/tv/page.js");
 assert.match(src,/express\.text\(\{type:'text\/plain',limit:'8mb'\}\)/);
 assert.match(src,/out\.length>=10000/);
 assert.ok(ui.includes('"content-type":"text/plain; charset=utf-8"'));
 assert.ok(ui.includes("file.size>8*1024*1024"));
});

test("TV admin mutations are audited and channel deletion requires a reason",()=>{
 const src=read("routes/tv.mjs"),admin=read("routes/tv-admin.mjs");
 for(const action of ["tv_source_update","tv_import_m3u","tv_refresh"])assert.ok(src.includes(action),`${action} missing`);
 assert.match(admin,/AUDIT_REASON_REQUIRED/);
 assert.match(admin,/tv_channel_update/);
 assert.match(admin,/tv_channel_delete/);
});

test("TV frontend requests a fresh playback ticket when selecting a channel",()=>{
 const ui=readRepo("frontend/app/tv/page.js");
 assert.ok(ui.includes('/play`'));
 assert.ok(ui.includes('method:"POST"'));
 assert.ok(ui.includes("play_url:d.playUrl"));
});
