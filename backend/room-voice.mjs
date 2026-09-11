import http from "http";
import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const prior=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("RoomVoice Redis:",e));
let ready;

async function infra(){
  if(!ready)ready=(async()=>{
    if(!redis.isOpen)await redis.connect();
    await pool.query(`CREATE TABLE IF NOT EXISTS room_voice_presence(room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'listener' CHECK(role IN('listener','speaker')),requested BOOLEAN NOT NULL DEFAULT FALSE,muted BOOLEAN NOT NULL DEFAULT FALSE,joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(room_id,user_id))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS room_voice_presence_active_idx ON room_voice_presence(room_id,last_seen DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS room_voice_signals(id BIGSERIAL PRIMARY KEY,room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN('offer','answer','ice')),payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS room_voice_signals_recv_idx ON room_voice_signals(room_id,recipient_id,id)`);
  })().catch(e=>{ready=null;throw e});
  return ready;
}

const tok=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
async function current(req){
  await infra();
  const t=tok(req);if(!t)return null;
  const id=await redis.get(`session:${t}`);if(!id)return null;
  return (await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`,[id])).rows[0]||null;
}
async function auth(req,res){
  const u=await current(req);
  if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null}
  if(u.username!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null}
  return u;
}
async function access(roomId,u){
  const room=(await pool.query(`SELECT id,is_public,owner_id,name FROM rooms WHERE id=$1`,[roomId])).rows[0];if(!room)return null;
  let mem=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0];
  if(!mem&&room.is_public){await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING`,[roomId,u.id]);mem={role:"member"}}
  if(!mem&&u.username!=="ahmed")return null;
  return {room,memberRole:u.username==="ahmed"?"owner":(mem?.role||"member"),manager:u.username==="ahmed"||Number(room.owner_id)===Number(u.id)||["owner","moderator"].includes(mem?.role)};
}

function iceConfig(userId){
  const host=String(process.env.TURN_HOST||process.env.TURN_EXTERNAL_IP||"").trim();
  const secret=String(process.env.TURN_SECRET||"").trim();
  const tlsHost=String(process.env.TURN_TLS_HOST||"").trim();
  const tlsPort=Math.max(1,Number(process.env.TURN_TLS_PORT)||443);
  const out=[];
  if(host){
    out.push({urls:[`stun:${host}:3478`]});
    if(secret){
      const expiry=Math.floor(Date.now()/1000)+3600;
      const username=`${expiry}:${userId}`;
      const credential=crypto.createHmac("sha1",secret).update(username).digest("base64");
      const urls=[`turn:${host}:3478?transport=udp`,`turn:${host}:3478?transport=tcp`];
      if(tlsHost)urls.push(`turns:${tlsHost}:${tlsPort}?transport=tcp`);
      out.push({urls,username,credential});
    }
  }else{
    out.push({urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]});
  }
  return out;
}

