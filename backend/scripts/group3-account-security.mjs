import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`};
const codeHash=(id,code)=>crypto.createHash("sha256").update(`${id}:${code}`).digest("hex");
const recoveryHash=(id,code)=>crypto.createHash("sha256").update(`${id}:${String(code).toUpperCase().replace(/[^A-F0-9]/g,"")}`).digest("hex");

async function makeUser(label,password="Group3!Pass123"){
  const suffix=`${label}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,email=`${suffix}@example.invalid`;
  const row=(await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male',$4,'active','user') RETURNING id,email,username`,[email,suffix,label,passwordHash(password)])).rows[0];
  return{...row,password};
}
async function raw(path,{method="GET",body,headers={}}={}){
  const h={...headers};
  if(body!==undefined)h["content-type"]="application/json";
  const r=await fetch(`${base}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  return{r,data};
}
function assertStatus(result,status,error){
  if(result.r.status!==status)throw new Error(`expected ${status}, got ${result.r.status}: ${JSON.stringify(result.data)}`);
  if(error&&result.data.error!==error)throw new Error(`expected ${error}, got ${JSON.stringify(result.data)}`);
}
function cookieFrom(response){
  const value=String(response.headers.get("set-cookie")||"");
  const match=value.match(/marbo3a_session=([^;]+)/);
  return match?decodeURIComponent(match[1]):"";
}
async function auth(path,{token,cookie,method="GET",body,status=200,error}={}){
  const headers={};
  if(token)headers.authorization=`Bearer ${token}`;
  if(cookie)headers.cookie=`marbo3a_session=${encodeURIComponent(cookie)}`;
  const result=await raw(path,{method,body,headers});
  assertStatus(result,status,error);
  return result;
}

try{
  const user=await makeUser("Group3Web");

  const webLogin=await raw("/api/auth/login",{method:"POST",headers:{"x-marbo3a-session-mode":"cookie"},body:{identifier:user.email,password:user.password}});
  assertStatus(webLogin,200);
  if(webLogin.data.token)throw new Error("cookie web login leaked session token in JSON");
  if(webLogin.data.sessionMode!=="cookie")throw new Error("cookie web login missing sessionMode contract");
  const webCookie=cookieFrom(webLogin.r);
  if(!/^[a-f0-9]{64}$/i.test(webCookie))throw new Error("cookie web login missing HttpOnly session cookie");
  const setCookie=String(webLogin.r.headers.get("set-cookie")||"");
  for(const flag of ["HttpOnly","Secure","SameSite=Lax"])if(!setCookie.includes(flag))throw new Error(`session cookie missing ${flag}`);

  const apiLogin=await raw("/api/auth/login",{method:"POST",body:{identifier:user.email,password:user.password}});
  assertStatus(apiLogin,200);
  if(!/^[a-f0-9]{64}$/i.test(String(apiLogin.data.token||"")))throw new Error("API/mobile login compatibility token missing");
  const mobileToken=apiLogin.data.token;

  const regEmail=`group3reg_${Date.now()}_${crypto.randomBytes(3).toString("hex")}@example.invalid`;
  await redis.set(`email:verified:${regEmail}`,"1",{EX:600});
  const reg=await raw("/api/auth/register",{method:"POST",headers:{"x-marbo3a-session-mode":"cookie"},body:{email:regEmail,username:`g3_${crypto.randomBytes(5).toString("hex")}`,displayName:"Group3 Register",gender:"male",password:"Group3!Register123"}});
  assertStatus(reg,201);
  if(reg.data.token||reg.data.sessionMode!=="cookie"||!cookieFrom(reg.r))throw new Error("cookie web registration leaked or missed session contract");

  const oauthFlow=crypto.randomBytes(24).toString("hex"),oauthEmail=`group3oauth_${Date.now()}_${crypto.randomBytes(3).toString("hex")}@example.invalid`;
  await redis.set(`oauth:pending:${oauthFlow}`,JSON.stringify({mode:"new",provider:"google",sub:`g3-${crypto.randomBytes(8).toString("hex")}`,email:oauthEmail,emailVerified:true,name:"Group3 OAuth",picture:"",next:"/home"}),{EX:600});
  const oauthComplete=await raw("/api/auth/oauth/complete",{method:"POST",headers:{"x-marbo3a-session-mode":"cookie"},body:{flow:oauthFlow,email:oauthEmail,username:`g3o_${crypto.randomBytes(5).toString("hex")}`,displayName:"Group3 OAuth",gender:"male",password:"Group3!Oauth123"}});
  assertStatus(oauthComplete,201);
  if(oauthComplete.data.token||oauthComplete.data.sessionMode!=="cookie"||!cookieFrom(oauthComplete.r))throw new Error("OAuth web completion leaked or missed cookie session contract");

  let result=await auth("/api/account/request-email-change",{cookie:webCookie,method:"POST",body:{email:`next_${user.email}`},status:403,error:"STEP_UP_REQUIRED"});

  result=await auth("/api/account/step-up/request",{cookie:webCookie,method:"POST",body:{currentPassword:"wrong-password"},status:403,error:"WRONG_PASSWORD"});
  result=await auth("/api/account/step-up/request",{cookie:webCookie,method:"POST",body:{currentPassword:user.password}});
  const grant=String(result.data.stepUpToken||"");
  if(!/^[a-f0-9]{64}$/i.test(grant)||result.data.twoFactorRequired!==false)throw new Error("password-only step-up did not issue short-lived grant");

  const changedEmail=`changed_${user.email}`,emailCode="654321",emailKey=`emailchange:${user.id}`;
  const seedEmail=async()=>redis.set(emailKey,JSON.stringify({email:changedEmail,oldEmail:user.email,hash:crypto.createHash("sha256").update(`${user.id}:${changedEmail}:${emailCode}`).digest("hex"),attempts:0}),{EX:600});
  await seedEmail();
  for(let i=1;i<=5;i++){
    const bad=await auth("/api/account/confirm-email-change",{cookie:webCookie,method:"POST",body:{code:"000000",stepUpToken:grant},status:i<5?400:429,error:i<5?"INVALID_CODE":"EMAIL_CHANGE_TOO_MANY_ATTEMPTS"});
    if(i<5&&Number(bad.data.attemptsLeft)!==5-i)throw new Error("email change attempts counter drifted");
  }
  if(await redis.get(emailKey))throw new Error("locked email challenge was not deleted");

  await seedEmail();
  result=await auth("/api/account/confirm-email-change",{cookie:webCookie,method:"POST",body:{code:emailCode,stepUpToken:grant}});
  if(result.data.email!==changedEmail||result.data.otherSessionsRevoked!==true)throw new Error("email change success contract incomplete");
  const dbEmail=(await pool.query(`SELECT email FROM users WHERE id=$1`,[user.id])).rows[0]?.email;
  if(dbEmail!==changedEmail)throw new Error("email change did not persist");
  await auth("/api/auth/me",{token:mobileToken,status:401});
  await auth("/api/auth/me",{cookie:webCookie});

  await auth("/api/account/delete",{cookie:webCookie,method:"POST",body:{},status:403,error:"STEP_UP_REQUIRED"});
  result=await auth("/api/account/delete",{cookie:webCookie,method:"POST",body:{stepUpToken:grant}});
  const deleteAt=new Date(result.data.deleteAt).getTime();
  if(!Number.isFinite(deleteAt)||deleteAt<Date.now()+6.9*86400000||deleteAt>Date.now()+7.1*86400000)throw new Error("account delete grace period is not seven days");
  const security=await auth("/api/account/security",{cookie:webCookie});
  if(!security.data.pendingDeleteAt)throw new Error("pending deletion date missing from account security status");
  await auth("/api/account/cancel-delete",{cookie:webCookie,method:"POST",body:{}});
  const afterCancel=(await pool.query(`SELECT pending_delete_at FROM users WHERE id=$1`,[user.id])).rows[0]?.pending_delete_at;
  if(afterCancel)throw new Error("cancel delete did not clear pending deletion");

  const secondary=crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${secondary}`,String(user.id),{EX:900});
  await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '15 minutes',NOW())`,[tokenHash(secondary),user.id]);
  await auth("/api/account/change-password",{cookie:webCookie,method:"POST",body:{currentPassword:user.password,newPassword:"Group3!Changed456"}});
  await auth("/api/auth/me",{token:secondary,status:401});
  await auth("/api/auth/me",{cookie:webCookie});
  const passwordEvent=Number((await pool.query(`SELECT COUNT(*)::int c FROM account_security_events WHERE user_id=$1 AND kind='password_changed'`,[user.id])).rows[0]?.c||0);
  if(passwordEvent<1)throw new Error("password change security event missing");

  const recoveryUser=await makeUser("Group3Recovery");
  await pool.query(`UPDATE users SET two_factor_enabled=TRUE WHERE id=$1`,[recoveryUser.id]);
  const recoveryRaw="A1B2C3D4E5F6",recoveryDisplay="A1B2-C3D4-E5F6";
  await pool.query(`INSERT INTO two_factor_recovery_codes(user_id,code_hash) VALUES($1,$2)`,[recoveryUser.id,recoveryHash(recoveryUser.id,recoveryRaw)]);
  const challenge=crypto.randomBytes(24).toString("hex");
  await redis.set(`2fa:login:${challenge}`,JSON.stringify({userId:recoveryUser.id,hash:codeHash(recoveryUser.id,"111111"),attempts:0}),{EX:600});
  const recovered=await raw("/api/auth/verify-2fa",{method:"POST",headers:{"x-marbo3a-session-mode":"cookie"},body:{challengeId:challenge,recoveryCode:recoveryDisplay}});
  assertStatus(recovered,200);
  if(recovered.data.token||recovered.data.sessionMode!=="cookie"||recovered.data.recoveryUsed!==true||!cookieFrom(recovered.r))throw new Error("recovery-code cookie login contract failed");
  const used=(await pool.query(`SELECT used_at FROM two_factor_recovery_codes WHERE user_id=$1`,[recoveryUser.id])).rows[0]?.used_at;
  if(!used)throw new Error("recovery code was not consumed");

  const challenge2=crypto.randomBytes(24).toString("hex");
  await redis.set(`2fa:login:${challenge2}`,JSON.stringify({userId:recoveryUser.id,hash:codeHash(recoveryUser.id,"222222"),attempts:0}),{EX:600});
  const reused=await raw("/api/auth/verify-2fa",{method:"POST",headers:{"x-marbo3a-session-mode":"cookie"},body:{challengeId:challenge2,recoveryCode:recoveryDisplay}});
  assertStatus(reused,400,"2FA_INVALID");

  console.log("group3 account security runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
