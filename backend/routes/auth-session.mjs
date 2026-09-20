import crypto from "crypto";
import {promisify} from "util";
import {pool,redis,ensureRedis,requireAuth,createSession,destroySession,tokenFrom,clean,ipOf,isAdmin,setSessionCookie,clearSessionCookie} from "../runtime.mjs";

const scryptAsync=promisify(crypto.scrypt),SESSION_TTL=7*24*60*60,TWO_FACTOR_MAX_ATTEMPTS=5,STEP_UP_TTL=600,RECOVERY_CODE_COUNT=8;
async function verifyPassword(password,stored){try{const[algo,saltHex,hashHex]=String(stored||"").split(":");if(algo!=="scrypt")return false;const out=await scryptAsync(password,Buffer.from(saltHex,"hex"),64),a=Buffer.from(hashHex,"hex"),b=Buffer.from(out);return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}}
const hashCode=(id,code)=>crypto.createHash("sha256").update(`${id}:${code}`).digest("hex");
const cookieOnly=req=>String(req.headers["x-marbo3a-session-mode"]||"").toLowerCase()==="cookie";
const sessionPayload=(req,token,payload)=>cookieOnly(req)?{...payload,sessionMode:"cookie"}:{...payload,token};
const normalizeRecovery=value=>String(value||"").toUpperCase().replace(/[^A-F0-9]/g,"").slice(0,12);
const recoveryHash=(userId,code)=>crypto.createHash("sha256").update(`${userId}:${normalizeRecovery(code)}`).digest("hex");
const displayRecovery=raw=>raw.replace(/(.{4})(?=.)/g,"$1-");
async function sendMail(email,subject,html){if(!process.env.BREVO_API_KEY)throw new Error("EMAIL_NOT_CONFIGURED");const r=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{accept:"application/json","content-type":"application/json","api-key":process.env.BREVO_API_KEY},body:JSON.stringify({sender:{name:"مربوعة",email:"no-reply@marbo3a.ly"},to:[{email}],subject,htmlContent:html})});if(!r.ok)throw new Error("EMAIL_SEND_FAILED")}
async function sendCode(user,code,purpose){await sendMail(user.email,purpose==="login"?"رمز الدخول الآمن إلى مربوعة":purpose==="stepup"?"تأكيد عملية حساسة في مربوعة":"تأكيد المصادقة الثنائية",`<div dir="rtl" style="font-family:Arial;padding:28px"><h2 style="color:#ff7a00">مربوعة</h2><p>رمز الأمان الخاص بك:</p><div style="font-size:34px;font-weight:900;letter-spacing:7px">${code}</div><p>صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.</p></div>`)}
async function recordSecurity(userId,kind,req,details={}){await pool.query(`INSERT INTO account_security_events(user_id,kind,ip_address,user_agent,details) VALUES($1,$2,$3,$4,$5::jsonb)`,[userId,kind,ipOf(req),clean(req.headers["user-agent"],300),JSON.stringify(details)]).catch(()=>{})}
async function loginAlert(user,req){try{await sendMail(user.email,"تسجيل دخول جديد إلى مربوعة",`<div dir="rtl" style="font-family:Arial;padding:24px"><h2 style="color:#ff7a00">مربوعة</h2><p>تم تسجيل دخول جديد إلى حسابك.</p><p>الوقت: ${new Date().toISOString()}</p><p>إذا لم تكن أنت، غيّر كلمة المرور وأنهِ الجلسات الأخرى من إعدادات الأمان.</p></div>`)}catch{}}
async function issueRecoveryCodes(userId){
  const raw=Array.from({length:RECOVERY_CODE_COUNT},()=>crypto.randomBytes(6).toString("hex").toUpperCase());
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query(`DELETE FROM two_factor_recovery_codes WHERE user_id=$1`,[userId]);
    for(const code of raw)await client.query(`INSERT INTO two_factor_recovery_codes(user_id,code_hash) VALUES($1,$2)`,[userId,recoveryHash(userId,code)]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e}finally{client.release()}
  return raw.map(displayRecovery);
}
async function consumeRecoveryCode(userId,value){
  const code=normalizeRecovery(value);
  if(!/^[A-F0-9]{12}$/.test(code))return false;
  const row=(await pool.query(`UPDATE two_factor_recovery_codes SET used_at=NOW() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id`,[userId,recoveryHash(userId,code)])).rows[0];
  return Boolean(row);
}
async function recoveryRemaining(userId){return Number((await pool.query(`SELECT COUNT(*)::int c FROM two_factor_recovery_codes WHERE user_id=$1 AND used_at IS NULL`,[userId]).catch(()=>({rows:[{c:0}]}))).rows[0]?.c||0)}
async function issueStepUpGrant(userId,{sessionToken="",admin=false}={}){
  await ensureRedis();
  const token=crypto.randomBytes(32).toString("hex");
  await redis.set(`stepup:grant:${userId}:${token}`,"1",{EX:STEP_UP_TTL});
  if(admin&&/^[a-f0-9]{64}$/i.test(sessionToken)){
    const sessionHash=crypto.createHash("sha256").update(sessionToken).digest("hex");
    await redis.set(`adminstepup:grant:${userId}:${sessionHash}:${token}`,"1",{EX:STEP_UP_TTL});
  }
  return token;
}
async function failedAttempt(key,p){
  p.attempts=Number(p.attempts||0)+1;
  if(p.attempts>=TWO_FACTOR_MAX_ATTEMPTS){await redis.del(key);return false}
  await redis.set(key,JSON.stringify(p),{EX:Math.max(1,await redis.ttl(key))});
  return true;
}

