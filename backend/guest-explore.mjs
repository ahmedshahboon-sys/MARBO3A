import http from "http";
import {pool} from "./runtime.mjs";
const prior=http.createServer.bind(http);
const fresh=res=>res.setHeader("Cache-Control","no-store, max-age=0");
http.createServer=function guestExploreCreateServer(app,...args){if(typeof app==="function"&&app?.use){
 app.get("/api/public/live",async(_req,res)=>{try{const rows=(await pool.query(`SELECT l.id,l.title,l.started_at,l.host_id,u.username,u.display_name,u.avatar_url,(SELECT COUNT(*)::int FROM live_viewers v WHERE v.session_id=l.id AND v.last_seen_at>NOW()-INTERVAL '30 seconds') viewers_count FROM live_sessions l JOIN users u ON u.id=l.host_id WHERE l.status='active' AND u.account_status='active' ORDER BY l.started_at DESC LIMIT 12`)).rows;fresh(res);res.json({ok:true,lives:rows})}catch(e){console.error("public live",e);fresh(res);res.json({ok:true,lives:[]})}});
 }
 return prior(app,...args);
};