http.createServer=function(app,...args){
  if(typeof app==="function"&&app?.use){
    infra().catch(e=>console.error("room voice infra",e));

    app.get("/api/rooms/:id/voice/state",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;
      const roomId=Number(req.params.id),a=await access(roomId,u);if(!a)return res.status(403).json({ok:false,error:"ROOM_FORBIDDEN"});
      await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '20 seconds'`,[roomId]);
      const rows=(await pool.query(`SELECT p.user_id,p.role,p.requested,p.muted,p.joined_at,p.last_seen,u.username,u.display_name,u.avatar_url FROM room_voice_presence p JOIN users u ON u.id=p.user_id WHERE p.room_id=$1 ORDER BY CASE p.role WHEN 'speaker' THEN 0 ELSE 1 END,p.joined_at`,[roomId])).rows;
      res.json({ok:true,viewerId:u.id,manager:a.manager,roomName:a.room.name,participants:rows,iceServers:iceConfig(u.id),turnConfigured:Boolean((process.env.TURN_HOST||process.env.TURN_EXTERNAL_IP)&&process.env.TURN_SECRET),maxSpeakers:6});
    }catch(e){console.error("voice state",e);res.status(500).json({ok:false,error:"VOICE_STATE_FAILED"})}});

    app.post("/api/rooms/:id/voice/join",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;
      const roomId=Number(req.params.id),a=await access(roomId,u);if(!a)return res.status(403).json({ok:false,error:"ROOM_FORBIDDEN"});
      await pool.query(`INSERT INTO room_voice_presence(room_id,user_id,role,last_seen) VALUES($1,$2,'listener',NOW()) ON CONFLICT(room_id,user_id) DO UPDATE SET last_seen=NOW()`,[roomId,u.id]);
      res.json({ok:true});
    }catch(e){res.status(500).json({ok:false,error:"VOICE_JOIN_FAILED"})}});

    app.post("/api/rooms/:id/voice/heartbeat",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;
      await pool.query(`UPDATE room_voice_presence SET last_seen=NOW(),muted=$3 WHERE room_id=$1 AND user_id=$2`,[Number(req.params.id),u.id,Boolean(req.body?.muted)]);
      res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"VOICE_HEARTBEAT_FAILED"})}});

    app.post("/api/rooms/:id/voice/leave",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id);
      await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,u.id]);
      await pool.query(`DELETE FROM room_voice_signals WHERE room_id=$1 AND (sender_id=$2 OR recipient_id=$2)`,[roomId,u.id]);
      res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"VOICE_LEAVE_FAILED"})}});

    app.post("/api/rooms/:id/voice/request",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a)return res.status(403).json({ok:false,error:"ROOM_FORBIDDEN"});
      await pool.query(`UPDATE room_voice_presence SET requested=TRUE,last_seen=NOW() WHERE room_id=$1 AND user_id=$2`,[roomId,u.id]);res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"VOICE_REQUEST_FAILED"})}});

    app.post("/api/rooms/:id/voice/role",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a)return res.status(403).json({ok:false,error:"ROOM_FORBIDDEN"});
      const target=Number(req.body?.userId||u.id),role=req.body?.role==="speaker"?"speaker":"listener";
      if(target!==Number(u.id)&&!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
      if(target===Number(u.id)&&role==="speaker"&&!a.manager){const speakers=Number((await pool.query(`SELECT COUNT(*)::int n FROM room_voice_presence WHERE room_id=$1 AND role='speaker' AND last_seen>NOW()-INTERVAL '20 seconds'`,[roomId])).rows[0].n);if(speakers>0)return res.status(403).json({ok:false,error:"MIC_APPROVAL_REQUIRED"})}
      if(role==="speaker"){const speakers=Number((await pool.query(`SELECT COUNT(*)::int n FROM room_voice_presence WHERE room_id=$1 AND role='speaker' AND user_id<>$2 AND last_seen>NOW()-INTERVAL '20 seconds'`,[roomId,target])).rows[0].n);if(speakers>=6)return res.status(409).json({ok:false,error:"SPEAKER_LIMIT"})}
      await pool.query(`UPDATE room_voice_presence SET role=$3,requested=FALSE,muted=FALSE,last_seen=NOW() WHERE room_id=$1 AND user_id=$2`,[roomId,target,role]);res.json({ok:true});
    }catch(e){console.error("voice role",e);res.status(500).json({ok:false,error:"VOICE_ROLE_FAILED"})}});

    app.post("/api/rooms/:id/voice/kick",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),a=await access(roomId,u);if(!a?.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
      const target=Number(req.body?.userId);await pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,target]);await pool.query(`DELETE FROM room_voice_signals WHERE room_id=$1 AND (sender_id=$2 OR recipient_id=$2)`,[roomId,target]);res.json({ok:true});
    }catch{res.status(500).json({ok:false,error:"VOICE_KICK_FAILED"})}});

    app.post("/api/rooms/:id/voice/signals",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),recipient=Number(req.body?.recipientId),kind=String(req.body?.kind||""),payload=req.body?.payload;
      if(!["offer","answer","ice"].includes(kind)||!recipient||!payload||typeof payload!=="object")return res.status(400).json({ok:false,error:"BAD_SIGNAL"});
      const active=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen>NOW()-INTERVAL '20 seconds'`,[roomId,u.id])).rows[0],other=(await pool.query(`SELECT 1 FROM room_voice_presence WHERE room_id=$1 AND user_id=$2 AND last_seen>NOW()-INTERVAL '20 seconds'`,[roomId,recipient])).rows[0];
      if(!active||!other)return res.status(403).json({ok:false,error:"VOICE_NOT_JOINED"});
      const row=(await pool.query(`INSERT INTO room_voice_signals(room_id,sender_id,recipient_id,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id`,[roomId,u.id,recipient,kind,payload])).rows[0];res.status(201).json({ok:true,id:row.id});
    }catch(e){console.error("voice signal",e);res.status(500).json({ok:false,error:"VOICE_SIGNAL_FAILED"})}});

    app.get("/api/rooms/:id/voice/signals",async(req,res)=>{try{
      const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),since=Math.max(0,Number(req.query.since)||0);
      const rows=(await pool.query(`SELECT id,sender_id,kind,payload,created_at FROM room_voice_signals WHERE room_id=$1 AND recipient_id=$2 AND id>$3 ORDER BY id ASC LIMIT 300`,[roomId,u.id,since])).rows;res.json({ok:true,signals:rows});
    }catch(e){console.error("voice signal load",e);res.status(500).json({ok:false,error:"VOICE_SIGNAL_LOAD_FAILED"})}});
  }
  return prior(app,...args);
};
