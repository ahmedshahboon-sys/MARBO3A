import crypto from "crypto";
import {pool,redis,ensureRedis,requireAuth,tokenFrom,tokenHash,clean,ipOf,isAdmin,destroySession,clearSessionCookie} from "../runtime.mjs";

const EMAIL_CHANGE_TTL=600,EMAIL_CHANGE_MAX_ATTEMPTS=5;
async function sendMail(email,subject,html){if(!process.env.BREVO_API_KEY)throw new Error("EMAIL_NOT_CONFIGURED");const r=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{accept:"application/json","content-type":"application/json","api-key":process.env.BREVO_API_KEY},body:JSON.stringify({sender:{name:"مربوعة",email:"no-reply@marbo3a.ly"},to:[{email}],subject,htmlContent:html})});if(!r.ok)throw new Error("EMAIL_SEND_FAILED")}
async function recordSecurity(userId,kind,req,details={}){await pool.query(`INSERT INTO account_security_events(user_id,kind,ip_address,user_agent,details) VALUES($1,$2,$3,$4,$5::jsonb)`,[userId,kind,ipOf(req),clean(req.headers["user-agent"],300),JSON.stringify(details)]).catch(()=>{})}
async function requireStepUp(req,res,u){
  await ensureRedis();
  const grant=String(req.body?.stepUpToken||"");
  if(!/^[a-f0-9]{64}$/i.test(grant))return res.status(403).json({ok:false,error:"STEP_UP_REQUIRED"}),false;
  const ok=await redis.get(`stepup:grant:${u.id}:${grant}`);
  if(!ok)return res.status(403).json({ok:false,error:"STEP_UP_REQUIRED"}),false;
  return true;
}
async function revokeOtherSessions(userId,currentToken){
  const keepHash=tokenHash(currentToken);
  await pool.query(`DELETE FROM durable_sessions WHERE user_id=$1 AND token_hash<>$2`,[userId,keepHash]);
  await pool.query(`DELETE FROM user_sessions WHERE user_id=$1 AND session_hash<>$2`,[userId,keepHash]).catch(()=>{});
  for await(const raw of redis.scanIterator({MATCH:"session:*",COUNT:200})){
    const key=String(raw),token=key.slice(8);
    if(token===currentToken)continue;
    if(String(await redis.get(key))===String(userId))await redis.del(key);
  }
}
function emailHash(userId,email,code){return crypto.createHash("sha256").update(`${userId}:${email}:${code}`).digest("hex")}

