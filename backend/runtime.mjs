import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const KEY=Symbol.for("marbo3a.runtime.v2");
const state=globalThis[KEY]||(globalThis[KEY]={pool:new pg.Pool({connectionString:process.env.DATABASE_URL,max:Math.max(4,Number(process.env.PG_POOL_MAX)||20),idleTimeoutMillis:30000,connectionTimeoutMillis:5000}),redis:createClient({url:process.env.REDIS_URL}),redisReady:null,io:null});
if(!state.redis.__marbo3aErrorHook){state.redis.on("error",e=>console.error("Runtime Redis:",e));state.redis.__marbo3aErrorHook=true}
export const pool=state.pool;export const redis=state.redis;
export async function ensureRedis(){if(redis.isOpen)return redis;if(!state.redisReady)state.redisReady=redis.connect().catch(e=>{state.redisReady=null;throw e});await state.redisReady;return redis}
export const tokenFrom=req=>String(req?.headers?.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
export const isAdmin=u=>String(u?.role||"").toLowerCase()==="admin";
export async function sessionUser(req){await ensureRedis();const t=tokenFrom(req);if(!t)return null;const id=await redis.get(`session:${t}`);if(!id)return null;return (await pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,account_status,ban_reason,role,two_factor_enabled,onboarding_completed,created_at FROM users WHERE id=$1`,[id])).rows[0]||null}
export async function requireAuth(req,res){const u=await sessionUser(req);if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null}if(!isAdmin(u)&&u.account_status!=="active"){res.status(403).json({ok:false,error:u.account_status==="banned"?"ACCOUNT_BANNED":"ACCOUNT_RESTRICTED",reason:u.ban_reason||""});return null}return u}
export async function requireAdmin(req,res){const u=await requireAuth(req,res);if(!u)return null;if(!isAdmin(u)){res.status(403).json({ok:false,error:"ADMIN_ONLY"});return null}return u}
export async function createSession(userId,ttl=7*24*60*60){await ensureRedis();const token=crypto.randomBytes(32).toString("hex");await redis.set(`session:${token}`,String(userId),{EX:ttl});return token}
export async function destroySession(token){if(!token)return;await ensureRedis();await redis.del(`session:${token}`)}
export const clean=(v="",n=300)=>String(v??"").trim().replace(/\s+/g," ").slice(0,n);
export const ipOf=req=>String(req?.headers?.["x-forwarded-for"]||req?.socket?.remoteAddress||"").split(",")[0].trim().slice(0,80);
export function setRealtimeServer(io){state.io=io||null}
export function realtimeServer(){return state.io}
export function emitUser(userId,event,payload){try{state.io?.to(`user:${userId}`).emit(event,payload);return Boolean(state.io)}catch{return false}}
export function emitRoom(roomId,event,payload){try{state.io?.to(`room:${roomId}`).emit(event,payload);return Boolean(state.io)}catch{return false}}
export function emitChat(chatId,event,payload){try{state.io?.to(`chat:${chatId}`).emit(event,payload);return Boolean(state.io)}catch{return false}}
export function turnConfig(userId){const host=String(process.env.TURN_HOST||process.env.TURN_EXTERNAL_IP||"").trim(),secret=String(process.env.TURN_SECRET||"").trim(),tlsHost=String(process.env.TURN_TLS_HOST||"").trim(),tlsPort=Math.max(1,Number(process.env.TURN_TLS_PORT)||443),iceServers=[];if(host){iceServers.push({urls:[`stun:${host}:3478`]});if(secret){const expiry=Math.floor(Date.now()/1000)+3600,username=`${expiry}:${userId}`,credential=crypto.createHmac("sha1",secret).update(username).digest("base64"),urls=[`turn:${host}:3478?transport=udp`,`turn:${host}:3478?transport=tcp`];if(tlsHost)urls.push(`turns:${tlsHost}:${tlsPort}?transport=tcp`);iceServers.push({urls,username,credential})}}else iceServers.push({urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]});return{iceServers,turnConfigured:Boolean(host&&secret),tlsConfigured:Boolean(tlsHost&&secret),forceRelay:String(process.env.TURN_FORCE_RELAY||"").toLowerCase()==="true",credentialTtlSeconds:3600}}
