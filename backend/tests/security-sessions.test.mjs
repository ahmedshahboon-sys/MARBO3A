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

test("session creation and logout fail closed around durable storage",()=>{
  const src=read("runtime.mjs");
  const create=src.slice(src.indexOf("export async function createSession"),src.indexOf("export async function destroySession"));
  const destroy=src.slice(src.indexOf("export async function destroySession"),src.indexOf("export const clean"));
  assert.match(create,/await pool\.query\(`INSERT INTO durable_sessions/);
  assert.match(create,/await redis\.del\(`session:\$\{token\}`\)\.catch/);
  assert.doesNotMatch(create,/await pool\.query\(`INSERT INTO durable_sessions[^`]*`[^;]*\)\.catch\(/);
  assert.ok(destroy.indexOf("DELETE FROM durable_sessions")<destroy.indexOf("redis.del"),"durable revocation must precede cache cleanup");
  assert.doesNotMatch(destroy,/await pool\.query\(`DELETE FROM durable_sessions[^`]*`[^;]*\)\.catch\(/);
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

test("credential changes revoke durable sessions before Redis cache",()=>{
  const src=read("security-completion.mjs");
  const revoke=src.slice(src.indexOf("async function revokeAll"),src.indexOf("async function resetAttempt"));
  assert.match(src,/revokeAll\(u\.id,keep\)/);
  assert.match(revoke,/DELETE FROM durable_sessions WHERE user_id=\$1 AND token_hash<>\$2/);
  assert.ok(revoke.indexOf("DELETE FROM durable_sessions")<revoke.indexOf("redis.scanIterator"));
});

test("moderation revocation is durable-first",()=>{
  const src=read("audit-completion.mjs");
  const revoke=src.slice(src.indexOf("async function revokeUserSessions"),src.indexOf("async function reportTargetUser"));
  assert.match(revoke,/DELETE FROM durable_sessions WHERE user_id=\$1/);
  assert.ok(revoke.indexOf("DELETE FROM durable_sessions")<revoke.indexOf("redis.scanIterator"));
  assert.doesNotMatch(revoke,/await pool\.query\(`DELETE FROM durable_sessions[^`]*`[^;]*\)\.catch\(/);
});

test("2FA setup and login challenges cap verification attempts",()=>{
  const src=read("routes/auth-session.mjs");
  assert.match(src,/TWO_FACTOR_MAX_ATTEMPTS=5/);
  assert.match(src,/JSON\.stringify\(\{hash:hashCode\(u\.id,code\),enable,attempts:0\}\)/);
  assert.match(src,/2FA_TOO_MANY_ATTEMPTS/);
  assert.ok(src.includes('!["active","deactivated"].includes(u.account_status)'));
  assert.ok(src.includes('reactivate:u.account_status==="deactivated"'));
});

test("request foundation rate-limits mutations and normalizes OAuth sessions",()=>{
  const src=read("request-foundation.mjs");
  assert.match(src,/import \{pool,sessionUser,tokenFrom\} from "\.\/runtime\.mjs"/);
  assert.match(src,/app\.use\("\/api\/auth",rateLimit/);
  assert.match(src,/app\.use\("\/api",rateLimit/);
  assert.match(src,/\["GET","HEAD","OPTIONS"\]\.includes\(req\.method\)/);
  assert.match(src,/app\.use\("\/api\/auth\/oauth",async\(req,res,next\)=>/);
  assert.match(src,/await sessionUser\(req\)/);
});
