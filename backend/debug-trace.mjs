import http from "http";
import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const previous=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",()=>{});
let ready;

const bearer=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const clean=(v,n=300)=>String(v??"")
  .replace(/[\r\n\t]+/g," ")
  .replace(/(bearer\s+)[a-z0-9._-]+/ig,"$1[redacted]")
  .replace(/(password|token|secret|otp|code)([=:]\s*)[^ &]+/ig,"$1$2[redacted]")
  .slice(0,n);

async function init(){
  if(!ready)ready=(async()=>{
    if(!redis.isOpen)await redis.connect();
    await pool.query(`CREATE TABLE IF NOT EXISTS debug_sessions(
      id UUID PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT,
      viewport TEXT,
      event_count INT NOT NULL DEFAULT 0,
      error_count INT NOT NULL DEFAULT 0
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS debug_session_events(
      id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES debug_sessions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS debug_session_events_session_idx ON debug_session_events(session_id,id DESC)`);
  })().catch(e=>{ready=null;throw e});
  return ready;
}

async function admin(req){
  await init();
  const t=bearer(req);if(!t)return null;
  let id=await redis.get(`session:${t}`);
  if(!id){
    const durable=(await pool.query(`SELECT user_id FROM durable_sessions WHERE token_hash=$1 AND expires_at>NOW()`,[tokenHash(t)]).catch(()=>({rows:[]}))).rows[0];
    if(durable){id=String(durable.user_id);await redis.set(`session:${t}`,id,{EX:7*24*60*60}).catch(()=>{})}
  }
  if(!id)return null;
  const u=(await pool.query(`SELECT id,username FROM users WHERE id=$1`,[id])).rows[0];
  return String(u?.username||"").toLowerCase()==="ahmed"?u:null;
}

function scrub(o){
  const out={};
  for(const[k,v]of Object.entries(o||{})){
    if(/password|token|secret|authorization|otp|code|credential|sdp|candidate$/i.test(k))continue;
    out[k]=typeof v==="string"?clean(v):typeof v==="number"||typeof v==="boolean"?v:null;
  }
  return out;
}

http.createServer=function(app,...args){
  if(typeof app==="function"&&app?.use){
    init().catch(e=>console.error("debug trace init",e.message));

    app.post("/api/debug/session/start",async(req,res)=>{try{
      const u=await admin(req);if(!u)return res.status(403).json({ok:false,error:"ADMIN_ONLY"});
      const id=crypto.randomUUID();
      await pool.query(`INSERT INTO debug_sessions(id,user_id,user_agent,viewport) VALUES($1,$2,$3,$4)`,[id,u.id,clean(req.headers["user-agent"],300),clean(req.body?.viewport,40)]);
      res.json({ok:true,sessionId:id});
    }catch(e){console.error("debug session start",e.message);res.status(500).json({ok:false,error:"DEBUG_SESSION_START_FAILED"})}});

    app.post("/api/debug/session/:id/events",async(req,res)=>{try{
      const u=await admin(req);if(!u)return res.status(403).json({ok:false,error:"ADMIN_ONLY"});
      const sid=String(req.params.id),own=(await pool.query(`SELECT 1 FROM debug_sessions WHERE id=$1 AND user_id=$2`,[sid,u.id])).rows[0];
      if(!own)return res.status(404).json({ok:false,error:"DEBUG_SESSION_NOT_FOUND"});
      const events=Array.isArray(req.body?.events)?req.body.events.slice(0,50):[];let errors=0;
      for(const e of events){const type=clean(e.type,40),path=clean(e.path,160),payload=scrub(e);if(/error|failed|overlap|overflow/.test(type))errors++;await pool.query(`INSERT INTO debug_session_events(session_id,event_type,path,payload) VALUES($1,$2,$3,$4::jsonb)`,[sid,type,path,JSON.stringify(payload)])}
      await pool.query(`UPDATE debug_sessions SET last_event_at=NOW(),event_count=event_count+$2,error_count=error_count+$3 WHERE id=$1`,[sid,events.length,errors]);
      res.json({ok:true});
    }catch(e){console.error("debug event write",e.message);res.status(500).json({ok:false,error:"DEBUG_EVENT_WRITE_FAILED"})}});

    app.get("/api/debug/sessions",async(req,res)=>{try{
      if(!await admin(req))return res.status(403).json({ok:false,error:"ADMIN_ONLY"});
      const rows=(await pool.query(`SELECT id,started_at,last_event_at,event_count,error_count,user_agent FROM debug_sessions ORDER BY started_at DESC LIMIT 50`)).rows;
      res.json({ok:true,sessions:rows});
    }catch(e){console.error("debug sessions list",e.message);res.status(500).json({ok:false,error:"DEBUG_SESSIONS_FAILED"})}});

    app.get("/api/debug/sessions/:id",async(req,res)=>{try{
      if(!await admin(req))return res.status(403).json({ok:false,error:"ADMIN_ONLY"});
      const s=(await pool.query(`SELECT * FROM debug_sessions WHERE id=$1`,[req.params.id])).rows[0];if(!s)return res.status(404).json({ok:false,error:"DEBUG_SESSION_NOT_FOUND"});
      const events=(await pool.query(`SELECT id,event_type,path,created_at,payload FROM debug_session_events WHERE session_id=$1 ORDER BY id`,[req.params.id])).rows;
      const summary={
        errors:events.filter(x=>/error|failed/.test(x.event_type)).length,
        ui:events.filter(x=>/^ui_|overlap|overflow/.test(x.event_type)).length,
        api:events.filter(x=>/^api_/.test(x.event_type)).length,
        clicks:events.filter(x=>x.event_type==="click").length,
        calls:events.filter(x=>/^rtc_/.test(x.event_type)).length,
        media:events.filter(x=>/^media_|^voice_/.test(x.event_type)).length,
        navigation:events.filter(x=>/^navigation_/.test(x.event_type)).length
      };
      res.json({ok:true,session:s,summary,events});
    }catch(e){console.error("debug session read",e.message);res.status(500).json({ok:false,error:"DEBUG_SESSION_READ_FAILED"})}});
  }
  return previous(app,...args);
};
