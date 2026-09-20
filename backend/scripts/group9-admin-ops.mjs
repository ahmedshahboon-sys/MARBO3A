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
async function raw(path,{token,stepUp,method="GET",body}={}){
  const headers={};if(token)headers.authorization="Bearer "+token;if(stepUp)headers["x-marbo3a-step-up"]=stepUp;if(body!==undefined)headers["content-type"]="application/json";
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text(),data=(()=>{try{return JSON.parse(text)}catch{return{text}}})();
  return{r,data,text};
}
function expect(x,status,error){if(x.r.status!==status)throw new Error("expected "+status+" got "+x.r.status+" "+x.r.url+" "+x.text);if(error&&x.data.error!==error)throw new Error("expected "+error+" got "+x.text);return x.data}
async function call(path,opts={}){const x=await raw(path,opts);return expect(x,opts.status||200,opts.error)}
async function setting(token,key,value,reason="Group 9 runtime verification"){return call("/api/admin/advanced/settings",{token,method:"PATCH",body:{key,value,reason}})}
async function feature(token,key,enabled){return call("/api/admin/advanced/features/"+key,{token,method:"PATCH",body:{enabled,reason:"Group 9 runtime verification"}})}

try{
  const admin=await makeUser("Admin","admin"),user=await makeUser("User"),adminToken=await session(admin.id),userToken=await session(user.id);

  let d=await call("/api/admin/advanced/settings",{token:adminToken});
  if(!d.schema?.live_max_viewers||!d.schema?.voice_participant_max||!Array.isArray(d.features))throw new Error("operational schema missing from admin endpoint");

  await call("/api/admin/advanced/settings",{token:adminToken,method:"PATCH",body:{key:"live_max_viewers",value:9,reason:"invalid range test"},status:400,error:"SETTING_RANGE_INVALID"});
  await call("/api/admin/advanced/settings",{token:adminToken,method:"PATCH",body:{key:"post_limit_per_hour",value:10,reason:"x"},status:400});
  await call("/api/admin/advanced/settings",{token:userToken,method:"PATCH",body:{key:"post_limit_per_hour",value:10,reason:"not admin"},status:403,error:"ADMIN_ONLY"});

  await setting(adminToken,"registration_enabled",false);
  await call("/api/auth/request-email-otp",{method:"POST",body:{email:"blocked@example.invalid"},status:503,error:"REGISTRATION_DISABLED"});
  await setting(adminToken,"registration_enabled",true);

  await setting(adminToken,"rooms_enabled",false);
  await call("/api/rooms",{token:userToken,method:"POST",body:{name:"Blocked Room"},status:503,error:"ROOMS_DISABLED"});
  await setting(adminToken,"rooms_enabled",true);

  await feature(adminToken,"live",false);
  await call("/api/live",{token:userToken,status:503,error:"FEATURE_DISABLED"});
  await feature(adminToken,"live",true);

  await feature(adminToken,"push",false);
  await call("/api/push/config",{token:userToken,status:503,error:"FEATURE_DISABLED"});
  await feature(adminToken,"push",true);

  await setting(adminToken,"room_default_max_members",3);
  await setting(adminToken,"room_max_members_cap",4);
  await call("/api/admin/advanced/settings",{token:adminToken,method:"PATCH",body:{key:"room_default_max_members",value:5,reason:"must fail above cap"},status:409,error:"ROOM_DEFAULT_EXCEEDS_CAP"});
  d=await call("/api/rooms",{token:userToken,method:"POST",body:{name:"Group Nine Room"},status:201});
  const room=(await pool.query("SELECT max_members FROM rooms WHERE id=$1",[d.room.id])).rows[0];
  if(Number(room?.max_members)!==3)throw new Error("room default capacity control was not applied by database trigger");

  const turnstileConfigured=Boolean(String(process.env.TURNSTILE_SECRET_KEY||"").trim()&&String(process.env.TURNSTILE_SITE_KEY||"").trim());
  const captchaConfig=await call("/api/auth/captcha-config");
  if(!turnstileConfigured){
    if(captchaConfig.enabled!==false||captchaConfig.siteKey!=="")throw new Error("captcha config must fail closed without both Turnstile keys");
    await call("/api/admin/advanced/settings",{token:adminToken,method:"PATCH",body:{key:"captcha_escalation_enabled",value:true,reason:"capability guard"},status:409,error:"TURNSTILE_NOT_CONFIGURED"});
  }

  d=await call("/api/admin/operations",{token:adminToken});
  if(!d.operations?.database?.ok||!d.operations?.redis?.ok||!d.operations?.turn||!d.operations?.storage||!d.operations?.release)throw new Error("operations status incomplete");
  if(!Object.prototype.hasOwnProperty.call(d.operations.backup||{},"lastSuccessAt")||!Object.prototype.hasOwnProperty.call(d.operations.restore||{},"lastVerifiedAt"))throw new Error("backup/restore operational timestamps missing");

  d=await call("/api/admin/advanced/audit?limit=100",{token:adminToken});
  if(!(d.audit||[]).some(x=>x.action==="system_setting_change"&&x.reason==="Group 9 runtime verification"))throw new Error("reasoned setting audit missing");

  console.log("group9 admin operational controls runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
