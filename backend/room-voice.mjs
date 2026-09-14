import http from "http";
import {pool,requireAuth,isAdmin,turnConfig,emitUser,emitRoom} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const MAX_PARTICIPANTS=Math.max(4,Math.min(100,Number(process.env.ROOM_VOICE_MAX_PARTICIPANTS)||24));
const DEFAULT_SEATS=Math.max(1,Math.min(16,Number(process.env.ROOM_VOICE_DEFAULT_SEATS)||8));
const ACTIVE_SECONDS=20;

async function auth(req,res){return requireAuth(req,res)}
async function access(roomId,u){
  const room=(await pool.query(`SELECT id,is_public,owner_id,name,join_policy,max_members,COALESCE(speaker_seat_count,$2)::int speaker_seat_count FROM rooms WHERE id=$1`,[roomId,DEFAULT_SEATS])).rows[0];
  if(!room)return{ok:false,error:"ROOM_NOT_FOUND"};
  if(!isAdmin(u)){
    const banned=(await pool.query(`SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2 LIMIT 1`,[roomId,u.id])).rows[0];
    if(banned)return{ok:false,error:"ROOM_BANNED"};
  }
  let mem=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0];
  if(!mem&&!isAdmin(u)){
    if(!room.is_public||room.join_policy!=="open")return{ok:false,error:room.join_policy==="invite"?"INVITE_REQUIRED":"JOIN_REQUIRED"};
    const members=Number((await pool.query(`SELECT COUNT(*)::int n FROM room_members WHERE room_id=$1`,[roomId])).rows[0]?.n||0);
    if(members>=Number(room.max_members||500))return{ok:false,error:"ROOM_FULL"};
    await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING`,[roomId,u.id]);mem={role:"member"};
  }
  return{ok:true,room,memberRole:isAdmin(u)?"owner":(mem?.role||"member"),manager:isAdmin(u)||Number(room.owner_id)===Number(u.id)||["owner","moderator"].includes(mem?.role)};
}
const deny=(res,a)=>res.status(a.error==="ROOM_NOT_FOUND"?404:a.error==="ROOM_FULL"?409:403).json({ok:false,error:a.error});
async function purge(roomId){
  await Promise.all([
    pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]),
    pool.query(`DELETE FROM guest_room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]).catch(()=>({})),
    pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND created_at<NOW()-INTERVAL '5 minutes'`,[roomId]).catch(()=>({}))
  ]);
}
async function activeCount(roomId){
  const [users,guests]=await Promise.all([
    pool.query(`SELECT COUNT(*)::int n FROM room_voice_presence WHERE room_id=$1 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]),
    pool.query(`SELECT COUNT(*)::int n FROM guest_room_voice_presence WHERE room_id=$1 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]).catch(()=>({rows:[{n:0}]}))
  ]);
  return Number(users.rows[0]?.n||0)+Number(guests.rows[0]?.n||0);
}
async function participants(roomId){
  const users=(await pool.query(`SELECT p.user_id,p.role,p.requested,p.muted,p.seat_index,p.joined_at,p.last_seen,u.username,u.display_name,u.avatar_url,FALSE guest FROM room_voice_presence p JOIN users u ON u.id=p.user_id WHERE p.room_id=$1 AND p.last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds' ORDER BY CASE p.role WHEN 'speaker' THEN 0 ELSE 1 END,COALESCE(p.seat_index,99),p.joined_at`,[roomId])).rows;
  const guests=(await pool.query(`SELECT -g.id user_id,'listener'::text role,FALSE requested,FALSE muted,NULL::int seat_index,p.joined_at,p.last_seen,NULL::text username,('زائر '||g.id)::text display_name,NULL::text avatar_url,TRUE guest FROM guest_room_voice_presence p JOIN guest_visitors g ON g.id=p.guest_id WHERE p.room_id=$1 AND p.last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds' ORDER BY p.joined_at`,[roomId]).catch(()=>({rows:[]}))).rows;
  return[...users,...guests];
}
async function chooseSeat(roomId,target,seatCount,requested){
  const occupied=(await pool.query(`SELECT seat_index FROM room_voice_presence WHERE room_id=$1 AND role='speaker' AND user_id<>$2 AND seat_index IS NOT NULL AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,target])).rows.map(x=>Number(x.seat_index));
  const wanted=Number(requested);
  if(Number.isInteger(wanted)&&wanted>=1&&wanted<=seatCount&&!occupied.includes(wanted))return wanted;
  for(let i=1;i<=seatCount;i++)if(!occupied.includes(i))return i;
  return null;
}

http.createServer=function roomVoiceCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.get("/api/rooms/:id/voice/state",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);await purge(roomId);
      const rows=await participants(roomId),rtc=turnConfig(u.id),seatCount=Math.max(1,Math.min(16,Number(a.room.speaker_seat_count)||DEFAULT_SEATS));
      res.json({ok:true,viewerId:u.id,manager:a.manager,roomName:a.room.name,participants:rows,iceServers:rtc.iceServers,turnConfigured:rtc.turnConfigured,tlsConfigured:rtc.tlsConfigured,forceRelay:rtc.forceRelay,maxSpeakers:seatCount,seatCount,maxParticipants:MAX_PARTICIPANTS,scaleMode:"p2p-small-room"});
    }catch(e){console.error("voice state",e);res.status(500).json({ok:false,error:"VOICE_STATE_FAILED"})}});

    app.post("/api/rooms/:id/voice/join",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);await purge(roomId);
      const exists=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0];
      if(!exists&&await activeCount(roomId)>=MAX_PARTICIPANTS)return res.status(409).json({ok:false,error:"VOICE_ROOM_FULL",maxParticipants:MAX_PARTICIPANTS});
      await pool.query(`INSERT INTO room_voice_presence(room_id,user_id,role,seat_index,last_seen) VALUES($1,$2,'listener',NULL,NOW()) ON CONFLICT(room_id,user_id) DO UPDATE SET last_seen=NOW()`,[roomId,u.id]);
      emitRoom(roomId,"roomvoice:state",{roomId,reason:"join",userId:u.id});res.json({ok:true,maxParticipants:MAX_PARTICIPANTS,seatCount:Number(a.room.speaker_seat_count||DEFAULT_SEATS)});
    }catch(e){console.error("voice join",e);res.status(500).json({ok:false,error:"VOICE_JOIN_FAILED"})}});

    app.post("/api/rooms/:id/voice/heartbeat",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);
      await pool.query(`UPDATE room_voice_presence SET last_seen=NOW(),muted=$3 WHERE room_id=$1 AND user_id=$2`,[roomId,u.id,Boolean(req.body?.muted)]);res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"VOICE_HEARTBEAT_FAILED"})}});

    app.post("/api/rooms/:id/voice/leave",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),beforeMs=Number(req.body?.beforeMs||0);
      const guarded=Number.isFinite(beforeMs)&&beforeMs>0;
      const deleted=guarded
        ?await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen<=to_timestamp($3::double precision/1000.0) RETURNING user_id`,[roomId,u.id,beforeMs])
        :await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 RETURNING user_id`,[roomId,u.id]);
      if(deleted.rowCount){
        await pool.query(`DELETE FROM room_voice_signals WHERE room_id=$1 AND (sender_id=$2 OR recipient_id=$2)`,[roomId,u.id]);
        await pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND (sender_user_id=$2 OR recipient_user_id=$2)`,[roomId,u.id]).catch(()=>{});
        emitRoom(roomId,"roomvoice:state",{roomId,reason:"leave",userId:u.id});
      }
      res.json({ok:true,guarded,removed:deleted.rowCount>0});
    }catch{res.status(500).json({ok:false,error:"VOICE_LEAVE_FAILED"})}});

    app.post("/api/rooms/:id/voice/request",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);
      await pool.query(`UPDATE room_voice_presence SET requested=TRUE,last_seen=NOW() WHERE room_id=$1 AND user_id=$2`,[roomId,u.id]);emitRoom(roomId,"roomvoice:state",{roomId,reason:"request",userId:u.id});res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"VOICE_REQUEST_FAILED"})}});

    // Rooms V2: an authenticated member takes an available seat directly.
    app.post("/api/rooms/:id/voice/role",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);
      const target=Number(req.body?.userId||u.id),role=req.body?.role==="speaker"?"speaker":"listener";
      if(target!==Number(u.id)&&!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
      const present=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,target])).rows[0];if(!present)return res.status(409).json({ok:false,error:"VOICE_NOT_JOINED"});
      let seat=null;
      if(role==="speaker"){
        const seatCount=Math.max(1,Math.min(16,Number(a.room.speaker_seat_count)||DEFAULT_SEATS));seat=await chooseSeat(roomId,target,seatCount,req.body?.seatIndex);
        if(!seat)return res.status(409).json({ok:false,error:"SPEAKER_LIMIT",seatCount});
      }
      try{await pool.query(`UPDATE room_voice_presence SET role=$3,seat_index=$4,requested=FALSE,muted=FALSE,last_seen=NOW() WHERE room_id=$1 AND user_id=$2`,[roomId,target,role,seat])}catch(e){if(e?.code==="23505")return res.status(409).json({ok:false,error:"SEAT_TAKEN"});throw e}
      emitRoom(roomId,"roomvoice:state",{roomId,reason:"role",userId:target,role,seatIndex:seat});res.json({ok:true,role,seatIndex:seat});
    }catch(e){console.error("voice role",e);res.status(500).json({ok:false,error:"VOICE_ROLE_FAILED"})}});

    app.post("/api/rooms/:id/voice/kick",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);if(!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
      const target=Number(req.body?.userId);if(target<0){const gid=-target;await pool.query(`DELETE FROM guest_room_voice_presence WHERE room_id=$1 AND guest_id=$2`,[roomId,gid]);await pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND (sender_guest_id=$2 OR recipient_guest_id=$2)`,[roomId,gid]);emitRoom(roomId,"roomvoice:state",{roomId,reason:"kick",userId:target});return res.json({ok:true})}
      await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,target]);await pool.query(`DELETE FROM room_voice_signals WHERE room_id=$1 AND (sender_id=$2 OR recipient_id=$2)`,[roomId,target]);await pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND (sender_user_id=$2 OR recipient_user_id=$2)`,[roomId,target]).catch(()=>{});emitUser(target,"roomvoice:kicked",{roomId});emitRoom(roomId,"roomvoice:state",{roomId,reason:"kick",userId:target});res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"VOICE_KICK_FAILED"})}});

    app.post("/api/rooms/:id/voice/signals",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);
      const recipient=Number(req.body?.recipientId),kind=String(req.body?.kind||""),payload=req.body?.payload;if(!["offer","answer","ice"].includes(kind)||!recipient||!payload||typeof payload!=="object")return res.status(400).json({ok:false,error:"BAD_SIGNAL"});
      const active=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,u.id])).rows[0];if(!active)return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});
      if(recipient<0){
        const guestId=-recipient,other=(await pool.query(`SELECT 1 FROM guest_room_voice_presence WHERE room_id=$1 AND guest_id=$2 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,guestId])).rows[0];if(!other)return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});
        const row=(await pool.query(`INSERT INTO guest_room_voice_signals(room_id,sender_user_id,recipient_guest_id,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,[roomId,u.id,guestId,kind,payload])).rows[0];return res.status(201).json({ok:true,id:row.id,bridge:"guest"});
      }
      const other=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,recipient])).rows[0];if(!other)return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});
      const row=(await pool.query(`INSERT INTO room_voice_signals(room_id,sender_id,recipient_id,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,[roomId,u.id,recipient,kind,payload])).rows[0];emitUser(recipient,"roomvoice:signal",{id:row.id,roomId,senderId:Number(u.id),kind,payload,createdAt:row.created_at});res.status(201).json({ok:true,id:row.id,bridge:"user"});
    }catch(e){console.error("voice signal",e);res.status(500).json({ok:false,error:"VOICE_SIGNAL_FAILED"})}});

    app.get("/api/rooms/:id/voice/signals",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);
      const since=Math.max(0,Number(req.query.since)||0),guestSince=Math.max(0,Number(req.query.guestSince)||0);
      const [rows,guestRows]=await Promise.all([
        pool.query(`SELECT id,sender_id,kind,payload,created_at FROM room_voice_signals WHERE room_id=$1 AND recipient_id=$2 AND id>$3 ORDER BY id ASC LIMIT 300`,[roomId,u.id,since]),
        pool.query(`SELECT id,-sender_guest_id sender_id,kind,payload,created_at FROM guest_room_voice_signals WHERE room_id=$1 AND recipient_user_id=$2 AND id>$3 ORDER BY id ASC LIMIT 300`,[roomId,u.id,guestSince]).catch(()=>({rows:[]}))
      ]);res.json({ok:true,signals:rows.rows,guestSignals:guestRows.rows});
    }catch(e){console.error("voice signal load",e);res.status(500).json({ok:false,error:"VOICE_SIGNAL_LOAD_FAILED"})}});
  }
  return prior(app,...args);
};
