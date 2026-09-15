import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const readFrontend=file=>fs.readFileSync(new URL(`../../frontend/app/${file}`,import.meta.url),"utf8");

test("map people compatibility routes share the privacy-safe owner",()=>{
  const src=read("real-map.mjs");
  assert.match(src,/app\.get\("\/api\/map\/people-v2",people\)/);
  assert.match(src,/app\.get\("\/api\/map\/people",people\)/);
  assert.match(src,/ghost_mode/);
  assert.match(src,/visibility_mode==="friends"/);
  assert.match(src,/user_blocks/);
  assert.match(src,/show_online/);
  assert.match(src,/show_last_seen/);
});

test("map city and places compatibility never average stored precise coordinates",()=>{
  const src=read("real-map.mjs");
  assert.match(src,/app\.get\("\/api\/map\/cities",cities\)/);
  assert.match(src,/app\.get\("\/api\/map\/places",places\)/);
  assert.match(src,/visibleCities/);
  assert.match(src,/l\.ghost_mode=FALSE/);
  assert.match(src,/l\.visibility_mode='everyone'/);
  assert.match(src,/const point=base\(row\.city\)/);
  assert.doesNotMatch(src,/AVG\(latitude\)/);
  assert.doesNotMatch(src,/AVG\(longitude\)/);
});

test("explicit location writes fail closed and clear precise coordinates",()=>{
  const src=read("routes/core-location.mjs");
  assert.match(src,/LOCATION_VISIBILITY/);
  assert.match(src,/INVALID_LOCATION_VISIBILITY/);
  assert.match(src,/INVALID_PRECISE_LOCATION/);
  assert.match(src,/const storedLat=share\?lat:null,storedLng=share\?lng:null/);
  assert.match(src,/provided\(rawLat\)/);
  assert.match(src,/provided\(rawLng\)/);
});

test("legacy map writes are normalized before historical handlers",()=>{
  const foundation=read("request-foundation.mjs");
  const map=read("real-map.mjs");
  assert.match(foundation,/req\.path!=="\/api\/profile\/extended"/);
  assert.match(foundation,/delete req\.body\.latitude;delete req\.body\.longitude/);
  assert.match(foundation,/INVALID_PRECISE_LOCATION/);
  assert.match(map,/app\.post\("\/api\/profile\/location",legacyLocation\)/);
  assert.match(map,/sharePrecise\?lat:null/);
  assert.match(map,/sharePrecise\?lng:null/);
});

test("map feature flag covers modern and legacy location surfaces",()=>{
  const src=read("request-foundation.mjs");
  assert.match(src,/req\.path\.startsWith\("\/api\/map"\)/);
  assert.match(src,/req\.path==="\/api\/location"/);
  assert.match(src,/req\.path==="\/api\/profile\/location"/);
  assert.match(src,/mapProfileWrite/);
  assert.match(src,/feature:"map"/);
});

test("map UI clears local precise coordinates when sharing is disabled",()=>{
  const src=readFrontend("map/page.js");
  assert.match(src,/let latitude=null,longitude=null/);
  assert.match(src,/prefs\.sharePrecise/);
  assert.match(src,/مسح الموقع الدقيق المحفوظ/);
  assert.match(src,/INVALID_LOCATION_VISIBILITY/);
});
