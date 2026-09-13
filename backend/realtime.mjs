import {Server} from "socket.io";
import {pool,ensureRedis,sessionUser,isAdmin,setRealtimeServer,redis} from "./runtime.mjs";

const allowedOrigin=o=>!o||o==="https://marbo3a.ly"||o==="https://www.marbo3a.ly"||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o);
const connections=new Map();

function tokenFromSocket(socket){
  const direct=String(socket.handshake.auth?.token||socket.handshake.query?.token||"");
  if(/^[a-f0-9]{64}$/i.test(direct))return direct;
  const cookie=String(socket.request?.headers?.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("marbo3a_session="));
  return cookie?decodeURIComponent(cookie.slice("marbo3a_session=".length)):"";
}

async function touchPresence(userId){
  await ensureRedis();
  await redis.zAdd("presence:users",[{score:Date.now(),value:String(userId)}]);
}

async function markOnline(io,userId){
  const uid=String(userId),count=(connections.get(uid)||0)+1;
  connections.set(uid,count);
  await touchPresence(uid).catch(()=>{});
  if(count===1){
    await pool.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`,[uid]).catch(()=>{});
    io.to(`presence:${uid}`).emit("presence:update",{userId:Number(uid),online:true,lastSeenAt:null});
  }
}

async function markOffline(io,userId){
  const uid=String(userId),next=Math.max(0,(connections.get(uid)||1)-1);
  if(next>0){connections.set(uid,next);return}
  connections.delete(uid);
  await ensureRedis().catch(()=>{});
  await redis.zRem("presence:users",uid).catch(()=>{});
  const row=(await pool.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1 RETURNING last_seen_at`,[uid]).catch(()=>({rows:[]}))).rows?.[0];
  io.to(`presence:${uid}`).emit("presence:update",{userId:Number(uid),online:false,lastSeenAt:row?.last_seen_at||new Date().toISOString()});
}

async function snapshot(ids){
  if(!ids.length)return[];
  const rows=(await pool.query(`SELECT u.id,u.last_seen_at,COALESCE(p.show_last_seen,TRUE) show_last_seen FROM users u LEFT JOIN profile_privacy p ON p.user_id=u.id WHERE u.id=ANY($1::bigint[])`,[ids])).rows;
  await ensureRedis().catch(()=>{});
  const cutoff=Date.now()-90000;
  let scores=[];
  try{scores=await redis.zRangeWithScores("presence:users",0,-1)}catch{}
  const online=new Set(scores.filter(x=>Number(x.score)>cutoff).map(x=>String(x.value)));
  return rows.map(row=>({userId:Number(row.id),online:Boolean(row.show_last_seen)&&online.has(String(row.id)),lastSeenAt:row.show_last_seen?row.last_seen_at:null,visible:Boolean(row.show_last_seen)}));
}

export function attachRealtime(server){
  const io=new Server(server,{path:"/rt-v2/socket.io",cors:{origin:(origin,cb)=>allowedOrigin(origin)?cb(null,true):cb(new Error("ORIGIN_NOT_ALLOWED")),credentials:true},transports:["websocket","polling"]});
  setRealtimeServer(io);
  io.use(async(socket,next)=>{try{
    await ensureRedis();
    const token=tokenFromSocket(socket);
    const u=await sessionUser({headers:{authorization:`Bearer ${token}`}});
    if(!u||(!isAdmin(u)&&u.account_status!=="active"))return next(new Error("UNAUTHORIZED"));
    socket.user=u;next();
  }catch(e){next(e)}});
  io.on("connection",socket=>{
    const uid=String(socket.user.id);
    socket.join(`user:${uid}`);
    socket.data.presenceRooms=new Set();
    markOnline(io,uid).catch(()=>{});
    const heartbeat=setInterval(()=>touchPresence(uid).catch(()=>{}),30000);
    socket.emit("welcome:v2",{realtime:true,userId:Number(uid)});

    socket.on("presence:watch",async data=>{try{
      const ids=[...new Set((Array.isArray(data?.userIds)?data.userIds:[]).map(Number).filter(Number.isInteger).filter(x=>x>0).slice(0,100))];
      const current=await snapshot(ids);
      const allowed=new Set(current.filter(x=>x.visible||String(x.userId)===uid).map(x=>String(x.userId)));
      for(const old of socket.data.presenceRooms||[])if(!allowed.has(old)){socket.leave(`presence:${old}`);socket.data.presenceRooms.delete(old)}
      for(const id of allowed)if(!socket.data.presenceRooms.has(id)){socket.join(`presence:${id}`);socket.data.presenceRooms.add(id)}
      socket.emit("presence:snapshot",{users:current.filter(x=>x.visible||String(x.userId)===uid).map(({visible,...x})=>x)});
    }catch{}});

    socket.on("room:join",async roomId=>{roomId=Number(roomId);if(!Number.isInteger(roomId))return;const ok=isAdmin(socket.user)||(await pool.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,uid])).rows[0];if(ok)socket.join(`room:${roomId}`)});
    socket.on("room:leave",roomId=>socket.leave(`room:${Number(roomId)}`));
    socket.on("chat:join",async id=>{id=Number(id);const ok=(await pool.query(`SELECT 1 FROM direct_conversations WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,[id,uid])).rows[0];if(ok)socket.join(`chat:${id}`)});
    socket.on("chat:leave",id=>socket.leave(`chat:${Number(id)}`));
    socket.on("typing",async data=>{try{const kind=data?.kind==="room"?"room":"direct",scope=Number(data?.scopeId);if(!Number.isInteger(scope))return;const key=`typing:${kind}:${scope}:${uid}`;if(data?.active)await redis.set(key,JSON.stringify({userId:Number(uid),username:socket.user.username,displayName:socket.user.display_name}),{EX:8});else await redis.del(key);const event={kind,scopeId:scope,userId:Number(uid),username:socket.user.username,displayName:socket.user.display_name,active:Boolean(data?.active)};io.to(`${kind==="room"?"room":"chat"}:${scope}`).emit("typing:update",event)}catch{}});
    socket.on("disconnect",()=>{clearInterval(heartbeat);markOffline(io,uid).catch(()=>{})});
  });
  console.log("MARBO3A realtime attached · presence events enabled");
  return io;
}
