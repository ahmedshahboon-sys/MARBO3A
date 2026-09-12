import http from "http";
import {pool,requireAuth} from "./runtime.mjs";
const prior=http.createServer.bind(http);
http.createServer=function roomVoiceDiscoveryServer(app,...args){
 if(typeof app==="function"&&app?.use){
  app.get("/api/rooms/voice/live",async(req,res)=>{try{const u=await requireAuth(req,res);if(!u)return;await pool.query(`DELETE FROM room_voice_presence WHERE last_seen<NOW()-INTERVAL '20 seconds'`);const rows=(await pool.query(`SELECT p.room_id,p.user_id,p.role,p.muted,p.joined_at,p.last_seen,u.username,u.display_name,u.avatar_url FROM room_voice_presence p JOIN users u ON u.id=p.user_id JOIN rooms r ON r.id=p.room_id WHERE p.last_seen>NOW()-INTERVAL '20 seconds' AND r.is_public=TRUE ORDER BY p.room_id,CASE p.role WHEN 'speaker' THEN 0 ELSE 1 END,p.joined_at`)).rows;const rooms={};for(const row of rows){const key=String(row.room_id);rooms[key] ||= {count:0,speakers:0,participants:[]};rooms[key].count++;if(row.role==="speaker"&&!row.muted)rooms[key].speakers++;if(rooms[key].participants.length<5)rooms[key].participants.push({user_id:row.user_id,username:row.username,display_name:row.display_name,avatar_url:row.avatar_url,role:row.role,muted:row.muted})}res.json({ok:true,rooms})}catch(e){console.error("voice discovery",e);res.status(500).json({ok:false,error:"VOICE_DISCOVERY_FAILED"})}});
 }
 return prior(app,...args)
};
