import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../../${p}`,import.meta.url),"utf8");

test("group14 matrix refuses source-only PASS claims",()=>{
 const m=read("docs/GROUP14-E2E-MATRIX.md");
 assert.match(m,/Never convert NOT_RUN\/BLOCKED into PASS from source inspection alone/);
 for(const area of ["Auth/session","Social","Messaging","Calls","Rooms","Live","Map","Admin","TV","Guest","PWA","Performance","Backup/restore"])assert.ok(m.includes(area));
 assert.match(m,/two real devices\/browsers on different networks/);
 assert.match(m,/real encrypted external copy and restore drill/);
});

test("runtime smoke is read-only and requires explicit target",()=>{
 const s=read("scripts/group14-runtime-smoke.mjs");
 assert.match(s,/E2E_BASE_URL is required/);assert.match(s,/method/,{message:""});
 assert.doesNotMatch(s,/method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
 assert.match(s,/\/api\/health/);assert.match(s,/\/api\/system\/maintenance/);assert.match(s,/guest-auth-boundary/);
});

test("source harness covers backend frontend compose and destructive guard",()=>{
 const s=read("scripts/group14-source-qa.sh");
 assert.match(s,/node --test backend\/tests\/\*\.test\.mjs/);assert.match(s,/npm run test:contracts/);assert.match(s,/docker compose config/);assert.match(s,/docker compose down/);assert.match(s,/supabase/);
});
