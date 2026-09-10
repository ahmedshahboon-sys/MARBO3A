import http from "http";
import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const prior=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("Calls Redis:",e));
let ready;

async function infra(){
  if(!ready)ready=(async()=>{
    if(!redis.isOpen)await redis.connect();
    await pool.query(`CREATE TABLE IF NOT EXISTS rtc_calls(
      id TEXT PRIMARY KEY,
      conversation_id BIGINT NOT NULL,
      caller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      callee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('audio','video')),
      status TEXT NOT NULL DEFAULT 'ringing' CHECK(status IN ('ringing','answered','declined','ended','missed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      answered_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS rtc_calls_callee_status_idx ON rtc_calls(callee_id,status,created_at DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS rtc_call_signals(
      id BIGSERIAL PRIMARY KEY,
      call_id TEXT NOT NULL REFERENCES rtc_calls(id) ON DELETE CASCADE,
      sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('offer','answer','ice')),
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS rtc_call_signals_recipient_idx ON rtc_call_signals(call_id,recipient_id,id)`);
  })().catch(e=>{ready=null;throw e});
  return ready;
}

const tok=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
async function current(req){await infra();const t=tok(req);if(!t)return null;const id=await redis.get(`session:${t}`);if(!id)return null;return (await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`,[id])).rows[0]||null}
async function auth(req,res){const u=await current(req);if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null}if(u.username!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null}return u}
async function callFor(id,u){return (await pool.query(`SELECT c.*,cu.username caller_username,cu.display_name caller_name,cu.avatar_url caller_avatar,tu.username callee_username,tu.display_name callee_name,tu.avatar_url callee_avatar FROM rtc_calls c JOIN users cu ON cu.id=c.caller_id JOIN users tu ON tu.id=c.callee_id WHERE c.id=$1 AND ($2=c.caller_id OR $2=c.callee_id)`,[id,u.id])).rows[0]||null}
function iceConfig(){const iceServers=[{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}];const urls=String(process.env.TURN_URL||"").split(",").map(x=>x.trim()).filter(Boolean);if(urls.length&&process.env.TURN_USERNAME&&process.env.TURN_CREDENTIAL)iceServers.push({urls,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});return iceServers}

http.createServer=function(app,...args){
  if(typeof app==="function"&&app?.use){
    infra().catch(e=>console.error("calls infra",e));
    app.post("/api/calls",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const conv=Number(req.body?.conversationId),kind=req.body?.kind==="video"?"video":"audio";if(!Number.isInteger(conv)||conv<1)return res.status(400).json({ok:false,error:"BAD_CONVERSATION"});const c=(await pool.query(`SELECT id,user1_id,user2_id FROM direct_conversations WHERE id=$1 AND ($2=user1_id OR $2=user2_id)`,[conv,u.id])).rows[0];if(!c)return res.status(403).json({ok:false,error:"CHAT_FORBIDDEN"});const callee=Number(c.user1_id)===Number(u.id)?Number(c.user2_id):Number(c.user1_id);await pool.query(`UPDATE rtc_calls SET status='ended',ended_at=NOW() WHERE status IN ('ringing','answered') AND ((caller_id=$1 AND callee_id=$2) OR (caller_id=$2 AND callee_id=$1))`,[u.id,callee]);const id=crypto.randomUUID();const row=(await pool.query(`INSERT INTO rtc_calls(id,conversation_id,caller_id,callee_id,kind) VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,conv,u.id,callee,kind])).rows[0];res.status(201).json({ok:true,call:row})}catch(e){console.error("create call",e);res.status(500).json({ok:false,error:"CALL_CREATE_FAILED"})}});
    app.get("/api/calls/incoming",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;await pool.query(`UPDATE rtc_calls SET status='missed',ended_at=NOW() WHERE callee_id=$1 AND status='ringing' AND created_at<NOW()-INTERVAL '75 seconds'`,[u.id]);const row=(await pool.query(`SELECT c.*,x.username caller_username,x.display_name caller_name,x.avatar_url caller_avatar FROM rtc_calls c JOIN users x ON x.id=c.caller_id WHERE c.callee_id=$1 AND c.status='ringing' ORDER BY c.created_at DESC LIMIT 1`,[u.id])).rows[0]||null;res.json({ok:true,call:row})}catch(e){console.error("incoming call",e);res.status(500).json({ok:false,error:"CALL_LOAD_FAILED"})}});
    app.get("/api/calls/history",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const rows=(await pool.query(`SELECT c.*,CASE WHEN c.caller_id=$1 THEN tu.display_name ELSE cu.display_name END peer_name,CASE WHEN c.caller_id=$1 THEN tu.username ELSE cu.username END peer_username,CASE WHEN c.caller_id=$1 THEN tu.avatar_url ELSE cu.avatar_url END peer_avatar FROM rtc_calls c JOIN users cu ON cu.id=c.caller_id JOIN users tu ON tu.id=c.callee_id WHERE c.caller_id=$1 OR c.callee_id=$1 ORDER BY c.created_at DESC LIMIT 100`,[u.id])).rows;res.json({ok:true,calls:rows})}catch(e){res.status(500).json({ok:false,error:"CALL_HISTORY_FAILED"})}});
    app.get("/api/calls/:id",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const c=await callFor(req.params.id,u);if(!c)return res.status(404).json({ok:false,error:"CALL_NOT_FOUND"});res.json({ok:true,call:c})}catch(e){res.status(500).json({ok:false,error:"CALL_LOAD_FAILED"})}});
    app.post("/api/calls/:id/answer",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const c=await callFor(req.params.id,u);if(!c)return res.status(404).json({ok:false,error:"CALL_NOT_FOUND"});if(Number(c.callee_id)!==Number(u.id))return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`UPDATE rtc_calls SET status='answered',answered_at=COALESCE(answered_at,NOW()) WHERE id=$1 AND status='ringing' RETURNING *`,[c.id])).rows[0];if(!row)return res.status(409).json({ok:false,error:"CALL_NOT_RINGING"});res.json({ok:true,call:row})}catch(e){res.status(500).json({ok:false,error:"CALL_ANSWER_FAILED"})}});
    app.post("/api/calls/:id/decline",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const c=await callFor(req.params.id,u);if(!c)return res.status(404).json({ok:false,error:"CALL_NOT_FOUND"});if(Number(c.callee_id)!==Number(u.id))return res.status(403).json({ok:false,error:"FORBIDDEN"});await pool.query(`UPDATE rtc_calls SET status='declined',ended_at=NOW() WHERE id=$1 AND status='ringing'`,[c.id]);res.json({ok:true})}catch(e){res.status(500).json({ok:false,error:"CALL_DECLINE_FAILED"})}});
    app.post("/api/calls/:id/end",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const c=await callFor(req.params.id,u);if(!c)return res.status(404).json({ok:false,error:"CALL_NOT_FOUND"});await pool.query(`UPDATE rtc_calls SET status='ended',ended_at=NOW() WHERE id=$1 AND status IN ('ringing','answered')`,[c.id]);res.json({ok:true})}catch(e){res.status(500).json({ok:false,error:"CALL_END_FAILED"})}});
    app.post("/api/calls/:id/signals",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const c=await callFor(req.params.id,u);if(!c)return res.status(404).json({ok:false,error:"CALL_NOT_FOUND"});const kind=String(req.body?.kind||"");if(!["offer","answer","ice"].includes(kind))return res.status(400).json({ok:false,error:"BAD_SIGNAL"});const recipient=Number(c.caller_id)===Number(u.id)?Number(c.callee_id):Number(c.caller_id);const payload=req.body?.payload;if(!payload||typeof payload!=="object")return res.status(400).json({ok:false,error:"BAD_SIGNAL"});const row=(await pool.query(`INSERT INTO rtc_call_signals(call_id,sender_id,recipient_id,kind,payload) VALUES($1,$2,$3,$4,$5) RETURNING id`,[c.id,u.id,recipient,kind,payload])).rows[0];res.status(201).json({ok:true,id:row.id})}catch(e){console.error("call signal",e);res.status(500).json({ok:false,error:"SIGNAL_FAILED"})}});
    app.get("/api/calls/:id/signals",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const c=await callFor(req.params.id,u);if(!c)return res.status(404).json({ok:false,error:"CALL_NOT_FOUND"});const since=Math.max(0,Number(req.query.since)||0);const rows=(await pool.query(`SELECT id,kind,payload,created_at FROM rtc_call_signals WHERE call_id=$1 AND recipient_id=$2 AND id>$3 ORDER BY id ASC LIMIT 200`,[c.id,u.id,since])).rows;res.json({ok:true,signals:rows})}catch(e){res.status(500).json({ok:false,error:"SIGNAL_LOAD_FAILED"})}});
    app.get("/api/calls/config",async(req,res)=>{const u=await auth(req,res);if(!u)return;const iceServers=iceConfig();res.json({ok:true,iceServers,turnConfigured:iceServers.length>1})});
  }
  return prior(app,...args);
};
