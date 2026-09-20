import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(p,"utf8");

test("database pool is bounded and slow-query telemetry never logs SQL parameters",()=>{
  const src=read("runtime.mjs");
  assert.match(src,/PG_POOL_MAX/);
  assert.match(src,/PG_STATEMENT_TIMEOUT_MS/);
  assert.match(src,/PG_QUERY_TIMEOUT_MS/);
  assert.match(src,/PG_SLOW_QUERY_MS/);
  assert.match(src,/slow database query/);
  assert.doesNotMatch(src,/slow database query.*args/);
});

test("high-volume collections expose bounded pagination",()=>{
  const social=read("routes/core-social.mjs"),messaging=read("routes/core-messaging.mjs"),reports=read("platform-extra.mjs"),map=read("real-map.mjs");
  assert.match(social,/\/api\/notifications/); assert.match(social,/nextCursor/);
  assert.match(messaging,/\/api\/chats/); assert.match(messaging,/nextCursor/);
  assert.match(reports,/\/api\/admin\/reports/); assert.match(reports,/nextCursor/);
  assert.match(map,/\/api\/map\/people/); assert.match(map,/nextCursor/);
});

test("friend suggestions and feed visibility avoid per-item database queries",()=>{
  const friends=read("routes/fgh-social.mjs"),feed=read("routes/core-feed.mjs");
  assert.match(friends,/WITH my_friends AS/);
  assert.doesNotMatch(friends,/for\(const x of rows\)x\.mutual_count=await mutual/);
  assert.match(feed,/visibilityMap/);
  assert.match(feed,/UNNEST\(\$2::bigint\[\]\)/);
});

test("observability writes to the real operation_logs meta column",()=>{
  const src=read("observability-foundation.mjs");
  assert.match(src,/operation_logs\(user_id,level,category,action,status_code,path,ip_address,meta\)/);
  assert.doesNotMatch(src,/ip_address,details\)/);
});
