import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("session validity is bounded by durable absolute expiry",()=>{
  const src=read("runtime.mjs");
  assert.match(src,/durable_sessions WHERE token_hash=\$1 AND user_id=\$2 AND expires_at>NOW\(\)/);
  assert.doesNotMatch(src,/redis\.expire\(`session:\$\{token\}`\s*,\s*SESSION_TTL/);
  assert.match(src,/UPDATE durable_sessions SET last_seen=NOW\(\) WHERE token_hash=\$1/);
});

test("session cookies stay HttpOnly Secure and SameSite Lax",()=>{
  const src=read("runtime.mjs");
  assert.match(src,/HttpOnly; Secure; SameSite=Lax/);
  assert.match(src,/Max-Age=/);
});

test("device session management uses durable sessions as authority",()=>{
  const src=read("session-control.mjs");
  assert.match(src,/app\.get\("\/api\/account\/sessions"/);
  assert.match(src,/FROM durable_sessions d LEFT JOIN user_sessions s/);
  assert.match(src,/d\.expires_at>NOW\(\)/);
  assert.match(src,/SELECT token_hash FROM durable_sessions WHERE user_id=\$1/);
  assert.match(src,/\^\[a-f0-9\]\{16\}\$/i);
});

test("password reset challenge has a bounded attempt budget",()=>{
  const src=read("security-completion.mjs");
  assert.match(src,/RESET_ATTEMPTS=5/);
  assert.match(src,/pwdreset:attempts:\$\{row\.id\}:\$\{expected\.slice\(0,16\)\}/);
  assert.match(src,/RESET_TOO_MANY_ATTEMPTS/);
  assert.match(src,/redis\.incr\(key\)/);
});

test("password reset request does not reveal whether an email exists",()=>{
  const src=read("platform-extra.mjs");
  assert.match(src,/const resetRateKey=email=>/);
  assert.match(src,/if\(!row\)return res\.json\(\{ok:true\}\)/);
  assert.doesNotMatch(src,/pwdreset:rate:\$\{row\.id\}/);
  assert.doesNotMatch(src,/TOO_SOON/);
});

test("password changes revoke every other durable session",()=>{
  const src=read("security-completion.mjs");
  assert.match(src,/revokeAll\(u\.id,keep\)/);
  assert.match(src,/DELETE FROM durable_sessions WHERE user_id=\$1 AND token_hash<>\$2/);
});

test("2FA setup and login challenges cap verification attempts",()=>{
  const src=read("routes/auth-session.mjs");
  assert.match(src,/TWO_FACTOR_MAX_ATTEMPTS=5/);
  assert.match(src,/JSON\.stringify\(\{hash:hashCode\(u\.id,code\),enable,attempts:0\}\)/);
  assert.match(src,/2FA_TOO_MANY_ATTEMPTS/);
  assert.match(src,/u\.account_status!=="active"/);
});

test("request foundation rate-limits auth and API mutations before legacy routes",()=>{
  const src=read("request-foundation.mjs");
  assert.match(src,/import rateLimit from "express-rate-limit"/);
  assert.match(src,/app\.use\("\/api\/auth",rateLimit/);
  assert.match(src,/app\.use\("\/api",rateLimit/);
  assert.match(src,/\["GET","HEAD","OPTIONS"\]\.includes\(req\.method\)/);
});
