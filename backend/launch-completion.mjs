import http from "http";
import pg from "pg";
import {createClient} from "redis";

const prior=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("LaunchCompletion Redis:",e));
let ready;

async function infra(){if(!ready)ready=(async()=>{if(!redis.isOpen)await redis.connect();await pool.query(`CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id,id DESC) WHERE read_at IS NULL`);await pool.query(`CREATE INDEX IF NOT EXISTS rooms_created_idx ON rooms(id DESC)`);})().catch(e=>{ready=null;throw e});return ready;}
const tok=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
async function user(req){await infra();const t=tok(req);if(!t)return null;const id=await redis.get(`session:${t}`);if(!id)return null;return (await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`,[id])).rows[0]||null;}
async function auth(req,res){const u=await user(req);if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null;}if(u.username!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null;}return u;}

http.createServer=function(app,...args){if(typeof app==="function"&&app?.use){
  infra().catch(e=>console.error("launch completion init",e));

  app.get("/api/home/overview",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const [stats,pending,rooms,notifs]=await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*)::int FROM friendships WHERE status='accepted' AND(requester_id=$1 OR addressee_id=$1)) friends,(SELECT COUNT(*)::int FROM room_members WHERE user_id=$1) rooms,(SELECT COUNT(*)::int FROM notifications WHERE user_id=$1 AND read_at IS NULL) unread,(SELECT COUNT(*)::int FROM direct_conversations WHERE user1_id=$1 OR user2_id=$1) chats`,[u.id]),
    pool.query(`SELECT f.id,u.id user_id,u.username,u.display_name,u.avatar_url,f.created_at FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=$1 AND f.status='pending' ORDER BY f.id DESC LIMIT 4`,[u.id]),
    pool.query(`SELECT r.id,r.name,r.slug,r.description,r.image_url,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count,(SELECT MAX(m.created_at) FROM messages m WHERE m.room_id=r.id) last_message_at FROM rooms r WHERE r.is_public=TRUE ORDER BY COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.room_id=r.id),r.created_at) DESC LIMIT 5`),
    pool.query(`SELECT n.id,n.type,n.title,n.body,n.ref_id,n.read_at,n.created_at,a.username actor_username,a.display_name actor_name,a.avatar_url actor_avatar FROM notifications n LEFT JOIN users a ON a.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 5`,[u.id])
  ]);
  let online=0;try{online=await redis.zCount("presence:users",Date.now()-120000,"+inf");}catch{}
  res.json({ok:true,stats:{...stats.rows[0],online:Number(online)||0},pending:pending.rows,rooms:rooms.rows,notifications:notifs.rows});}catch(e){console.error("home overview",e);res.status(500).json({ok:false,error:"HOME_OVERVIEW_FAILED"});}});

  app.put("/api/notifications/:id/read",async(req,res)=>{const u=await auth(req,res);if(!u)return;const id=Number(req.params.id);if(!Number.isSafeInteger(id))return res.status(400).json({ok:false,error:"INVALID_NOTIFICATION"});const row=(await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at`,[id,u.id])).rows[0];if(!row)return res.status(404).json({ok:false,error:"NOTIFICATION_NOT_FOUND"});res.json({ok:true,notification:row});});
  app.put("/api/notifications/read-all",async(req,res)=>{const u=await auth(req,res);if(!u)return;const r=await pool.query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`,[u.id]);res.json({ok:true,updated:r.rowCount});});
}
return prior(app,...args)};
