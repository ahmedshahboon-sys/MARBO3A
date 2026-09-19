import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const KEY=Symbol.for("marbo3a.runtime.v3");
const SESSION_TTL=7*24*60*60;
const state=globalThis[KEY]||(globalThis[KEY]={
  pool:new pg.Pool({
    connectionString:process.env.DATABASE_URL,
    max:Math.max(4,Number(process.env.PG_POOL_MAX)||20),
    idleTimeoutMillis:30000,
    connectionTimeoutMillis:5000
  }),
  redis:createClient({url:process.env.REDIS_URL}),
  redisReady:null,
  io:null
});
if(!state.redis.__marbo3aErrorHook){
  state.redis.on("error",e=>console.error("Runtime Redis:",e));
  state.redis.__marbo3aErrorHook=true;
}

export const pool=state.pool;
export const redis=state.redis;

export async function ensureRedis(){
  if(redis.isOpen)return redis;
  if(!state.redisReady)state.redisReady=redis.connect().catch(e=>{state.redisReady=null;throw e});
  await state.redisReady;
  return redis;
}

export function cookieToken(req){
  const raw=String(req?.headers?.cookie||"");
  const item=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("marbo3a_session="));
  if(!item)return"";
  try{
    const value=decodeURIComponent(item.slice("marbo3a_session=".length));
    return /^[a-f0-9]{64}$/i.test(value)?value:"";
  }catch{return""}
}

