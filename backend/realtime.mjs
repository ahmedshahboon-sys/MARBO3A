import {Server} from "socket.io";
import {pool,ensureRedis,sessionUser,isAdmin,setRealtimeServer,redis} from "./runtime.mjs";

const allowedOrigin=o=>!o||o==="https://marbo3a.ly"||o==="https://www.marbo3a.ly"||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o);
const connections=new Map();
const REALTIME_LIMITS={presence:{limit:18,window:10},roomJoin:{limit:20,window:10},chatJoin:{limit:20,window:10},typing:{limit:30,window:10}};

function socketCookieToken(socket){
  const item=String(socket.request?.headers?.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("marbo3a_session="));
  if(!item)return"";
  try{const value=decodeURIComponent(item.slice("marbo3a_session=".length));return /^[a-f0-9]{64}$/i.test(value)?value:""}catch{return""}
}
function tokenFromSocket(socket){
  const cookie=socketCookieToken(socket);
  if(cookie)return cookie;
  const direct=String(socket.handshake.auth?.token||"");
  return /^[a-f0-9]{64}$/i.test(direct)?direct:"";
}
async function realtimeLimited(userId,action){
  const policy=REALTIME_LIMITS[action];if(!policy)return false;
  await ensureRedis();
  const bucket=Math.floor(Date.now()/1000/policy.window),key=`rtlimit:${action}:${userId}:${bucket}`;
  const count=Number(await redis.incr(key));
  if(count===1)await redis.expire(key,policy.window*2);
  return count>policy.limit;
}
function reply(ack,payload){if(typeof ack==="function")try{ack(payload)}catch{}}
async function roomAccess(roomId,user){
  if(!Number.isInteger(roomId)||roomId<1)return false;
  if(isAdmin(user))return true;
  return Boolean((await pool.query(`SELECT 1 FROM room_members m WHERE m.room_id=$1 AND m.user_id=$2 AND NOT EXISTS(SELECT 1 FROM room_bans b WHERE b.room_id=m.room_id AND b.user_id=m.user_id) LIMIT 1`,[roomId,user.id])).rows[0]);
}
async function chatAccess(chatId,userId){
  if(!Number.isInteger(chatId)||chatId<1)return false;
  const row=(await pool.query(`SELECT user1_id,user2_id FROM direct_conversations WHERE id=$1 AND(user1_id=$2 OR user2_id=$2) LIMIT 1`,[chatId,userId])).rows[0];
  if(!row)return false;
  const peer=String(row.user1_id)===String(userId)?row.user2_id:row.user1_id;
  return !(await pool.query(`SELECT 1 FROM user_blocks WHERE(blocker_id=$1 AND blocked_id=$2)OR(blocker_id=$2 AND blocked_id=$1) LIMIT 1`,[userId,peer])).rows[0];
}

async function touchPresence(userId){
  await ensureRedis();
  await redis.zAdd("presence:users",[{score:Date.now(),value:String(userId)}]);
}

async function presencePrivacy(userId){
  const row=(await pool.query(`SELECT COALESCE(p.show_online,TRUE) show_online,COALESCE(p.show_last_seen,TRUE) show_last_seen FROM users u LEFT JOIN profile_privacy p ON p.user_id=u.id WHERE u.id=$1`,[userId]).catch(()=>({rows:[]}))).rows?.[0];
  return{showOnline:row?.show_online!==false,showLastSeen:row?.show_last_seen!==false};
}

async function publishConnectedPrivacy(io,userId){
  const uid=String(userId),p=await presencePrivacy(uid);
  io.to(`presence:${uid}`).emit("presence:update",{userId:Number(uid),online:Boolean(p.showOnline),lastSeenAt:null});
}

async function markOnline(io,userId){
  const uid=String(userId),count=(connections.get(uid)||0)+1;
  connections.set(uid,count);
  await touchPresence(uid).catch(()=>{});
  if(count===1){
    await pool.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`,[uid]).catch(()=>{});
    await publishConnectedPrivacy(io,uid);
  }
}

async function markOffline(io,userId){
  const uid=String(userId),next=Math.max(0,(connections.get(uid)||1)-1);
  if(next>0){connections.set(uid,next);return}
  connections.delete(uid);
  await ensureRedis().catch(()=>{});
  await redis.zRem("presence:users",uid).catch(()=>{});
  const row=(await pool.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1 RETURNING last_seen_at`,[uid]).catch(()=>({rows:[]}))).rows?.[0];
  const p=await presencePrivacy(uid);
  io.to(`presence:${uid}`).emit("presence:update",{userId:Number(uid),online:false,lastSeenAt:p.showLastSeen?(row?.last_seen_at||new Date().toISOString()):null});
}

async function snapshot(ids,viewerId){
  if(!ids.length)return[];
  const rows=(await pool.query(`SELECT u.id,u.last_seen_at,COALESCE(p.show_online,TRUE) show_online,COALESCE(p.show_last_seen,TRUE) show_last_seen FROM users u LEFT JOIN profile_privacy p ON p.user_id=u.id WHERE u.id=ANY($1::bigint[]) AND (u.id=$2 OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$2)))`,[ids,viewerId])).rows;
  await ensureRedis().catch(()=>{});
  const cutoff=Date.now()-90000;
  let scores=[];
  try{scores=await redis.zRangeWithScores("presence:users",0,-1)}catch{}
  const online=new Set(scores.filter(x=>Number(x.score)>cutoff).map(x=>String(x.value)));
  return rows.map(row=>{const actualOnline=online.has(String(row.id));return{userId:Number(row.id),online:Boolean(row.show_online)&&actualOnline,lastSeenAt:Boolean(row.show_last_seen)&&!actualOnline?row.last_seen_at:null,visible:Boolean(row.show_online)||Boolean(row.show_last_seen)}});
}

