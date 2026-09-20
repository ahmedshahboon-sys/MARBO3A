import {pool,requireAuth,isAdmin,turnConfig,emitUser,emitRoom,actionRateLimit,rejectRateLimit} from "../runtime.mjs";
import {operationalSetting} from "../operational-controls.mjs";

const MAX_PARTICIPANTS=Math.max(4,Math.min(100,Number(process.env.ROOM_VOICE_MAX_PARTICIPANTS)||24));
const DEFAULT_SEATS=Math.max(1,Math.min(16,Number(process.env.ROOM_VOICE_DEFAULT_SEATS)||8));
const ACTIVE_SECONDS=20;
async function voiceParticipantLimit(){return Math.max(4,Math.min(MAX_PARTICIPANTS,Number(await operationalSetting("voice_participant_max"))||MAX_PARTICIPANTS))}

async function access(roomId,u){
  const room=(await pool.query(`SELECT id,is_public,visibility,owner_id,name,join_policy,max_members,COALESCE(speaker_seat_count,$2)::int speaker_seat_count FROM rooms WHERE id=$1`,[roomId,DEFAULT_SEATS])).rows[0];
  if(!room)return{ok:false,error:"ROOM_NOT_FOUND"};
  if(!isAdmin(u)){
    const banned=(await pool.query(`SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2 LIMIT 1`,[roomId,u.id])).rows[0];
    if(banned)return{ok:false,error:"ROOM_BANNED"};
  }
  let member=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0];
  if(!member&&!isAdmin(u)){
    const visibility=String(room.visibility||"");
    if(visibility==="private"||room.join_policy==="invite")return{ok:false,error:"INVITE_REQUIRED"};
    if(visibility==="friends")return{ok:false,error:"JOIN_REQUIRED"};
    if(!room.is_public||room.join_policy!=="open")return{ok:false,error:"JOIN_REQUIRED"};
    const members=Number((await pool.query(`SELECT COUNT(*)::int n FROM room_members WHERE room_id=$1`,[roomId])).rows[0]?.n||0);
    if(members>=Number(room.max_members||500))return{ok:false,error:"ROOM_FULL"};
    await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING`,[roomId,u.id]);
    member={role:"member"};
  }
  const role=isAdmin(u)?"owner":(member?.role||"member");
  return{ok:true,room,memberRole:role,manager:isAdmin(u)||Number(room.owner_id)===Number(u.id)||["owner","moderator"].includes(role)};
}
const deny=(res,a)=>res.status(a.error==="ROOM_NOT_FOUND"?404:a.error==="ROOM_FULL"?409:403).json({ok:false,error:a.error});

async function purge(roomId){
  await Promise.all([
    pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]),
    pool.query(`DELETE FROM guest_room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]).catch(()=>({})),
    pool.query(`DELETE FROM room_voice_signals WHERE room_id=$1 AND created_at<NOW()-INTERVAL '5 minutes'`,[roomId]).catch(()=>({})),
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
async function activeUser(roomId,userId){
  return Boolean((await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,userId])).rows[0]);
}
async function activeVoiceRole(roomId,userId){
  return (await pool.query(`SELECT role FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,userId])).rows[0]?.role||null;
}
async function participants(roomId){
  const users=(await pool.query(`SELECT p.user_id,p.role,p.requested,(p.muted OR p.forced_muted) muted,p.forced_muted,p.seat_index,p.joined_at,p.last_seen,u.username,u.display_name,u.avatar_url,FALSE guest FROM room_voice_presence p JOIN users u ON u.id=p.user_id WHERE p.room_id=$1 AND p.last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds' ORDER BY CASE p.role WHEN 'speaker' THEN 0 ELSE 1 END,COALESCE(p.seat_index,99),p.joined_at`,[roomId])).rows;
  const guests=(await pool.query(`SELECT -g.id user_id,'listener'::text role,FALSE requested,FALSE muted,FALSE forced_muted,NULL::int seat_index,p.joined_at,p.last_seen,NULL::text username,('زائر '||g.id)::text display_name,NULL::text avatar_url,TRUE guest FROM guest_room_voice_presence p JOIN guest_visitors g ON g.id=p.guest_id WHERE p.room_id=$1 AND p.last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds' ORDER BY p.joined_at`,[roomId]).catch(()=>({rows:[]}))).rows;
  return[...users,...guests];
}
async function chooseSeat(roomId,target,seatCount,requested){
  const locked=new Set((await pool.query(`SELECT seat_index FROM room_voice_seat_locks WHERE room_id=$1`,[roomId])).rows.map(x=>Number(x.seat_index)));
  const occupied=new Set((await pool.query(`SELECT seat_index FROM room_voice_presence WHERE room_id=$1 AND role='speaker' AND user_id<>$2 AND seat_index IS NOT NULL AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,target])).rows.map(x=>Number(x.seat_index)));
  const wanted=Number(requested);
  if(Number.isInteger(wanted)&&wanted>=1&&wanted<=seatCount&&!locked.has(wanted)&&!occupied.has(wanted))return wanted;
  for(let i=1;i<=seatCount;i++)if(!locked.has(i)&&!occupied.has(i))return i;
  return null;
}
async function roleOf(roomId,userId){
  return (await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,userId])).rows[0]?.role||null;
}
async function moderationAllowed(roomId,actor,target){
  if(isAdmin(actor))return true;
  if(Number(actor.id)===Number(target))return false;
  const actorRole=await roleOf(roomId,actor.id),targetRole=await roleOf(roomId,target);
  if(actorRole==="owner")return targetRole!=="owner";
  if(actorRole==="moderator")return targetRole==="member"||targetRole===null;
  return false;
}
async function cleanupVoiceUser(roomId,target,reason){
  await Promise.all([
    pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,target]),
    pool.query(`DELETE FROM room_voice_signals WHERE room_id=$1 AND (sender_id=$2 OR recipient_id=$2)`,[roomId,target]),
    pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND (sender_user_id=$2 OR recipient_user_id=$2)`,[roomId,target]).catch(()=>{})
  ]);
  emitUser(target,"roomvoice:kicked",{roomId,reason});
  emitRoom(roomId,"roomvoice:state",{roomId,reason,userId:target});
}

export function registerCoreRoomVoice(app){
  app.get("/api/rooms/:id/voice/state",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);await purge(roomId);
    const lockedSeats=(await pool.query(`SELECT seat_index FROM room_voice_seat_locks WHERE room_id=$1 ORDER BY seat_index`,[roomId])).rows.map(x=>Number(x.seat_index));
    const rows=await participants(roomId),rtc=turnConfig(u.id),seatCount=Math.max(1,Math.min(16,Number(a.room.speaker_seat_count)||DEFAULT_SEATS)),maxParticipants=await voiceParticipantLimit();
    res.json({ok:true,viewerId:u.id,manager:a.manager,roomName:a.room.name,participants:rows,lockedSeats,iceServers:rtc.iceServers,turnConfigured:rtc.turnConfigured,tlsConfigured:rtc.tlsConfigured,forceRelay:rtc.forceRelay,maxSpeakers:seatCount,seatCount,maxParticipants,scaleMode:"p2p-small-room-r1"});
  }catch(e){console.error("voice state",e);res.status(500).json({ok:false,error:"VOICE_STATE_FAILED"})}});

  app.post("/api/rooms/:id/voice/join",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const rate=await actionRateLimit("voice-join",u.id,{limit:12,windowSeconds:60});if(!rate.allowed)return rejectRateLimit(res,rate,"VOICE_JOIN_RATE_LIMITED");
    const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);await purge(roomId);
    const exists=(await pool.query(`SELECT forced_muted FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0],maxParticipants=await voiceParticipantLimit();
    if(!exists&&await activeCount(roomId)>=maxParticipants)return res.status(409).json({ok:false,error:"VOICE_ROOM_FULL",maxParticipants});
    const row=(await pool.query(`INSERT INTO room_voice_presence(room_id,user_id,role,seat_index,requested,muted,forced_muted,last_seen) VALUES($1,$2,'listener',NULL,FALSE,FALSE,FALSE,NOW()) ON CONFLICT(room_id,user_id) DO UPDATE SET role='listener',seat_index=NULL,requested=FALSE,muted=room_voice_presence.forced_muted,forced_muted=room_voice_presence.forced_muted,last_seen=NOW() RETURNING forced_muted,muted`,[roomId,u.id])).rows[0];
    emitRoom(roomId,"roomvoice:state",{roomId,reason:"join-reset",userId:u.id});
    res.json({ok:true,seatCount:Number(a.room.speaker_seat_count||DEFAULT_SEATS),maxParticipants,forcedMuted:Boolean(row?.forced_muted),muted:Boolean(row?.muted)});
  }catch(e){console.error("voice join",e);res.status(500).json({ok:false,error:"VOICE_JOIN_FAILED"})}});

  app.post("/api/rooms/:id/voice/heartbeat",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);
    const row=(await pool.query(`UPDATE room_voice_presence SET last_seen=NOW(),muted=(forced_muted OR $3) WHERE room_id=$1 AND user_id=$2 RETURNING forced_muted,muted`,[roomId,u.id,Boolean(req.body?.muted)])).rows[0];
    if(!row)return res.status(409).json({ok:false,error:"VOICE_NOT_JOINED"});
    res.json({ok:true,forcedMuted:Boolean(row.forced_muted),muted:Boolean(row.muted)});
  }catch{res.status(500).json({ok:false,error:"VOICE_HEARTBEAT_FAILED"})}});

  app.post("/api/rooms/:id/voice/leave",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),beforeMs=Number(req.body?.beforeMs||0),guarded=Number.isFinite(beforeMs)&&beforeMs>0;
    const deleted=guarded?await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen<=to_timestamp($3::double precision/1000.0) RETURNING user_id`,[roomId,u.id,beforeMs]):await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 RETURNING user_id`,[roomId,u.id]);
    if(deleted.rowCount){await pool.query(`DELETE FROM room_voice_signals WHERE room_id=$1 AND (sender_id=$2 OR recipient_id=$2)`,[roomId,u.id]);await pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND (sender_user_id=$2 OR recipient_user_id=$2)`,[roomId,u.id]).catch(()=>{});emitRoom(roomId,"roomvoice:state",{roomId,reason:"leave",userId:u.id})}
    res.json({ok:true,guarded,removed:deleted.rowCount>0});
  }catch{res.status(500).json({ok:false,error:"VOICE_LEAVE_FAILED"})}});

  app.post("/api/rooms/:id/voice/request",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);if(!await activeUser(roomId,u.id))return res.status(409).json({ok:false,error:"VOICE_NOT_JOINED"});
    const rate=await actionRateLimit("voice-request",u.id,{limit:20,windowSeconds:60});if(!rate.allowed)return rejectRateLimit(res,rate,"VOICE_REQUEST_RATE_LIMITED");
    await pool.query(`UPDATE room_voice_presence SET requested=TRUE,last_seen=NOW() WHERE room_id=$1 AND user_id=$2`,[roomId,u.id]);emitRoom(roomId,"roomvoice:state",{roomId,reason:"request",userId:u.id});res.json({ok:true});
  }catch{res.status(500).json({ok:false,error:"VOICE_REQUEST_FAILED"})}});

  app.post("/api/rooms/:id/voice/role",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);const target=Number(req.body?.userId||u.id),role=req.body?.role==="speaker"?"speaker":"listener";
    if(target!==Number(u.id)&&!await moderationAllowed(roomId,u,target))return res.status(403).json({ok:false,error:"ROOM_ROLE_PROTECTED"});
    const present=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,target])).rows[0];if(!present)return res.status(409).json({ok:false,error:"VOICE_NOT_JOINED"});
    let seat=null;if(role==="speaker"){const seatCount=Math.max(1,Math.min(16,Number(a.room.speaker_seat_count)||DEFAULT_SEATS));seat=await chooseSeat(roomId,target,seatCount,req.body?.seatIndex);if(!seat)return res.status(409).json({ok:false,error:"SEAT_TAKEN_OR_LOCKED",seatCount})}
    try{await pool.query(`UPDATE room_voice_presence SET role=$3,seat_index=$4,requested=FALSE,muted=CASE WHEN forced_muted THEN TRUE ELSE FALSE END,last_seen=NOW() WHERE room_id=$1 AND user_id=$2`,[roomId,target,role,seat])}catch(e){if(e?.code==="23505")return res.status(409).json({ok:false,error:"SEAT_TAKEN"});throw e}
    emitRoom(roomId,"roomvoice:state",{roomId,reason:"role",userId:target,role,seatIndex:seat});res.json({ok:true,role,seatIndex:seat});
  }catch(e){console.error("voice role",e);res.status(500).json({ok:false,error:"VOICE_ROLE_FAILED"})}});

  app.put("/api/rooms/:id/voice/seats/:seat",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),seat=Number(req.params.seat),a=await access(roomId,u);if(!a.ok)return deny(res,a);if(!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
    const seatCount=Math.max(1,Math.min(16,Number(a.room.speaker_seat_count)||DEFAULT_SEATS));if(!Number.isInteger(seat)||seat<1||seat>seatCount)return res.status(400).json({ok:false,error:"INVALID_SEAT"});
    const locked=req.body?.locked!==false;if(locked){const occupant=(await pool.query(`SELECT user_id FROM room_voice_presence WHERE room_id=$1 AND seat_index=$2 AND role='speaker'`,[roomId,seat])).rows[0];if(occupant&&!await moderationAllowed(roomId,u,occupant.user_id))return res.status(403).json({ok:false,error:"ROOM_ROLE_PROTECTED"});await pool.query(`INSERT INTO room_voice_seat_locks(room_id,seat_index,locked_by) VALUES($1,$2,$3) ON CONFLICT(room_id,seat_index) DO NOTHING`,[roomId,seat,u.id]);const moved=(await pool.query(`UPDATE room_voice_presence SET role='listener',seat_index=NULL,requested=FALSE WHERE room_id=$1 AND seat_index=$2 RETURNING user_id`,[roomId,seat])).rows;for(const x of moved)emitUser(x.user_id,"roomvoice:state",{roomId,reason:"seat-locked"})}else await pool.query(`DELETE FROM room_voice_seat_locks WHERE room_id=$1 AND seat_index=$2`,[roomId,seat]);
    emitRoom(roomId,"roomvoice:state",{roomId,reason:"seat-lock",seatIndex:seat,locked});res.json({ok:true,seatIndex:seat,locked});
  }catch(e){console.error("seat lock",e);res.status(500).json({ok:false,error:"SEAT_LOCK_FAILED"})}});

  app.post("/api/rooms/:id/voice/moderate",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);if(!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
    const target=Number(req.body?.userId),action=String(req.body?.action||"");if(!Number.isSafeInteger(target)||target<=0||!await moderationAllowed(roomId,u,target))return res.status(403).json({ok:false,error:"ROOM_ROLE_PROTECTED"});
    if(action==="mute"){await pool.query(`UPDATE room_voice_presence SET forced_muted=TRUE,muted=TRUE WHERE room_id=$1 AND user_id=$2`,[roomId,target]);emitUser(target,"roomvoice:state",{roomId,reason:"force-mute"})}
    else if(action==="unmute"){await pool.query(`UPDATE room_voice_presence SET forced_muted=FALSE,muted=FALSE WHERE room_id=$1 AND user_id=$2`,[roomId,target]);emitUser(target,"roomvoice:state",{roomId,reason:"force-unmute"})}
    else if(action==="listener"){await pool.query(`UPDATE room_voice_presence SET role='listener',seat_index=NULL,requested=FALSE,forced_muted=FALSE,muted=FALSE WHERE room_id=$1 AND user_id=$2`,[roomId,target]);emitUser(target,"roomvoice:state",{roomId,reason:"forced-listener"})}
    else if(action==="kick"){await cleanupVoiceUser(roomId,target,"moderator-kick");return res.json({ok:true,action,userId:target})}
    else return res.status(400).json({ok:false,error:"INVALID_ACTION"});
    emitRoom(roomId,"roomvoice:state",{roomId,reason:`moderate-${action}`,userId:target});res.json({ok:true,action,userId:target});
  }catch(e){console.error("voice moderate",e);res.status(500).json({ok:false,error:"VOICE_MODERATE_FAILED"})}});

  app.post("/api/rooms/:id/voice/kick",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);if(!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
    const target=Number(req.body?.userId);if(target<0){const gid=-target;await pool.query(`DELETE FROM guest_room_voice_presence WHERE room_id=$1 AND guest_id=$2`,[roomId,gid]);await pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND (sender_guest_id=$2 OR recipient_guest_id=$2)`,[roomId,gid]);emitRoom(roomId,"roomvoice:state",{roomId,reason:"kick",userId:target});return res.json({ok:true})}
    if(!Number.isSafeInteger(target)||target<=0||!await moderationAllowed(roomId,u,target))return res.status(403).json({ok:false,error:"ROOM_ROLE_PROTECTED"});
    await cleanupVoiceUser(roomId,target,"kick");res.json({ok:true});
  }catch{res.status(500).json({ok:false,error:"VOICE_KICK_FAILED"})}});

  app.post("/api/rooms/:id/voice/signals",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const rate=await actionRateLimit("voice-signal",u.id,{limit:180,windowSeconds:30});if(!rate.allowed)return rejectRateLimit(res,rate,"VOICE_SIGNAL_RATE_LIMITED");
    const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);if(!await activeUser(roomId,u.id))return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});
    const recipient=Number(req.body?.recipientId),kind=String(req.body?.kind||""),payload=req.body?.payload;
    if(!["offer","answer","ice"].includes(kind)||!recipient||!payload||typeof payload!=="object"||JSON.stringify(payload).length>20000)return res.status(400).json({ok:false,error:"BAD_SIGNAL"});
    if(recipient<0){const guestId=-recipient,other=(await pool.query(`SELECT 1 FROM guest_room_voice_presence WHERE room_id=$1 AND guest_id=$2 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId,guestId])).rows[0];if(!other)return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});if(await activeVoiceRole(roomId,u.id)!=="speaker")return res.status(403).json({ok:false,error:"BAD_SIGNAL_ROLE"});const row=(await pool.query(`INSERT INTO guest_room_voice_signals(room_id,sender_user_id,recipient_guest_id,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,[roomId,u.id,guestId,kind,payload])).rows[0];return res.status(201).json({ok:true,id:row.id,bridge:"guest"})}
    const senderRole=await activeVoiceRole(roomId,u.id),recipientRole=await activeVoiceRole(roomId,recipient);if(!recipientRole)return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});if(senderRole!=="speaker"&&recipientRole!=="speaker")return res.status(403).json({ok:false,error:"BAD_SIGNAL_ROLE"});if(kind==="offer"&&senderRole!=="speaker")return res.status(403).json({ok:false,error:"BAD_SIGNAL_ROLE"});
    const row=(await pool.query(`INSERT INTO room_voice_signals(room_id,sender_id,recipient_id,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,[roomId,u.id,recipient,kind,payload])).rows[0];emitUser(recipient,"roomvoice:signal",{id:row.id,roomId,senderId:Number(u.id),kind,payload,createdAt:row.created_at});res.status(201).json({ok:true,id:row.id,bridge:"user"});
  }catch(e){console.error("voice signal",e);res.status(500).json({ok:false,error:"VOICE_SIGNAL_FAILED"})}});

  app.get("/api/rooms/:id/voice/signals",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);if(!await activeUser(roomId,u.id))return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});
    const since=Math.max(0,Number(req.query.since)||0),guestSince=Math.max(0,Number(req.query.guestSince)||0);
    const [rows,guestRows]=await Promise.all([
      pool.query(`SELECT id,sender_id,kind,payload,created_at FROM room_voice_signals WHERE room_id=$1 AND recipient_id=$2 AND id>$3 ORDER BY id ASC LIMIT 300`,[roomId,u.id,since]),
      pool.query(`SELECT id,-sender_guest_id sender_id,kind,payload,created_at FROM guest_room_voice_signals WHERE room_id=$1 AND recipient_user_id=$2 AND id>$3 ORDER BY id ASC LIMIT 300`,[roomId,u.id,guestSince]).catch(()=>({rows:[]}))
    ]);
    res.json({ok:true,signals:rows.rows,guestSignals:guestRows.rows});
  }catch(e){console.error("voice signal load",e);res.status(500).json({ok:false,error:"VOICE_SIGNAL_LOAD_FAILED"})}});

  app.get("/api/rooms/voice/live",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;await pool.query(`DELETE FROM room_voice_presence WHERE last_seen<NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`);
    const rows=(await pool.query(`SELECT p.room_id,p.user_id,p.role,(p.muted OR p.forced_muted) muted,p.joined_at,p.last_seen,x.username,x.display_name,x.avatar_url FROM room_voice_presence p JOIN users x ON x.id=p.user_id JOIN rooms r ON r.id=p.room_id WHERE p.last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds' AND r.is_public=TRUE AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocked_id=$1 AND b.blocker_id=p.user_id)) ORDER BY p.room_id,CASE p.role WHEN 'speaker' THEN 0 ELSE 1 END,p.joined_at`,[u.id])).rows;
    const rooms={};for(const row of rows){const key=String(row.room_id);rooms[key]||={count:0,speakers:0,participants:[]};rooms[key].count++;if(row.role==="speaker"&&!row.muted)rooms[key].speakers++;if(rooms[key].participants.length<5)rooms[key].participants.push({user_id:row.user_id,username:row.username,display_name:row.display_name,avatar_url:row.avatar_url,role:row.role,muted:row.muted})}
    res.json({ok:true,rooms});
  }catch(e){console.error("voice discovery",e);res.status(500).json({ok:false,error:"VOICE_DISCOVERY_FAILED"})}});
}