export function registerAccountSecurity(app){
  app.post("/api/account/request-email-change",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    if(!await requireStepUp(req,res,u))return;
    const email=String(req.body?.email||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return res.status(400).json({ok:false,error:"INVALID_EMAIL"});
    if(email===String(u.email||"").toLowerCase())return res.status(409).json({ok:false,error:"EMAIL_UNCHANGED"});
    if((await pool.query(`SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) AND id<>$2`,[email,u.id])).rows[0])return res.status(409).json({ok:false,error:"EMAIL_IN_USE"});
    const code=String(crypto.randomInt(100000,1000000)),key=`emailchange:${u.id}`,payload={email,oldEmail:u.email,hash:emailHash(u.id,email,code),attempts:0};
    await redis.set(key,JSON.stringify(payload),{EX:EMAIL_CHANGE_TTL});
    try{await sendMail(email,"تأكيد البريد الجديد في مربوعة",`<div dir="rtl" style="font-family:Arial;padding:28px"><h2 style="color:#ff7a00">مربوعة</h2><p>رمز تأكيد البريد الجديد:</p><div style="font-size:34px;font-weight:900;letter-spacing:7px">${code}</div><p>صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.</p></div>`)}catch(e){await redis.del(key);return res.status(502).json({ok:false,error:e.message})}
    await recordSecurity(u.id,"email_change_requested",req,{newEmail:email});
    res.json({ok:true,expiresIn:EMAIL_CHANGE_TTL});
  });

  app.post("/api/account/confirm-email-change",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    if(!await requireStepUp(req,res,u))return;
    const code=String(req.body?.code||""),key=`emailchange:${u.id}`,raw=await redis.get(key);
    if(!/^\d{6}$/.test(code))return res.status(400).json({ok:false,error:"INVALID_CODE"});
    if(!raw)return res.status(400).json({ok:false,error:"CODE_EXPIRED"});
    const data=JSON.parse(raw),attempts=Number(data.attempts||0);
    if(attempts>=EMAIL_CHANGE_MAX_ATTEMPTS){await redis.del(key);return res.status(429).json({ok:false,error:"EMAIL_CHANGE_TOO_MANY_ATTEMPTS"})}
    if(emailHash(u.id,data.email,code)!==data.hash){
      data.attempts=attempts+1;
      if(data.attempts>=EMAIL_CHANGE_MAX_ATTEMPTS){await redis.del(key);return res.status(429).json({ok:false,error:"EMAIL_CHANGE_TOO_MANY_ATTEMPTS"})}
      await redis.set(key,JSON.stringify(data),{EX:Math.max(1,await redis.ttl(key))});
      return res.status(400).json({ok:false,error:"INVALID_CODE",attemptsLeft:EMAIL_CHANGE_MAX_ATTEMPTS-data.attempts});
    }
    const client=await pool.connect();let oldEmail="";
    try{
      await client.query("BEGIN");
      const current=(await client.query(`SELECT email FROM users WHERE id=$1 FOR UPDATE`,[u.id])).rows[0];
      if(!current){await client.query("ROLLBACK");return res.status(404).json({ok:false,error:"USER_NOT_FOUND"})}
      oldEmail=current.email;
      const taken=(await client.query(`SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) AND id<>$2`,[data.email,u.id])).rows[0];
      if(taken){await client.query("ROLLBACK");return res.status(409).json({ok:false,error:"EMAIL_IN_USE"})}
      await client.query(`UPDATE users SET email=$1,updated_at=NOW() WHERE id=$2`,[data.email,u.id]);
      await client.query("COMMIT");
    }catch(e){await client.query("ROLLBACK").catch(()=>{});if(e?.code==="23505")return res.status(409).json({ok:false,error:"EMAIL_IN_USE"});throw e}finally{client.release()}
    await redis.del(key);
    await revokeOtherSessions(u.id,tokenFrom(req));
    await recordSecurity(u.id,"email_changed",req,{oldEmail,newEmail:data.email,otherSessionsRevoked:true});
    await Promise.allSettled([
      sendMail(oldEmail,"تم تغيير بريد حسابك في مربوعة",`<div dir="rtl"><h2>مربوعة</h2><p>تم تغيير البريد المرتبط بحسابك إلى ${data.email}.</p><p>إذا لم تكن أنت، غيّر كلمة المرور فورًا.</p></div>`),
      sendMail(data.email,"تم تأكيد بريدك الجديد في مربوعة",`<div dir="rtl"><h2>مربوعة</h2><p>تم اعتماد هذا البريد لحسابك بنجاح.</p></div>`)
    ]);
    res.json({ok:true,email:data.email,otherSessionsRevoked:true});
  });

  app.post("/api/account/deactivate",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    if(isAdmin(u))return res.status(409).json({ok:false,error:"ADMIN_CANNOT_DEACTIVATE"});
    if(!await requireStepUp(req,res,u))return;
    const current=tokenFrom(req);
    await pool.query(`UPDATE users SET account_status='deactivated',deactivated_at=NOW(),updated_at=NOW() WHERE id=$1`,[u.id]);
    await revokeOtherSessions(u.id,current);
    await recordSecurity(u.id,"account_deactivated",req);
    await destroySession(current);clearSessionCookie(res);
    res.json({ok:true,deactivated:true,reactivation:"login"});
  });

  app.post("/api/account/delete",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    if(isAdmin(u))return res.status(409).json({ok:false,error:"ADMIN_CANNOT_DELETE"});
    if(!await requireStepUp(req,res,u))return;
    const row=(await pool.query(`UPDATE users SET pending_delete_at=NOW()+INTERVAL '7 days' WHERE id=$1 RETURNING pending_delete_at`,[u.id])).rows[0];
    await recordSecurity(u.id,"account_delete_scheduled",req,{deleteAt:row?.pending_delete_at||null});
    res.json({ok:true,deleteAt:row?.pending_delete_at||null});
  });

  app.post("/api/account/cancel-delete",async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    const row=(await pool.query(`UPDATE users SET pending_delete_at=NULL WHERE id=$1 RETURNING id`,[u.id])).rows[0];
    if(!row)return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});
    await recordSecurity(u.id,"account_delete_cancelled",req);
    res.json({ok:true,pendingDeleteAt:null});
  });
}