export function registerAuthSession(app){
  app.post("/api/auth/login",async(req,res)=>{
    await ensureRedis();
    const identifier=String(req.body?.identifier||"").trim().toLowerCase(),password=String(req.body?.password||"");
    if(!identifier||password.length<8||password.length>128)return res.status(400).json({ok:false,error:"INVALID_LOGIN"});
    const u=(await pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,password_hash,account_status,ban_reason,role,two_factor_enabled,onboarding_completed,created_at FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) LIMIT 1`,[identifier])).rows[0];
    if(!u||!await verifyPassword(password,u.password_hash)){await recordSecurity(u?.id||null,"failed_login",req,{identifier:identifier.slice(0,60)});return res.status(401).json({ok:false,error:"INVALID_LOGIN"})}
    if(!isAdmin(u)&&!["active","deactivated"].includes(u.account_status))return res.status(403).json({ok:false,error:u.account_status==="banned"?"ACCOUNT_BANNED":"ACCOUNT_FROZEN",reason:u.ban_reason||""});
    if(u.two_factor_enabled){
      const challengeId=crypto.randomBytes(24).toString("hex"),code=String(crypto.randomInt(100000,1000000)),remaining=await recoveryRemaining(u.id);
      await redis.set(`2fa:login:${challengeId}`,JSON.stringify({userId:u.id,hash:hashCode(u.id,code),attempts:0,reactivate:u.account_status==="deactivated"}),{EX:600});
      let emailDelivery=true;
      try{await sendCode(u,code,"login")}catch(e){emailDelivery=false;if(!remaining){await redis.del(`2fa:login:${challengeId}`);return res.status(502).json({ok:false,error:e.message})}}
      await recordSecurity(u.id,"login_2fa_challenge",req,{emailDelivery,recoveryAvailable:remaining>0});
      return res.status(202).json({ok:true,twoFactorRequired:true,challengeId,expiresIn:600,recoveryAvailable:remaining>0,emailDelivery});
    }
    if(u.account_status==="deactivated"){await pool.query("UPDATE users SET account_status='active',deactivated_at=NULL,updated_at=NOW() WHERE id=$1",[u.id]);u.account_status="active";await recordSecurity(u.id,"account_reactivated",req,{factor:"password"})}
    const token=await createSession(u.id);setSessionCookie(res,token);delete u.password_hash;await recordSecurity(u.id,"login",req);loginAlert(u,req);
    res.json(sessionPayload(req,token,{ok:true,expiresIn:SESSION_TTL,user:u,isAdmin:isAdmin(u)}));
  });

  app.post("/api/auth/verify-2fa",async(req,res)=>{
    await ensureRedis();
    const challengeId=String(req.body?.challengeId||""),code=String(req.body?.code||""),recoveryCode=String(req.body?.recoveryCode||"");
    if(!/^[a-f0-9]{48}$/i.test(challengeId)||(!/^\d{6}$/.test(code)&&!/^[A-Fa-f0-9-]{12,16}$/.test(recoveryCode)))return res.status(400).json({ok:false,error:"INVALID_2FA"});
    const key=`2fa:login:${challengeId}`,raw=await redis.get(key);
    if(!raw)return res.status(400).json({ok:false,error:"2FA_EXPIRED"});
    const p=JSON.parse(raw);
    if(Number(p.attempts||0)>=TWO_FACTOR_MAX_ATTEMPTS){await redis.del(key);return res.status(429).json({ok:false,error:"2FA_TOO_MANY_ATTEMPTS"})}
    const u=(await pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,account_status,ban_reason,role,two_factor_enabled,onboarding_completed,created_at FROM users WHERE id=$1`,[p.userId])).rows[0];
    if(!u){await redis.del(key);return res.status(404).json({ok:false,error:"USER_NOT_FOUND"})}
    if(!isAdmin(u)&&!["active","deactivated"].includes(u.account_status)){await redis.del(key);return res.status(403).json({ok:false,error:u.account_status==="banned"?"ACCOUNT_BANNED":"ACCOUNT_FROZEN",reason:u.ban_reason||""})}
    let recoveryUsed=false,valid=false;
    if(recoveryCode){recoveryUsed=valid=await consumeRecoveryCode(u.id,recoveryCode)}
    else valid=hashCode(p.userId,code)===p.hash;
    if(!valid){const retry=await failedAttempt(key,p);return res.status(retry?400:429).json({ok:false,error:retry?"2FA_INVALID":"2FA_TOO_MANY_ATTEMPTS",attemptsLeft:retry?TWO_FACTOR_MAX_ATTEMPTS-p.attempts:0})}
    await redis.del(key);
    if(p.reactivate&&u.account_status==="deactivated"){await pool.query("UPDATE users SET account_status='active',deactivated_at=NULL,updated_at=NOW() WHERE id=$1",[u.id]);u.account_status="active";await recordSecurity(u.id,"account_reactivated",req,{factor:"password+2fa"})}
    const token=await createSession(u.id);setSessionCookie(res,token);
    await recordSecurity(u.id,recoveryUsed?"login_2fa_recovery_used":"login_2fa_verified",req);
    loginAlert(u,req);
    res.json(sessionPayload(req,token,{ok:true,expiresIn:SESSION_TTL,user:u,isAdmin:isAdmin(u),recoveryUsed}));
  });

  app.get("/api/auth/me",async(req,res)=>{const u=await requireAuth(req,res);if(u)res.json({ok:true,user:u,isAdmin:isAdmin(u)})});
  app.post("/api/auth/logout",async(req,res)=>{const t=tokenFrom(req);await destroySession(t);clearSessionCookie(res);res.json({ok:true})});

  app.get("/api/account/security",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    const [events,state]=await Promise.all([
      pool.query(`SELECT kind,ip_address,user_agent,created_at FROM account_security_events WHERE user_id=$1 ORDER BY id DESC LIMIT 10`,[u.id]),
      pool.query(`SELECT pending_delete_at FROM users WHERE id=$1`,[u.id])
    ]);
    res.json({ok:true,twoFactorEnabled:Boolean(u.two_factor_enabled),recoveryCodesRemaining:await recoveryRemaining(u.id),pendingDeleteAt:state.rows[0]?.pending_delete_at||null,events:events.rows});
  });

  app.post("/api/account/step-up/request",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    await ensureRedis();
    const password=String(req.body?.currentPassword||""),stored=(await pool.query(`SELECT password_hash,email,two_factor_enabled FROM users WHERE id=$1`,[u.id])).rows[0];
    if(!await verifyPassword(password,stored?.password_hash)){await recordSecurity(u.id,"step_up_password_failed",req);return res.status(403).json({ok:false,error:"WRONG_PASSWORD"})}
    if(isAdmin(u)&&!stored.two_factor_enabled)return res.status(403).json({ok:false,error:"ADMIN_2FA_REQUIRED"});
    if(!stored.two_factor_enabled){const stepUpToken=await issueStepUpGrant(u.id,{sessionToken:tokenFrom(req)});await recordSecurity(u.id,"step_up_verified",req,{factor:"password"});return res.json({ok:true,stepUpToken,expiresIn:STEP_UP_TTL,twoFactorRequired:false})}
    const challengeId=crypto.randomBytes(24).toString("hex"),code=String(crypto.randomInt(100000,1000000)),key=`stepup:challenge:${u.id}:${challengeId}`;
    await redis.set(key,JSON.stringify({hash:hashCode(u.id,code),attempts:0}),{EX:STEP_UP_TTL});
    try{await sendCode({...u,email:stored.email},code,"stepup")}catch(e){await redis.del(key);return res.status(502).json({ok:false,error:e.message})}
    await recordSecurity(u.id,"step_up_challenge",req);
    res.json({ok:true,twoFactorRequired:true,challengeId,expiresIn:STEP_UP_TTL});
  });

  app.post("/api/account/step-up/confirm",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    await ensureRedis();
    const challengeId=String(req.body?.challengeId||""),code=String(req.body?.code||"");
    if(!/^[a-f0-9]{48}$/i.test(challengeId)||!/^\d{6}$/.test(code))return res.status(400).json({ok:false,error:"INVALID_STEP_UP"});
    const key=`stepup:challenge:${u.id}:${challengeId}`,raw=await redis.get(key);
    if(!raw)return res.status(400).json({ok:false,error:"STEP_UP_EXPIRED"});
    const p=JSON.parse(raw);
    if(Number(p.attempts||0)>=TWO_FACTOR_MAX_ATTEMPTS){await redis.del(key);return res.status(429).json({ok:false,error:"STEP_UP_TOO_MANY_ATTEMPTS"})}
    if(hashCode(u.id,code)!==p.hash){const retry=await failedAttempt(key,p);return res.status(retry?400:429).json({ok:false,error:retry?"STEP_UP_INVALID":"STEP_UP_TOO_MANY_ATTEMPTS",attemptsLeft:retry?TWO_FACTOR_MAX_ATTEMPTS-p.attempts:0})}
    await redis.del(key);
    const stepUpToken=await issueStepUpGrant(u.id,{sessionToken:tokenFrom(req),admin:isAdmin(u)});
    await recordSecurity(u.id,"step_up_verified",req,{factor:"password+2fa",admin:isAdmin(u)});
    res.json({ok:true,stepUpToken,expiresIn:STEP_UP_TTL});
  });

  app.post("/api/account/2fa/request",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    const password=String(req.body?.currentPassword||""),enable=Boolean(req.body?.enable),stored=(await pool.query(`SELECT password_hash,email FROM users WHERE id=$1`,[u.id])).rows[0];
    if(!await verifyPassword(password,stored.password_hash))return res.status(403).json({ok:false,error:"WRONG_PASSWORD"});
    const code=String(crypto.randomInt(100000,1000000));
    await redis.set(`2fa:setup:${u.id}`,JSON.stringify({hash:hashCode(u.id,code),enable,attempts:0}),{EX:600});
    try{await sendCode({...u,email:stored.email},code,"setup")}catch(e){await redis.del(`2fa:setup:${u.id}`);return res.status(502).json({ok:false,error:e.message})}
    res.json({ok:true,expiresIn:600,enable});
  });

  app.post("/api/account/2fa/confirm",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    const code=String(req.body?.code||""),key=`2fa:setup:${u.id}`,raw=await redis.get(key);
    if(!raw||!/^\d{6}$/.test(code))return res.status(400).json({ok:false,error:"2FA_EXPIRED"});
    const p=JSON.parse(raw);
    if(Number(p.attempts||0)>=TWO_FACTOR_MAX_ATTEMPTS){await redis.del(key);return res.status(429).json({ok:false,error:"2FA_TOO_MANY_ATTEMPTS"})}
    if(hashCode(u.id,code)!==p.hash){const retry=await failedAttempt(key,p);return res.status(retry?400:429).json({ok:false,error:retry?"2FA_INVALID":"2FA_TOO_MANY_ATTEMPTS",attemptsLeft:retry?TWO_FACTOR_MAX_ATTEMPTS-p.attempts:0})}
    const enable=Boolean(p.enable),recoveryCodes=enable?await issueRecoveryCodes(u.id):[];
    if(!enable)await pool.query(`DELETE FROM two_factor_recovery_codes WHERE user_id=$1`,[u.id]);
    await pool.query(`UPDATE users SET two_factor_enabled=$1 WHERE id=$2`,[enable,u.id]);
    await redis.del(key);
    await recordSecurity(u.id,enable?"2fa_enabled":"2fa_disabled",req,{recoveryCodesIssued:recoveryCodes.length});
    res.json({ok:true,twoFactorEnabled:enable,recoveryCodes});
  });

  app.post("/api/users/:id/mute",async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;const target=Number(req.params.id);if(!Number.isInteger(target)||target===Number(u.id))return res.status(400).json({ok:false,error:"INVALID_USER"});await pool.query(`INSERT INTO user_mutes(muter_id,muted_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[u.id,target]);res.json({ok:true})});
  app.delete("/api/users/:id/mute",async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;await pool.query(`DELETE FROM user_mutes WHERE muter_id=$1 AND muted_id=$2`,[u.id,Number(req.params.id)]);res.json({ok:true})});
  app.post("/api/reports",async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;const type=clean(req.body?.targetType,30),target=Number(req.body?.targetId),reason=clean(req.body?.reason,100),details=clean(req.body?.details,1000);if(!["user","message","room","direct_message","post","comment"].includes(type)||!Number.isInteger(target)||!reason)return res.status(400).json({ok:false,error:"INVALID_REPORT"});const row=(await pool.query(`INSERT INTO reports(reporter_id,target_type,target_id,reason,details) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,[u.id,type,target,reason,details])).rows[0];res.status(201).json({ok:true,report:row})});
}
