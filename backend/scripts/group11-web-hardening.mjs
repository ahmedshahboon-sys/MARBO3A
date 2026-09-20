import crypto from "node:crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const origin=new URL(base).origin;
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();

async function jsonCall(path,{status=200,method="GET",headers={},body}={}){
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual"});
  const data=await response.json().catch(()=>({}));
  if(response.status!==status)throw new Error(method+" "+path+": expected "+status+", got "+response.status+" "+JSON.stringify(data));
  return{response,data};
}
const tokenHash=t=>crypto.createHash("sha256").update(t).digest("hex");
async function sessionFor(userId,prefix){
  const token=(prefix.repeat(64)).slice(0,64);
  await redis.set("session:"+token,String(userId),{EX:600});
  await pool.query("INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '10 minutes',NOW())",[tokenHash(token),userId]);
  return token;
}

try{
  const health=await jsonCall("/api/health");
  if(JSON.stringify(Object.keys(health.data).sort())!==JSON.stringify(["ok"]))throw new Error("public /api/health exposed fields beyond ok");
  if(health.data.ok!==true)throw new Error("public /api/health not healthy");
  const legacy=await jsonCall("/health");
  if(JSON.stringify(Object.keys(legacy.data).sort())!==JSON.stringify(["ok"]))throw new Error("public /health exposed fields beyond ok");

  const csp=health.response.headers.get("content-security-policy")||"";
  const scriptSrc=csp.split(";").map(x=>x.trim()).find(x=>x.startsWith("script-src"))||"";
  if(!scriptSrc||scriptSrc.includes("'unsafe-inline'"))throw new Error("API script-src still permits unsafe-inline");
  for(const name of ["strict-transport-security","referrer-policy","x-content-type-options","x-frame-options","permissions-policy"]){
    if(!health.response.headers.get(name))throw new Error("missing public security header "+name);
  }

  await jsonCall("/api/health",{status:403,headers:{origin:"https://evil.example"}});
  const preflight=await fetch(base+"/api/profile/identity",{method:"OPTIONS",headers:{
    origin,
    "access-control-request-method":"PATCH",
    "access-control-request-headers":"content-type,x-marbo3a-session-mode"
  }});
  if(preflight.status!==204)throw new Error("trusted CORS preflight expected 204, got "+preflight.status);
  if(preflight.headers.get("access-control-allow-origin")!==origin)throw new Error("trusted CORS origin not reflected exactly");
  if(preflight.headers.get("access-control-allow-credentials")!=="true")throw new Error("credentialed CORS header missing");

  const suffix=Date.now().toString(36);
  const user=(await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male','scrypt:00:00','active','user') RETURNING id,username",["group11-"+suffix+"@example.invalid","group11_"+suffix,"Group 11 User"])).rows[0];
  const admin=(await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male','scrypt:00:00','active','admin') RETURNING id",["group11-admin-"+suffix+"@example.invalid","group11_admin_"+suffix,"Group 11 Admin"])).rows[0];
  const userToken=await sessionFor(user.id,"c");
  const adminToken=await sessionFor(admin.id,"d");

  const body={displayName:"CSRF Checked",username:user.username};
  await jsonCall("/api/profile/identity",{method:"PATCH",status:403,headers:{cookie:"marbo3a_session="+userToken,"content-type":"application/json"},body});
  const trusted=await jsonCall("/api/profile/identity",{method:"PATCH",headers:{cookie:"marbo3a_session="+userToken,origin,"sec-fetch-site":"same-origin","content-type":"application/json"},body});
  if(trusted.data.user?.display_name!=="CSRF Checked")throw new Error("trusted same-origin cookie mutation did not succeed");

  const bearer=await jsonCall("/api/profile/identity",{method:"PATCH",headers:{authorization:"Bearer "+userToken,"content-type":"application/json"},body:{displayName:"Bearer Client",username:user.username}});
  if(bearer.data.user?.display_name!=="Bearer Client")throw new Error("Bearer API client regressed under CSRF hardening");

  await jsonCall("/api/admin/readiness",{status:403,headers:{authorization:"Bearer "+userToken}});
  const readiness=await jsonCall("/api/admin/readiness",{headers:{authorization:"Bearer "+adminToken}});
  if(!readiness.data.checks||typeof readiness.data.checks.database!=="boolean"||!readiness.data.storage)throw new Error("admin-only readiness lost operational detail");

  console.log("Group 11 web hardening runtime OK");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
