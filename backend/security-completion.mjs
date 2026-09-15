import http from "http";
import crypto from "crypto";
import {promisify} from "util";
import {pool,redis,ensureRedis,requireAuth,tokenFrom,emitUser} from "./runtime.mjs";

const prior=http.createServer.bind(http),scryptAsync=promisify(crypto.scrypt),RESET_ATTEMPTS=5;
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
async function hashPassword(password){const salt=crypto.randomBytes(16),derived=await scryptAsync(password,salt,64);return`scrypt:${salt.toString("hex")}:${Buffer.from(derived).toString("hex")}`}
async function verifyPassword(password,stored){try{const[algo,saltHex,hashHex]=String(stored||"").split(":");if(algo!=="scrypt")return false;const out=await scryptAsync(password,Buffer.from(saltHex,"hex"),64),a=Buffer.from(hashHex,"hex"),b=Buffer.from(out);return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}}
async function revokeAll(userId,exceptToken=""){
  await ensureRedis();
  if(exceptToken){
    const h=tokenHash(exceptToken);
    await pool.query(`DELETE FROM durable_sessions WHERE user_id=$1 AND token_hash<>$2`,[userId,h]);
    await pool.query(`DELETE FROM user_sessions WHERE user_id=$1 AND session_hash<>$2`,[userId,h]).catch(()=>{});
  }else{
    await pool.query(`DELETE FROM durable_sessions WHERE user_id=$1`,[userId]);
    await pool.query(`DELETE FROM user_sessions WHERE user_id=$1`,[userId]).catch(()=>{});
  }
  for await(const raw of redis.scanIterator({MATCH:"session:*",COUNT:200})){
    const key=String(raw);if(exceptToken&&key===`session:${exceptToken}`)continue;
    if(String(await redis.get(key))===String(userId))await redis.del(key);
  }
}
async function resetAttempt(key){
  const attempts=await redis.incr(key);
  if(attempts===1)await redis.expire(key,600);
  return attempts;
}

http.createServer=function securityCompletionCreateServer(app,...args){if(typeof app==="function"&&app?.use){
  app.post("/api/auth/reset-password",async(req,res)=>{try{await ensureRedis();const email=String(req.body?.email||"").trim().toLowerCase(),code=String(req.body?.code||"").trim(),password=String(req.body?.password||"");if(!/^\d{6}$/.test(code)||password.length<8||password.length>128)return res.status(400).json({ok:false,error:"INVALID_RESET"});const row=(await pool.query(`SELECT id FROM users WHERE LOWER(email)=LOWER($1)`,[email])).rows[0];if(!row)return res.status(400).json({ok:false,error:"INVALID_RESET"});const expected=await redis.get(`pwdreset:${row.id}`);if(!expected)return res.status(400).json({ok:false,error:"INVALID_OR_EXPIRED_CODE"});const attemptsKey=`pwdreset:attempts:${row.id}:${expected.slice(0,16)}`,attempts=Number(await redis.get(attemptsKey)||0);if(attempts>=RESET_ATTEMPTS){await redis.del(`pwdreset:${row.id}`);return res.status(429).json({ok:false,error:"RESET_TOO_MANY_ATTEMPTS"})}const actual=crypto.createHash("sha256").update(`${row.id}:${code}`).digest("hex");if(expected!==actual){const next=await resetAttempt(attemptsKey);if(next>=RESET_ATTEMPTS)await redis.del(`pwdreset:${row.id}`);return res.status(next>=RESET_ATTEMPTS?429:400).json({ok:false,error:next>=RESET_ATTEMPTS?"RESET_TOO_MANY_ATTEMPTS":"INVALID_OR_EXPIRED_CODE"})}await pool.query(`UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2`,[await hashPassword(password),row.id]);await Promise.all([redis.del(`pwdreset:${row.id}`),redis.del(attemptsKey)]);await revokeAll(row.id);emitUser(row.id,"session:revoked",{reason:"password-reset",at:new Date().toISOString()});res.json({ok:true})}catch(e){console.error("secure reset password",e);res.status(500).json({ok:false,error:"PASSWORD_RESET_FAILED"})}});
  app.post("/api/account/change-password",async(req,res)=>{try{const u=await requireAuth(req,res);if(!u)return;const current=String(req.body?.currentPassword||""),next=String(req.body?.newPassword||"");if(next.length<8||next.length>128)return res.status(400).json({ok:false,error:"INVALID_PASSWORD"});const row=(await pool.query(`SELECT password_hash FROM users WHERE id=$1`,[u.id])).rows[0];if(!await verifyPassword(current,row?.password_hash))return res.status(403).json({ok:false,error:"WRONG_PASSWORD"});await pool.query(`UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2`,[await hashPassword(next),u.id]);const keep=tokenFrom(req);await revokeAll(u.id,keep);emitUser(u.id,"security:password-changed",{at:new Date().toISOString()});res.json({ok:true,otherSessionsRevoked:true})}catch(e){console.error("secure change password",e);res.status(500).json({ok:false,error:"PASSWORD_CHANGE_FAILED"})}});
}return prior(app,...args)};
