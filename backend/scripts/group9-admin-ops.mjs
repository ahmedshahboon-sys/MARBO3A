import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return "scrypt:"+salt.toString("hex")+":"+derived.toString("hex")};

async function makeUser(label,role="user"){
  const suffix=("g9_"+label.replace(/[^a-z0-9]/gi,"").slice(0,5)+"_"+Date.now().toString(36).slice(-4)+"_"+crypto.randomBytes(2).toString("hex")).toLowerCase();
  return (await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male',$4,'active',$5) RETURNING id,email,username,display_name,role",[suffix+"@example.invalid",suffix,label,passwordHash("Group9!Pass123"),role])).rows[0];
}
async function session(userId){
  const token=crypto.randomBytes(32).toString("hex"),h=tokenHash(token);
  await redis.set("session:"+token,String(userId),{EX:1800});
  await pool.query("INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '30 minutes',NOW())",[h,userId]);
  return token;
}
async function call(path,{token,method="GET",body,status=200,error}={}){
  const headers={};if(token)headers.authorization="Bearer "+token;if(body!==undefined)headers["content-type"]="application/json";
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(r.status!==status)throw new Error(method+" "+path+": expected "+status+" got "+r.status+" "+JSON.stringify(data));
  if(error&&data.error!==error)throw new Error(method+" "+path+": expected "+error+" got "+JSON.stringify(data));
  return data;
}

try{
  const admin=await makeUser("Admin","admin"),user=await makeUser("User"),adminToken=await session(admin.id),userToken=await session(user.id);
  const settings=await call("/api/admin/advanced/settings",{token:adminToken});
  if(!settings.schema?.live_max_viewers||!settings.schema?.voice_participant_max||!Array.isArray(settings.features))throw new Error("operational schema missing from admin endpoint");

  await call("/api/admin/advanced/settings",{token:userToken,method:"PATCH",body:{key:"post_limit_per_hour",value:10,reason:"not admin"},status:403,error:"ADMIN_ONLY"});
  await call("/api/admin/advanced/settings",{token:adminToken,method:"PATCH",body:{key:"post_limit_per_hour",value:10,reason:"admin must step up"},status:403,error:"ADMIN_2FA_REQUIRED"});

  const operations=await call("/api/admin/operations",{token:adminToken});
  if(!operations.operations?.database?.ok||!operations.operations?.redis?.ok||!operations.operations?.turn||!operations.operations?.storage||!operations.operations?.release)throw new Error("operations status incomplete");
  if(!Object.prototype.hasOwnProperty.call(operations.operations.backup||{},"lastSuccessAt")||!Object.prototype.hasOwnProperty.call(operations.operations.restore||{},"lastVerifiedAt"))throw new Error("backup/restore operational timestamps missing");

  const audit=await call("/api/admin/advanced/audit?limit=20",{token:adminToken});
  if(!Array.isArray(audit.audit))throw new Error("advanced audit list missing");

  console.log("group9 admin operational read/deny runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