export function attachRealtime(server){
  const io=new Server(server,{path:"/rt-v2/socket.io",cors:{origin:(origin,cb)=>allowedOrigin(origin)?cb(null,true):cb(new Error("ORIGIN_NOT_ALLOWED")),credentials:true},transports:["websocket","polling"],maxHttpBufferSize:64*1024});
  setRealtimeServer(io);
  io.use(async(socket,next)=>{try{
    await ensureRedis();
    const token=tokenFromSocket(socket);
    const u=await sessionUser({headers:{authorization:token?`Bearer ${token}`:""}});
    if(!u||(!isAdmin(u)&&u.account_status!=="active"))return next(new Error("UNAUTHORIZED"));
    socket.user=u;next();
  }catch(e){next(e)}});
  io.on("connection",socket=>{
    const uid=String(socket.user.id);
    socket.join(`user:${uid}`);
    socket.data.presenceRooms=new Set();
    markOnline(io,uid).catch(()=>{});
    const heartbeat=setInterval(()=>{touchPresence(uid).then(()=>publishConnectedPrivacy(io,uid)).catch(()=>{})},30000);
    socket.emit("welcome:v2",{realtime:true,userId:Number(uid)});

    socket.on("presence:watch",async(data,ack)=>{try{
      if(await realtimeLimited(uid,"presence"))return reply(ack,{ok:false,error:"REALTIME_RATE_LIMITED",retryAfter:10});
      const ids=[...new Set((Array.isArray(data?.userIds)?data.userIds:[]).map(Number).filter(Number.isInteger).filter(x=>x>0).slice(0,100))];
      const current=await snapshot(ids,uid);
      const allowed=new Set(current.filter(x=>x.visible||String(x.userId)===uid).map(x=>String(x.userId)));
      for(const old of socket.data.presenceRooms||[])if(!allowed.has(old)){socket.leave(`presence:${old}`);socket.data.presenceRooms.delete(old)}
      for(const id of allowed)if(!socket.data.presenceRooms.has(id)){socket.join(`presence:${id}`);socket.data.presenceRooms.add(id)}
      socket.emit("presence:snapshot",{users:current.filter(x=>x.visible||String(x.userId)===uid).map(({visible,...x})=>x)});
      reply(ack,{ok:true,count:current.length});
    }catch{reply(ack,{ok:false,error:"REALTIME_FAILED"})}});

    socket.on("room:join",async(roomId,ack)=>{try{roomId=Number(roomId);if(!Number.isInteger(roomId)||roomId<1)return reply(ack,{ok:false,error:"INVALID_SCOPE"});if(await realtimeLimited(uid,"roomJoin"))return reply(ack,{ok:false,error:"REALTIME_RATE_LIMITED",retryAfter:10});if(!await roomAccess(roomId,socket.user))return reply(ack,{ok:false,error:"REALTIME_SCOPE_FORBIDDEN"});socket.join(`room:${roomId}`);reply(ack,{ok:true})}catch{reply(ack,{ok:false,error:"REALTIME_FAILED"})}});
    socket.on("room:leave",roomId=>{roomId=Number(roomId);if(Number.isInteger(roomId)&&roomId>0)socket.leave(`room:${roomId}`)});
    socket.on("chat:join",async(id,ack)=>{try{id=Number(id);if(!Number.isInteger(id)||id<1)return reply(ack,{ok:false,error:"INVALID_SCOPE"});if(await realtimeLimited(uid,"chatJoin"))return reply(ack,{ok:false,error:"REALTIME_RATE_LIMITED",retryAfter:10});if(!await chatAccess(id,uid))return reply(ack,{ok:false,error:"REALTIME_SCOPE_FORBIDDEN"});socket.join(`chat:${id}`);reply(ack,{ok:true})}catch{reply(ack,{ok:false,error:"REALTIME_FAILED"})}});
    socket.on("chat:leave",id=>{id=Number(id);if(Number.isInteger(id)&&id>0)socket.leave(`chat:${id}`)});
    socket.on("typing",async(data,ack)=>{try{
      const kind=String(data?.kind||""),scope=Number(data?.scopeId);
      if(!["room","direct"].includes(kind)||!Number.isInteger(scope)||scope<1)return reply(ack,{ok:false,error:"INVALID_SCOPE"});
      if(await realtimeLimited(uid,"typing"))return reply(ack,{ok:false,error:"REALTIME_RATE_LIMITED",retryAfter:10});
      const allowed=kind==="room"?await roomAccess(scope,socket.user):await chatAccess(scope,uid);
      if(!allowed)return reply(ack,{ok:false,error:"REALTIME_SCOPE_FORBIDDEN"});
      const key=`typing:${kind}:${scope}:${uid}`;
      if(data?.active)await redis.set(key,JSON.stringify({userId:Number(uid),username:socket.user.username,displayName:socket.user.display_name}),{EX:8});else await redis.del(key);
      const event={kind,scopeId:scope,userId:Number(uid),username:socket.user.username,displayName:socket.user.display_name,active:Boolean(data?.active)};
      io.to(`${kind==="room"?"room":"chat"}:${scope}`).emit("typing:update",event);
      reply(ack,{ok:true});
    }catch{reply(ack,{ok:false,error:"REALTIME_FAILED"})}});
    socket.on("disconnect",()=>{clearInterval(heartbeat);markOffline(io,uid).catch(()=>{})});
  });
  console.log("MARBO3A realtime attached · presence events enabled");
  return io;
}
