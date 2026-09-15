import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const frontend=p=>fs.readFileSync(new URL(`../../frontend/${p}`,import.meta.url),'utf8');

test('guest public feed fallback uses current reactions and active public accounts',()=>{
  const src=read('guest-explore.mjs');
  assert.match(src,/post_reactions/);
  assert.match(src,/u\.account_status='active'/);
  assert.match(src,/who_can_see_posts,'everyone'\)='everyone'/);
});

test('outer guest safety filters inactive public-feed authors',()=>{
  const src=read('r1-safety.mjs');
  assert.match(src,/\/api\/public\/feed/);
  assert.match(src,/account_status='active'/);
  assert.match(src,/body\.posts\.filter/);
});

test('guest room safety scrubs deleted payloads and stops private-room heartbeats',()=>{
  const src=read('r1-safety.mjs');
  assert.match(src,/rooms-v2\\\/\\d\+\\\/messages/);
  assert.match(src,/body:null,attachment_url:null,attachment_type:null/);
  assert.match(src,/presence\\\/heartbeat/);
  assert.match(src,/visibility='public'/);
});

test('PWA notification navigation stays same-origin and shell uses official mark',()=>{
  const sw=frontend('public/sw.js');
  assert.match(sw,/safeAppPath/);
  assert.match(sw,/u\.origin===self\.location\.origin/);
  assert.match(sw,/brand\/official\/marbo3a-mark\.png/);
  assert.match(sw,/marbo3a-shell-v20-guest-pwa-safety/);
});

test('manifest keeps standalone RTL install contract and maskable icon',()=>{
  const manifest=JSON.parse(frontend('public/manifest.webmanifest'));
  assert.equal(manifest.dir,'rtl');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.scope,'/');
  assert.ok(manifest.icons.some(i=>String(i.purpose).includes('maskable')));
});
