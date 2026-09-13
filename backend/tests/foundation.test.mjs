import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

function count(text,needle){return text.split(needle).length-1}

test("server v3 is the only production entrypoint and does not own duplicate infrastructure",()=>{
  const pkg=JSON.parse(read("package.json"));
  assert.match(pkg.scripts.start,/server-v3\.mjs/);
  const server=read("server-v3.mjs");
  assert.equal(server.includes("new pg.Pool"),false);
  assert.equal(server.includes("createClient("),false);
  assert.equal(server.includes("new Server("),false);
  assert.equal(server.includes("CREATE TABLE"),false);
  assert.equal(server.includes("ALTER TABLE"),false);
  assert.equal(server.includes("ADMIN_USERNAME"),false);
  assert.match(server,/restoreHttpCreateServer\(\)/);
});

test("legacy duplicate foundation files are removed",()=>{
  for(const file of ["server.mjs","product-v2.mjs","preflight.mjs","cookie-auth.mjs"]){
    assert.equal(fs.existsSync(path.join(root,file)),false,`${file} must stay removed`);
  }
});

test("request foundation is outermost and parsing is authoritative",()=>{
  const bootstrap=read("bootstrap.mjs");
  const foundation=read("request-foundation.mjs");
  const array=bootstrap.match(/const modules=\[([\s\S]*?)\];/)?.[1]||"";
  const imports=[...array.matchAll(/"(\.\/[^\"]+)"/g)].map(x=>x[1]);
  assert.equal(imports.at(-1),"./request-foundation.mjs");
  assert.equal(imports.includes("./preflight.mjs"),false);
  assert.equal(imports.includes("./cookie-auth.mjs"),false);
  assert.equal(imports.includes("./product-v2.mjs"),false);
  assert.equal(count(foundation,"express.json("),1);
  assert.match(foundation,/express\.urlencoded\(/);
  assert.match(foundation,/credentials:true/);
  assert.doesNotMatch(foundation,/origin:\s*["']\*["']/);
});

test("runtime owns cookies sessions admin policy and realtime emitters",()=>{
  const runtime=read("runtime.mjs");
  assert.match(runtime,/export function cookieToken/);
  assert.match(runtime,/export function bearerToken/);
  assert.match(runtime,/bearerToken\(req\)\|\|cookieToken\(req\)/);
  assert.match(runtime,/String\(u\?\.role\|\|""\)\.toLowerCase\(\)===?"admin"/);
  assert.doesNotMatch(runtime,/username.*admin/i);
  assert.match(runtime,/durable_sessions/);
  assert.match(runtime,/emitUser/);
  assert.match(runtime,/emitRoom/);
  assert.match(runtime,/emitChat/);
});

test("auth session endpoints have one explicit owner",()=>{
  const auth=read("routes/auth-session.mjs");
  assert.equal(count(auth,'app.post("/api/auth/login"'),1);
  assert.equal(count(auth,'app.get("/api/auth/me"'),1);
  assert.equal(count(auth,'app.post("/api/auth/logout"'),1);
  assert.match(auth,/isAdmin\(u\)/);
  assert.doesNotMatch(auth,/ADMIN_USERNAME/);
});

test("legacy realtime emits were moved to shared realtime v2 helpers",()=>{
  for(const file of ["routes/core-messaging.mjs","routes/core-social.mjs"]){
    const text=read(file);
    assert.doesNotMatch(text,/\bio\.to\(/);
  }
  assert.match(read("routes/core-messaging.mjs"),/emitRoom/);
  assert.match(read("routes/core-messaging.mjs"),/emitChat/);
  assert.match(read("routes/core-social.mjs"),/emitUser/);
});

test("database bootstrap is migration-only",()=>{
  const entryFiles=["server-v3.mjs","routes/auth-registration.mjs","routes/auth-session.mjs","routes/core-rooms.mjs","routes/core-messaging.mjs","routes/core-social.mjs","routes/core-location.mjs","routes/core-admin-rooms.mjs"];
  for(const file of entryFiles){
    const text=read(file);
    assert.doesNotMatch(text,/CREATE\s+TABLE/i,`${file} contains runtime CREATE TABLE`);
    assert.doesNotMatch(text,/ALTER\s+TABLE/i,`${file} contains runtime ALTER TABLE`);
  }
  assert.equal(fs.existsSync(path.join(root,"migrations/025_default_rooms_seed.sql")),true);
});
