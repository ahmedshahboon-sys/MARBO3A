import http from "http";
import {pool,redis,ensureRedis,requireAuth} from "./runtime.mjs";

const prior=http.createServer.bind(http);
async function auth(req,res){await ensureRedis();return requireAuth(req,res)}

http.createServer=function launchCompletionCreateServer(app,...args){if(typeof app==="function"&&app?.use){
  ensureRedis().catch(e=>console.error("launch completion init",e));

  app.get("/api/home/overview",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const[stats,pending,rooms,notifs]=await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*)::int FROM friendships WHERE status='accepted' AND(requester_id=$1 OR addressee_id=$1)) friends,(SELECT COUNT(*)::int FROM room_members WHERE user_id=$1) rooms,(SELECT COUNT(*)::int FROM notifications WHERE user_id=$1 AND read_at IS NULL AND suppressed=FALSE) unread,(SELECT COUNT(*)::int FROM direct_conversations WHERE user1_id=$1 OR user2_id=$1) chats`,[u.id]),
    pool.query(`SELECT f.id,u.id user_id,u.username,u.display_name,u.avatar_url,f.created_at FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=$1 AND f.status='pending' ORDER BY f.id DESC LIMIT 4`,[u.id]),
    pool.query(`SELECT r.id,r.name,r.slug,r.description,r.image_url,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count,(SELECT MAX(m.created_at) FROM messages m WHERE m.room_id=r.id) last_message_at FROM rooms r WHERE r.is_public=TRUE ORDER BY COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.room_id=r.id),r.created_at) DESC LIMIT 5`),
    pool.query(`SELECT n.id,n.type,n.title,n.body,n.ref_id,n.read_at,n.created_at,a.username actor_username,a.display_name actor_name,a.avatar_url actor_avatar FROM notifications n LEFT JOIN users a ON a.id=n.actor_id WHERE n.user_id=$1 AND n.suppressed=FALSE ORDER BY n.id DESC LIMIT 5`,[u.id])
  ]);let online=0;try{online=await redis.zCount("presence:users",Date.now()-120000,"+inf")}catch{}res.json({ok:true,stats:{...stats.rows[0],online:Number(online)||0},pending:pending.rows,rooms:rooms.rows,notifications:notifs.rows})}catch(e){console.error("home overview",e);res.status(500).json({ok:false,error:"HOME_OVERVIEW_FAILED"})}});

  app.put("/api/notifications/:id/read",async(req,res)=>{const u=await auth(req,res);if(!u)return;const id=Number(req.params.id);if(!Number.isSafeInteger(id))return res.status(400).json({ok:false,error:"INVALID_NOTIFICATION"});const row=(await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at`,[id,u.id])).rows[0];if(!row)return res.status(404).json({ok:false,error:"NOTIFICATION_NOT_FOUND"});res.json({ok:true,notification:row})});
  app.put("/api/notifications/read-all",async(req,res)=>{const u=await auth(req,res);if(!u)return;const r=await pool.query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`,[u.id]);res.json({ok:true,updated:r.rowCount})});
}
return prior(app,...args)};
