import http from "http";
import crypto from "crypto";
import {pool,ensureRedis,requireAdmin,clean as runtimeClean} from "./runtime.mjs";

const previous=http.createServer.bind(http);
const clean=(v,n=300)=>runtimeClean(String(v??"")
  .replace(/[\r\n\t]+/g," ")
  .replace(/(bearer\s+)[a-z0-9._-]+/ig,"$1[redacted]")
  .replace(/(password|token|secret|otp|code)([=:]\s*)[^ &]+/ig,"$1$2[redacted]"),n);
async function admin(req,res){await ensureRedis();return requireAdmin(req,res)}
function scrub(o){const out={};for(const[k,v]of Object.entries(o||{})){if(/password|token|secret|authorization|otp|code|credential|sdp|candidate$/i.test(k))continue;out[k]=typeof v==="string"?clean(v):typeof v==="number"||typeof v==="boolean"?v:null}return out}

http.createServer=function debugTraceCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    pool.query(`DELETE FROM debug_sessions WHERE started_at<NOW()-INTERVAL '14 days'`).catch(()=>{});

    app.post("/api/debug/session/start",async(req,res)=>{try{const u=await admin(req,res);if(!u)return;const id=crypto.randomUUID();await pool.query(`INSERT INTO debug_sessions(id,user_id,user_agent,viewport) VALUES($1,$2,$3,$4)`,[id,u.id,clean(req.headers["user-agent"],300),clean(req.body?.viewport,40)]);res.json({ok:true,sessionId:id})}catch(e){console.error("debug session start",e.message);res.status(500).json({ok:false,error:"DEBUG_SESSION_START_FAILED"})}});

    app.post("/api/debug/session/:id/events",async(req,res)=>{try{const u=await admin(req,res);if(!u)return;const sid=String(req.params.id),own=(await pool.query(`SELECT 1 FROM debug_sessions WHERE id=$1 AND user_id=$2`,[sid,u.id])).rows[0];if(!own)return res.status(404).json({ok:false,error:"DEBUG_SESSION_NOT_FOUND"});const events=Array.isArray(req.body?.events)?req.body.events.slice(0,50):[];let errors=0;for(const e of events){const type=clean(e.type,40),path=clean(e.path,160),payload=scrub(e);if(/error|failed|overlap|overflow/.test(type))errors++;await pool.query(`INSERT INTO debug_session_events(session_id,event_type,path,payload) VALUES($1,$2,$3,$4::jsonb)`,[sid,type,path,JSON.stringify(payload)])}await pool.query(`UPDATE debug_sessions SET last_event_at=NOW(),event_count=event_count+$2,error_count=error_count+$3 WHERE id=$1`,[sid,events.length,errors]);res.json({ok:true})}catch(e){console.error("debug event write",e.message);res.status(500).json({ok:false,error:"DEBUG_EVENT_WRITE_FAILED"})}});

    app.get("/api/debug/sessions",async(req,res)=>{try{const u=await admin(req,res);if(!u)return;const rows=(await pool.query(`SELECT id,started_at,last_event_at,event_count,error_count,user_agent FROM debug_sessions ORDER BY started_at DESC LIMIT 50`)).rows;res.json({ok:true,sessions:rows})}catch(e){console.error("debug sessions list",e.message);res.status(500).json({ok:false,error:"DEBUG_SESSIONS_FAILED"})}});

    app.get("/api/debug/sessions/:id",async(req,res)=>{try{const u=await admin(req,res);if(!u)return;const s=(await pool.query(`SELECT * FROM debug_sessions WHERE id=$1`,[req.params.id])).rows[0];if(!s)return res.status(404).json({ok:false,error:"DEBUG_SESSION_NOT_FOUND"});const events=(await pool.query(`SELECT id,event_type,path,created_at,payload FROM debug_session_events WHERE session_id=$1 ORDER BY id`,[req.params.id])).rows;const summary={errors:events.filter(x=>/error|failed/.test(x.event_type)).length,ui:events.filter(x=>/^ui_|overlap|overflow/.test(x.event_type)).length,api:events.filter(x=>/^api_/.test(x.event_type)).length,clicks:events.filter(x=>x.event_type==="click").length,calls:events.filter(x=>/^rtc_/.test(x.event_type)).length,media:events.filter(x=>/^media_|^voice_/.test(x.event_type)).length,navigation:events.filter(x=>/^navigation_/.test(x.event_type)).length};res.json({ok:true,session:s,summary,events})}catch(e){console.error("debug session read",e.message);res.status(500).json({ok:false,error:"DEBUG_SESSION_READ_FAILED"})}});
  }
  return previous(app,...args);
};