export function bearerToken(req){
  return String(req?.headers?.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
}

export const tokenFrom=req=>bearerToken(req)||cookieToken(req);
export const tokenHash=t=>crypto.createHash("sha256").update(String(t||"")).digest("hex");
export const isAdmin=u=>String(u?.role||"").toLowerCase()==="admin";

export function setSessionCookie(res,token,ttl=SESSION_TTL){
  if(!/^[a-f0-9]{64}$/i.test(String(token||"")))return;
  res.setHeader("Set-Cookie",`marbo3a_session=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(60,Number(ttl)||SESSION_TTL)}; HttpOnly; Secure; SameSite=Lax`);
}

export function clearSessionCookie(res){
  res.setHeader("Set-Cookie","marbo3a_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
}

async function restoreDurableSession(token){
  try{
    const row=(await pool.query(`SELECT user_id,expires_at FROM durable_sessions WHERE token_hash=$1 AND expires_at>NOW() LIMIT 1`,[tokenHash(token)])).rows[0];
    if(!row?.user_id)return null;
    const ttl=Math.max(1,Math.min(SESSION_TTL,Math.floor((new Date(row.expires_at).getTime()-Date.now())/1000)));
    await redis.set(`session:${token}`,String(row.user_id),{EX:ttl});
    return String(row.user_id);
  }catch(e){
    if(process.env.NODE_ENV!=="test")console.error("durable session restore",e?.message||e);
    return null;
  }
}

export async function sessionUser(req){
  await ensureRedis();
  const token=tokenFrom(req);
  if(!token)return null;
  const hash=tokenHash(token);
  let id=await redis.get(`session:${token}`);
  if(id){
    const durable=(await pool.query(`SELECT user_id FROM durable_sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>NOW() LIMIT 1`,[hash,id]).catch(()=>({rows:[]}))).rows[0];
    if(!durable){await redis.del(`session:${token}`).catch(()=>{});return null}
  }else id=await restoreDurableSession(token);
  if(!id)return null;
  const user=(await pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,account_status,ban_reason,role,two_factor_enabled,onboarding_completed,created_at FROM users WHERE id=$1`,[id])).rows[0]||null;
  if(!user){await redis.del(`session:${token}`).catch(()=>{});await pool.query(`DELETE FROM durable_sessions WHERE token_hash=$1`,[hash]).catch(()=>{});return null}
  await pool.query(`UPDATE durable_sessions SET last_seen=NOW() WHERE token_hash=$1`,[hash]).catch(()=>{});
  return user;
}

export async function requireAuth(req,res){
  const u=await sessionUser(req);
  if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null}
  if(!isAdmin(u)&&u.account_status!=="active"){
    res.status(403).json({ok:false,error:u.account_status==="banned"?"ACCOUNT_BANNED":"ACCOUNT_RESTRICTED",reason:u.ban_reason||""});
    return null;
  }
  return u;
}

export async function requireAdmin(req,res){
  const u=await requireAuth(req,res);
  if(!u)return null;
  if(!isAdmin(u)){res.status(403).json({ok:false,error:"ADMIN_ONLY"});return null}
  return u;
}

export async function createSession(userId,ttl=SESSION_TTL){
  await ensureRedis();
  const token=crypto.randomBytes(32).toString("hex");
  const safeTtl=Math.max(60,Number(ttl)||SESSION_TTL),hash=tokenHash(token);
  await redis.set(`session:${token}`,String(userId),{EX:safeTtl});
  try{
    await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+($3::text||' seconds')::interval,NOW()) ON CONFLICT(token_hash) DO UPDATE SET user_id=EXCLUDED.user_id,expires_at=EXCLUDED.expires_at,last_seen=NOW()`,[hash,userId,String(safeTtl)]);
  }catch(e){
    await redis.del(`session:${token}`).catch(()=>{});
    throw e;
  }
  return token;
}

export async function destroySession(token){
  if(!token)return;
  await ensureRedis();
  const hash=tokenHash(token);
  await pool.query(`DELETE FROM durable_sessions WHERE token_hash=$1`,[hash]);
  await redis.del(`session:${token}`).catch(()=>{});
}

export async function actionRateLimit(scope,identity,{limit,windowSeconds}){
  await ensureRedis();
  const safeScope=String(scope||"action").replace(/[^a-z0-9:_-]/gi,"_").slice(0,80),safeIdentity=String(identity||"anon").replace(/[^a-z0-9:._-]/gi,"_").slice(0,120);
  const window=Math.max(1,Math.min(3600,Number(windowSeconds)||60)),max=Math.max(1,Math.min(10000,Number(limit)||30));
  const bucket=Math.floor(Date.now()/1000/window),key=`actionlimit:${safeScope}:${safeIdentity}:${bucket}`;
  const count=Number(await redis.incr(key));if(count===1)await redis.expire(key,window*2);
  const retryAfter=Math.max(1,window-Math.floor(Date.now()/1000)%window);
  return{allowed:count<=max,count,limit:max,retryAfter,windowSeconds:window};
}
export function rejectRateLimit(res,result,code="RATE_LIMITED"){
  res.setHeader("Retry-After",String(result?.retryAfter||1));
  return res.status(429).json({ok:false,error:code,retryAfter:result?.retryAfter||1,limit:result?.limit||null});
}

export const clean=(v="",n=300)=>String(v??"").trim().replace(/\s+/g," ").slice(0,n);
export const ipOf=req=>String(req?.headers?.["x-forwarded-for"]||req?.socket?.remoteAddress||"").split(",")[0].trim().slice(0,80);

export function setRealtimeServer(io){state.io=io||null}
export function realtimeServer(){return state.io}
export function emitUser(userId,event,payload){try{state.io?.to(`user:${userId}`).emit(event,payload);return Boolean(state.io)}catch{return false}}
export function emitRoom(roomId,event,payload){try{state.io?.to(`room:${roomId}`).emit(event,payload);return Boolean(state.io)}catch{return false}}
export function emitChat(chatId,event,payload){try{state.io?.to(`chat:${chatId}`).emit(event,payload);return Boolean(state.io)}catch{return false}}

export function turnConfig(userId){
  const host=String(process.env.TURN_HOST||process.env.TURN_EXTERNAL_IP||"").trim(),secret=String(process.env.TURN_SECRET||"").trim(),tlsHost=String(process.env.TURN_TLS_HOST||"").trim(),tlsPort=Math.max(1,Number(process.env.TURN_TLS_PORT)||443),iceServers=[];
  if(host){
    iceServers.push({urls:[`stun:${host}:3478`]});
    if(secret){
      const expiry=Math.floor(Date.now()/1000)+3600,username=`${expiry}:${userId}`,credential=crypto.createHmac("sha1",secret).update(username).digest("base64"),urls=[`turn:${host}:3478?transport=udp`,`turn:${host}:3478?transport=tcp`];
      if(tlsHost)urls.push(`turns:${tlsHost}:${tlsPort}?transport=tcp`);
      iceServers.push({urls,username,credential});
    }
  }else iceServers.push({urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]});
  return{iceServers,turnConfigured:Boolean(host&&secret),tlsConfigured:Boolean(tlsHost&&secret),forceRelay:String(process.env.TURN_FORCE_RELAY||"").toLowerCase()==="true",credentialTtlSeconds:3600};
}
