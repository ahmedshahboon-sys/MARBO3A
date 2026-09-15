import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../../${p}`,import.meta.url),"utf8");

test("release closure is evidence gated",()=>{
 const d=read("docs/RELEASE-CLOSURE.md");
 for(const token of ["SOURCE_READY","E2E_PENDING","RELEASE_CANDIDATE","PRODUCTION_READY","RELEASED","two-user/two-device/two-network","encrypted offsite backup","explicitly authorizes Production deployment"])assert.ok(d.includes(token),`${token} missing`);
 assert.match(d,/PRODUCTION_READY: NO/);assert.match(d,/RELEASED: NO/);
});

test("preflight pins exact candidate and refuses dirty source",()=>{
 const s=read("scripts/release-preflight.sh");
 assert.match(s,/RELEASE_CANDIDATE_SHA is required/);assert.match(s,/git rev-parse HEAD/);assert.match(s,/git status --porcelain/);assert.match(s,/group14-source-qa\.sh/);
 assert.doesNotMatch(s,/git reset --hard|git push|docker compose up|deploy-production/);
});

test("production deployment retains rollback and restore gates",()=>{
 const s=read("ops/deploy-production.sh");
 for(const token of ["flock -n","pg_dump","pg_restore","rollback","wait_api","wait_web_internal","wait_public","audit-foundation.sh"])assert.ok(s.includes(token),`${token} missing`);
 assert.doesNotMatch(s,/docker compose down\s+-v/);
});
