import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const readRepo=p=>fs.readFileSync(path.join(root,"..",p),"utf8");

test("public health is minimal and detailed readiness remains admin-only",()=>{
  const server=read("server-v3.mjs"),admin=read("routes/core-admin-control.mjs");
  assert.match(server,/res\.json\(\{ok:true\}\)/);
  assert.match(server,/res\.status\(503\)\.json\(\{ok:false\}\)/);
  assert.doesNotMatch(server,/api:"MARBO3A API"/);
  assert.match(admin,/requireAdmin\(req,res\)/);
  assert.match(admin,/\/api\/admin\/readiness/);
  assert.match(admin,/database:false,redis:false/);
});

test("cookie browser mutations have source validation while bearer stays separate",()=>{
  const foundation=read("request-foundation.mjs");
  assert.match(foundation,/cookieMutationSourceAllowed/);
  assert.match(foundation,/cookieToken\(req\)/);
  assert.match(foundation,/bearerToken\(req\)/);
  assert.match(foundation,/CSRF_SOURCE_REJECTED/);
  assert.match(foundation,/sec-fetch-site/);
  assert.match(foundation,/APP_ORIGIN_ALIASES/);
  assert.doesNotMatch(foundation,/origin:\s*["']\*["']/);
});

test("script CSP removes unsafe-inline and web proxy uses nonces",()=>{
  const foundation=read("request-foundation.mjs"),proxy=readRepo("frontend/proxy.js");
  const apiScript=foundation.match(/script-src[^;"]+/)?.[0]||"";
  assert.ok(apiScript&&!apiScript.includes("unsafe-inline"),"API script-src must not contain unsafe-inline");
  assert.match(proxy,/nonce-\$\{nonce\}/);
  assert.match(proxy,/strict-dynamic/);
  assert.match(proxy,/style-src 'self' 'unsafe-inline'/);
  assert.match(proxy,/Cross-Origin-Opener-Policy/);
  assert.doesNotMatch(proxy,/script-src[^\n]*unsafe-inline/);
});

test("redirect targets reject protocol-relative and backslash forms",()=>{
  const auth=read("social-auth.mjs");
  assert.match(auth,/decoded\.startsWith\("\/\/"\)/);
  assert.match(auth,/decoded\.includes\("\\\\"\)/);
  assert.match(auth,/marbo3a\.invalid/);
  for(const file of ["frontend/app/page.js","frontend/app/onboarding/page.js","frontend/app/MaintenanceRuntime.js"]){
    const src=readRepo(file);
    assert.match(src,/marbo3a\.invalid/);
    assert.match(src,/decoded\.startsWith\("\/\/"\)/);
  }
});
