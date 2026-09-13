import http from "http";
import crypto from "crypto";
import {pool,sessionUser,requireAuth,requireAdmin,isAdmin,turnConfig,clean} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const GUEST_COOKIE="marbo3a_guest";
const PUBLIC_ACTIVITY=new Set(["pageview","room_enter","room_leave","register_prompt","login_prompt"]);
const ACTIVE_GUEST_SECONDS=90;
const ACTIVE_VOICE_SECONDS=20;

function cookies(req){
  const out={};
  for(const part of String(req.headers.cookie||"").split(";")){
    const i=part.indexOf("=");if(i<1)continue;
    const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();
    try{out[k]=decodeURIComponent(v)}catch{out[k]=v}
  }
  return out;
}
function guestUuid(req){const v=String(cookies(req)[GUEST_COOKIE]||"");return /^[0-9a-f-]{36}$/i.test(v)?v:""}
function ipOf(req){
  let raw=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"").split(",")[0].trim();
  if(raw.startsWith("::ffff:"))raw=raw.slice(7);
  if(!raw||raw.length>64)return null;
  return raw;
}
function clientInfo(uaRaw){
  const ua=String(uaRaw||"");
  const device=/iPad|Tablet/i.test(ua)?"tablet":/Mobile|Android|iPhone|iPod/i.test(ua)?"mobile":"desktop";
  const os=/iPhone|iPad|iPod/i.test(ua)?"iOS":/Android/i.test(ua)?"Android":/Windows/i.test(ua)?"Windows":/Mac OS|Macintosh/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"unknown";
  const browser=/Edg\//i.test(ua)?"Edge":/OPR\//i.test(ua)?"Opera":/CriOS|Chrome\//i.test(ua)?"Chrome":/FxiOS|Firefox\//i.test(ua)?"Firefox":/Safari\//i.test(ua)?"Safari":"unknown";
  return{device,os,browser};
}
function setGuestCookie(req,res,uuid){
  const secure=process.env.NODE_ENV==="production"||String(req.headers["x-forwarded-proto"]||"").toLowerCase().includes("https");
  const value=`${GUEST_COOKIE}=${encodeURIComponent(uuid)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure?"; Secure":""}`;
  res.append("Set-Cookie",value);
}
async function ensureGuest(req,res,{visit=false}={}){
  let uuid=guestUuid(req),created=false;
  if(!uuid){uuid=crypto.randomUUID();created=true;setGuestCookie(req,res,uuid)}
  const ua=clean(req.headers["user-agent"],500),ip=ipOf(req),info=clientInfo(ua);
  let row=(await pool.query(`SELECT * FROM guest_visitors WHERE guest_uuid=$1`,[uuid])).rows[0];
  if(!row){
    row=(await pool.query(`INSERT INTO guest_visitors(guest_uuid,last_ip,last_user_agent,device_type,os_name,browser_name) VALUES($1,$2::inet,$3,$4,$5,$6) RETURNING *`,[uuid,ip,ua,info.device,info.os,info.browser])).rows[0];
    created=true;
  }else{
    row=(await pool.query(`UPDATE guest_visitors SET last_seen_at=NOW(),last_ip=COALESCE($2::inet,last_ip),last_user_agent=$3,device_type=$4,os_name=$5,browser_name=$6,visit_count=visit_count+$7 WHERE guest_uuid=$1 RETURNING *`,[uuid,ip,ua,info.device,info.os,info.browser,visit?1:0])).rows[0];
  }
  if(created)await pool.query(`INSERT INTO guest_activity(guest_id,event_type,path,metadata) VALUES($1,'pageview',$2,$3::jsonb)`,[row.id,clean(req.body?.path||req.query?.path||"/explore",220),JSON.stringify({firstVisit:true})]).catch(()=>{});
  return row;
}
async function publicRoom(id){
  return(await pool.query(`SELECT r.id,r.name,r.slug,r.description,r.image_url,r.visibility,r.join_policy,r.speaker_seat_count,r.owner_id,u.username owner_username,u.display_name owner_name,
    (SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count,
    (SELECT COUNT(*)::int FROM room_voice_presence vp WHERE vp.room_id=r.id AND vp.last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds') active_members,
    (SELECT COUNT(*)::int FROM guest_room_presence gp WHERE gp.room_id=r.id AND gp.last_seen>NOW()-INTERVAL '${ACTIVE_GUEST_SECONDS} seconds') active_guests,
    (SELECT COUNT(*)::int FROM room_voice_presence vp WHERE vp.room_id=r.id AND vp.role='speaker' AND vp.last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds') speakers_count
    FROM rooms r LEFT JOIN users u ON u.id=r.owner_id WHERE r.id=$1 AND r.visibility='public'`,[id])).rows[0];
}
async function logActivity(guestId,type,path,roomId=null,metadata={}){
  if(!guestId||!PUBLIC_ACTIVITY.has(type))return;
  await pool.query(`INSERT INTO guest_activity(guest_id,event_type,path,room_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)`,[guestId,type,clean(path,220)||null,roomId||null,JSON.stringify(metadata||{})]);
}
async function purgeGuestRoom(roomId){
  await Promise.all([
    pool.query(`DELETE FROM guest_room_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_GUEST_SECONDS} seconds'`,[roomId]),
    pool.query(`DELETE FROM guest_room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds'`,[roomId]),
    pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND created_at<NOW()-INTERVAL '5 minutes'`,[roomId])
  ]);
}
async function roomOwnerAccess(roomId,u){
  const room=(await pool.query(`SELECT id,owner_id FROM rooms WHERE id=$1`,[roomId])).rows[0];
  if(!room)return{ok:false,error:"ROOM_NOT_FOUND"};
  if(!isAdmin(u)&&Number(room.owner_id)!==Number(u.id))return{ok:false,error:"ROOM_OWNER_ONLY"};
  return{ok:true,room};
}

http.createServer=function guestRoomsV2CreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.post("/api/public/guest/session",async(req,res)=>{try{
      const g=await ensureGuest(req,res,{visit:true});
      res.json({ok:true,guest:{id:g.id,label:`زائر ${g.id}`,linkedUserId:g.linked_user_id||null,device:g.device_type,os:g.os_name,browser:g.browser_name}});
    }catch(e){console.error("guest session",e);res.status(500).json({ok:false,error:"GUEST_SESSION_FAILED"})}});

    app.get("/api/public/guest/me",async(req,res)=>{try{
      const uuid=guestUuid(req);if(!uuid)return res.json({ok:true,guest:null});
      const g=(await pool.query(`SELECT id,linked_user_id,device_type,os_name,browser_name,last_seen_at FROM guest_visitors WHERE guest_uuid=$1`,[uuid])).rows[0];
      res.json({ok:true,guest:g?{id:g.id,label:`زائر ${g.id}`,linkedUserId:g.linked_user_id||null,device:g.device_type,os:g.os_name,browser:g.browser_name,lastSeenAt:g.last_seen_at}:null});
    }catch{res.json({ok:true,guest:null})}});

    app.post("/api/public/guest/activity",async(req,res)=>{try{
      const g=await ensureGuest(req,res),type=String(req.body?.type||"pageview");
      if(!PUBLIC_ACTIVITY.has(type))return res.status(400).json({ok:false,error:"INVALID_GUEST_ACTIVITY"});
      const roomId=Number(req.body?.roomId)||null,path=clean(req.body?.path,220)||"/explore";
      await logActivity(g.id,type,path,roomId,{source:clean(req.body?.source,80)||null});
      res.json({ok:true});
    }catch(e){res.status(500).json({ok:false,error:"GUEST_ACTIVITY_FAILED"})}});

    app.get("/api/public/rooms-v2",async(_req,res)=>{try{
      const rows=(await pool.query(`SELECT r.id,r.name,r.slug,r.description,r.image_url,r.speaker_seat_count,r.created_at,
        (SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count,
        (SELECT COUNT(*)::int FROM room_voice_presence vp WHERE vp.room_id=r.id AND vp.last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds') active_members,
        (SELECT COUNT(*)::int FROM guest_room_presence gp WHERE gp.room_id=r.id AND gp.last_seen>NOW()-INTERVAL '${ACTIVE_GUEST_SECONDS} seconds') active_guests,
        (SELECT COUNT(*)::int FROM room_voice_presence vp WHERE vp.room_id=r.id AND vp.role='speaker' AND vp.last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds') speakers_count
        FROM rooms r WHERE r.visibility='public' ORDER BY (SELECT COUNT(*) FROM room_voice_presence vp WHERE vp.room_id=r.id AND vp.last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds')+(SELECT COUNT(*) FROM guest_room_presence gp WHERE gp.room_id=r.id AND gp.last_seen>NOW()-INTERVAL '${ACTIVE_GUEST_SECONDS} seconds') DESC,r.id DESC LIMIT 30`)).rows;
      res.setHeader("Cache-Control","public,max-age=10,stale-while-revalidate=30");
      res.json({ok:true,rooms:rows.map(r=>({...r,active_total:Number(r.active_members||0)+Number(r.active_guests||0),listeners_count:Math.max(0,Number(r.active_members||0)+Number(r.active_guests||0)-Number(r.speakers_count||0)),live:Number(r.speakers_count||0)>0}))});
    }catch(e){console.error("public rooms v2",e);res.status(500).json({ok:false,error:"PUBLIC_ROOMS_FAILED"})}});

    app.get("/api/public/rooms-v2/:id",async(req,res)=>{try{
      const id=Number(req.params.id);if(!id)return res.status(400).json({ok:false,error:"INVALID_ROOM"});
      await purgeGuestRoom(id);const room=await publicRoom(id);if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
      res.json({ok:true,room:{...room,active_total:Number(room.active_members||0)+Number(room.active_guests||0),listeners_count:Math.max(0,Number(room.active_members||0)+Number(room.active_guests||0)-Number(room.speakers_count||0)),live:Number(room.speakers_count||0)>0}});
    }catch(e){res.status(500).json({ok:false,error:"PUBLIC_ROOM_FAILED"})}});

    app.get("/api/public/rooms-v2/:id/messages",async(req,res)=>{try{
      const id=Number(req.params.id),room=await publicRoom(id);if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
      const rows=(await pool.query(`SELECT m.id,m.user_id,m.body,m.attachment_url,m.attachment_type,m.reply_to_id,m.created_at,m.edited_at,m.deleted_at,u.username,u.display_name,u.avatar_url FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.id DESC LIMIT 100`,[id])).rows.reverse();
      res.setHeader("Cache-Control","no-store");res.json({ok:true,messages:rows});
    }catch(e){console.error("guest room messages",e);res.status(500).json({ok:false,error:"PUBLIC_ROOM_MESSAGES_FAILED"})}});

    app.post("/api/public/rooms-v2/:id/presence/join",async(req,res)=>{try{
      const id=Number(req.params.id),room=await publicRoom(id);if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
      const g=await ensureGuest(req,res);await pool.query(`INSERT INTO guest_room_presence(room_id,guest_id,last_seen) VALUES($1,$2,NOW()) ON CONFLICT(room_id,guest_id) DO UPDATE SET last_seen=NOW()`,[id,g.id]);
      await logActivity(g.id,"room_enter",`/guest/room/${id}`,id,{roomName:room.name});
      res.json({ok:true,guest:{id:g.id,label:`زائر ${g.id}`}});
    }catch(e){console.error("guest room join",e);res.status(500).json({ok:false,error:"GUEST_ROOM_JOIN_FAILED"})}});

    app.post("/api/public/rooms-v2/:id/presence/heartbeat",async(req,res)=>{try{
      const id=Number(req.params.id),g=await ensureGuest(req,res);await pool.query(`UPDATE guest_room_presence SET last_seen=NOW() WHERE room_id=$1 AND guest_id=$2`,[id,g.id]);res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"GUEST_ROOM_HEARTBEAT_FAILED"})}});

    app.post("/api/public/rooms-v2/:id/presence/leave",async(req,res)=>{try{
      const id=Number(req.params.id),uuid=guestUuid(req);if(uuid){const g=(await pool.query(`SELECT id FROM guest_visitors WHERE guest_uuid=$1`,[uuid])).rows[0];if(g){await pool.query(`DELETE FROM guest_room_presence WHERE room_id=$1 AND guest_id=$2`,[id,g.id]);await logActivity(g.id,"room_leave",`/guest/room/${id}`,id)}}res.json({ok:true});
    }catch{res.json({ok:true})}});

    // Guest listeners participate in WebRTC signaling but can never publish audio.
    app.post("/api/public/rooms-v2/:id/voice/join",async(req,res)=>{try{
      const id=Number(req.params.id),room=await publicRoom(id);if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
      const g=await ensureGuest(req,res);await purgeGuestRoom(id);
      await pool.query(`INSERT INTO guest_room_voice_presence(room_id,guest_id,last_seen) VALUES($1,$2,NOW()) ON CONFLICT(room_id,guest_id) DO UPDATE SET last_seen=NOW()`,[id,g.id]);
      await pool.query(`INSERT INTO guest_room_presence(room_id,guest_id,last_seen) VALUES($1,$2,NOW()) ON CONFLICT(room_id,guest_id) DO UPDATE SET last_seen=NOW()`,[id,g.id]);
      res.json({ok:true,viewerId:-Number(g.id)});
    }catch(e){console.error("guest voice join",e);res.status(500).json({ok:false,error:"GUEST_VOICE_JOIN_FAILED"})}});

    app.get("/api/public/rooms-v2/:id/voice/state",async(req,res)=>{try{
      const id=Number(req.params.id),room=await publicRoom(id);if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
      const g=await ensureGuest(req,res);await purgeGuestRoom(id);
      await pool.query(`UPDATE guest_room_voice_presence SET last_seen=NOW() WHERE room_id=$1 AND guest_id=$2`,[id,g.id]);
      const users=(await pool.query(`SELECT p.user_id,p.role,p.requested,p.muted,p.seat_index,p.joined_at,p.last_seen,u.username,u.display_name,u.avatar_url,FALSE guest FROM room_voice_presence p JOIN users u ON u.id=p.user_id WHERE p.room_id=$1 AND p.last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds'`,[id])).rows;
      const guests=(await pool.query(`SELECT -g.id user_id,'listener'::text role,FALSE requested,FALSE muted,NULL::int seat_index,p.joined_at,p.last_seen,NULL::text username,('زائر '||g.id)::text display_name,NULL::text avatar_url,TRUE guest FROM guest_room_voice_presence p JOIN guest_visitors g ON g.id=p.guest_id WHERE p.room_id=$1 AND p.last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds'`,[id])).rows;
      const rtc=turnConfig(`guest-${g.id}`);res.json({ok:true,viewerId:-Number(g.id),manager:false,guest:true,roomName:room.name,participants:[...users,...guests],iceServers:rtc.iceServers,turnConfigured:rtc.turnConfigured,tlsConfigured:rtc.tlsConfigured,forceRelay:rtc.forceRelay,seatCount:Number(room.speaker_seat_count||8),maxSpeakers:Number(room.speaker_seat_count||8)});
    }catch(e){console.error("guest voice state",e);res.status(500).json({ok:false,error:"GUEST_VOICE_STATE_FAILED"})}});

    app.post("/api/public/rooms-v2/:id/voice/heartbeat",async(req,res)=>{try{
      const id=Number(req.params.id),g=await ensureGuest(req,res);await Promise.all([pool.query(`UPDATE guest_room_voice_presence SET last_seen=NOW() WHERE room_id=$1 AND guest_id=$2`,[id,g.id]),pool.query(`UPDATE guest_room_presence SET last_seen=NOW() WHERE room_id=$1 AND guest_id=$2`,[id,g.id])]);res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"GUEST_VOICE_HEARTBEAT_FAILED"})}});

    app.post("/api/public/rooms-v2/:id/voice/leave",async(req,res)=>{try{
      const id=Number(req.params.id),uuid=guestUuid(req);if(uuid){const g=(await pool.query(`SELECT id FROM guest_visitors WHERE guest_uuid=$1`,[uuid])).rows[0];if(g){await pool.query(`DELETE FROM guest_room_voice_presence WHERE room_id=$1 AND guest_id=$2`,[id,g.id]);await pool.query(`DELETE FROM guest_room_voice_signals WHERE room_id=$1 AND (sender_guest_id=$2 OR recipient_guest_id=$2)`,[id,g.id])}}res.json({ok:true});
    }catch{res.json({ok:true})}});

    app.post("/api/public/rooms-v2/:id/voice/signals",async(req,res)=>{try{
      const id=Number(req.params.id),room=await publicRoom(id);if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
      const g=await ensureGuest(req,res),recipient=Number(req.body?.recipientId),kind=String(req.body?.kind||""),payload=req.body?.payload;
      if(!recipient||recipient<1||!["offer","answer","ice"].includes(kind)||!payload||typeof payload!=="object")return res.status(400).json({ok:false,error:"BAD_SIGNAL"});
      const self=(await pool.query(`SELECT 1 FROM guest_room_voice_presence WHERE room_id=$1 AND guest_id=$2 AND last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds'`,[id,g.id])).rows[0],other=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND role='speaker' AND last_seen>NOW()-INTERVAL '${ACTIVE_VOICE_SECONDS} seconds'`,[id,recipient])).rows[0];
      if(!self||!other)return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});
      const row=(await pool.query(`INSERT INTO guest_room_voice_signals(room_id,sender_guest_id,recipient_user_id,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id`,[id,g.id,recipient,kind,payload])).rows[0];res.status(201).json({ok:true,id:row.id});
    }catch(e){console.error("guest voice signal",e);res.status(500).json({ok:false,error:"GUEST_VOICE_SIGNAL_FAILED"})}});

    app.get("/api/public/rooms-v2/:id/voice/signals",async(req,res)=>{try{
      const id=Number(req.params.id),g=await ensureGuest(req,res),since=Math.max(0,Number(req.query.since)||0);
      const rows=(await pool.query(`SELECT id,sender_user_id sender_id,kind,payload,created_at FROM guest_room_voice_signals WHERE room_id=$1 AND recipient_guest_id=$2 AND id>$3 ORDER BY id ASC LIMIT 300`,[id,g.id,since])).rows;res.json({ok:true,signals:rows});
    }catch(e){res.status(500).json({ok:false,error:"GUEST_VOICE_SIGNAL_LOAD_FAILED"})}});

    app.patch("/api/rooms/:id/experience",async(req,res)=>{try{
      const u=await requireAuth(req,res);if(!u)return;const id=Number(req.params.id),a=await roomOwnerAccess(id,u);if(!a.ok)return res.status(a.error==="ROOM_NOT_FOUND"?404:403).json({ok:false,error:a.error});
      const imageUrl=clean(req.body?.imageUrl,1000)||null,seatCount=Math.max(1,Math.min(16,Number(req.body?.speakerSeatCount)||8));
      const row=(await pool.query(`UPDATE rooms SET image_url=$1,speaker_seat_count=$2 WHERE id=$3 RETURNING id,name,slug,image_url,speaker_seat_count`,[imageUrl,seatCount,id])).rows[0];res.json({ok:true,room:row});
    }catch(e){console.error("room experience settings",e);res.status(500).json({ok:false,error:"ROOM_EXPERIENCE_FAILED"})}});

    app.post("/api/guest/link",async(req,res)=>{try{
      const u=await requireAuth(req,res);if(!u)return;const uuid=guestUuid(req);if(!uuid)return res.json({ok:true,linked:false});
      const row=(await pool.query(`UPDATE guest_visitors SET linked_user_id=$2,linked_at=COALESCE(linked_at,NOW()),last_seen_at=NOW() WHERE guest_uuid=$1 RETURNING id`,[uuid,u.id])).rows[0];res.json({ok:true,linked:Boolean(row),guestId:row?.id||null});
    }catch(e){res.status(500).json({ok:false,error:"GUEST_LINK_FAILED"})}});

    app.get("/api/admin/advanced/guests",async(req,res)=>{try{
      const admin=await requireAdmin(req,res);if(!admin)return;const q=clean(req.query.q,100),limit=Math.min(300,Math.max(20,Number(req.query.limit)||100)),like=`%${q}%`,numeric=/^\d+$/.test(q)?Number(q):null;
      const rows=(await pool.query(`SELECT g.id,g.first_seen_at,g.last_seen_at,g.last_ip::text last_ip,g.device_type,g.os_name,g.browser_name,g.visit_count,g.linked_user_id,g.linked_at,u.username linked_username,u.display_name linked_display_name,(SELECT COUNT(*)::int FROM guest_activity a WHERE a.guest_id=g.id) activity_count FROM guest_visitors g LEFT JOIN users u ON u.id=g.linked_user_id WHERE ($1='' OR g.last_ip::text ILIKE $2 OR g.last_user_agent ILIKE $2 OR COALESCE(u.username,'') ILIKE $2 OR ($3::bigint IS NOT NULL AND g.id=$3)) ORDER BY g.last_seen_at DESC LIMIT $4`,[q,like,numeric,limit])).rows;
      const summary=(await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE last_seen_at>NOW()-INTERVAL '15 minutes')::int recent,COUNT(*) FILTER(WHERE linked_user_id IS NOT NULL)::int linked FROM guest_visitors`)).rows[0];res.json({ok:true,summary,guests:rows});
    }catch(e){console.error("admin guests",e);res.status(500).json({ok:false,error:"ADMIN_GUESTS_FAILED"})}});

    app.get("/api/admin/advanced/guests/:id/activity",async(req,res)=>{try{
      const admin=await requireAdmin(req,res);if(!admin)return;const id=Number(req.params.id),guest=(await pool.query(`SELECT g.*,u.username linked_username,u.display_name linked_display_name FROM guest_visitors g LEFT JOIN users u ON u.id=g.linked_user_id WHERE g.id=$1`,[id])).rows[0];if(!guest)return res.status(404).json({ok:false,error:"GUEST_NOT_FOUND"});const activity=(await pool.query(`SELECT id,event_type,path,room_id,metadata,created_at FROM guest_activity WHERE guest_id=$1 ORDER BY id DESC LIMIT 250`,[id])).rows;res.json({ok:true,guest,activity});
    }catch(e){res.status(500).json({ok:false,error:"ADMIN_GUEST_ACTIVITY_FAILED"})}});

    // Link a known guest identity as soon as it starts making authenticated API calls.
    app.use(async(req,_res,next)=>{try{
      const uuid=guestUuid(req);if(!uuid||!req.path.startsWith("/api/")||req.path.startsWith("/api/public/")||req.path.startsWith("/api/admin/"))return next();
      const likelyAuth=Boolean(req.headers.authorization)||String(req.headers.cookie||"").includes("session");if(!likelyAuth)return next();
      const u=await sessionUser(req).catch(()=>null);if(u?.id)await pool.query(`UPDATE guest_visitors SET linked_user_id=COALESCE(linked_user_id,$2),linked_at=COALESCE(linked_at,NOW()),last_seen_at=NOW() WHERE guest_uuid=$1`,[uuid,u.id]);
    }catch{}next()});
  }
  return prior(app,...args);
};
