import http from "http";
import pg from "pg";
import {createClient} from "redis";

const priorCreateServer=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("Social Redis:",e));
let ready;
async function infra(){if(!ready)ready=(async()=>{if(!redis.isOpen)await redis.connect();await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url TEXT`);await pool.query(`CREATE TABLE IF NOT EXISTS room_join_requests(id BIGSERIAL PRIMARY KEY,room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(room_id,user_id))`);await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ar'`).catch(()=>{});})().catch(e=>{ready=null;throw e});return ready;}
const clean=(v="",n=300)=>String(v).trim().replace(/\s+/g," ").slice(0,n);
const tok=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
async function user(req){await infra();const t=tok(req);if(!t)return null;const id=await redis.get(`session:${t}`);if(!id)return null;return (await pool.query(`SELECT id,email,username,display_name,bio,avatar_url,cover_url,account_status,created_at,last_seen_at FROM users WHERE id=$1`,[id])).rows[0]||null;}
async function auth(req,res){const u=await user(req);if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null;}if(u.username!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null;}return u;}
async function ownerOrAdmin(roomId,u){if(u.username==="ahmed")return true;return Boolean((await pool.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2 AND role='owner'`,[roomId,u.id])).rows[0]);}
async function blocked(a,b){return Boolean((await pool.query(`SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`,[a,b])).rows[0]);}
async function areFriends(a,b){return Boolean((await pool.query(`SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,[a,b])).rows[0]);}

http.createServer=function socialCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    infra().catch(e=>console.error("Social init:",e));

    // Privacy/block enforcement on legacy friend and direct-chat actions.
    app.use(async(req,res,next)=>{try{
      let target=null,kind="";
      if(req.method==="POST"&&req.path==="/api/friends/request"){target=Number(req.body?.userId);kind="friend";}
      const chat=req.path.match(/^\/api\/chats\/with\/(\d+)$/);if(req.method==="POST"&&chat){target=Number(chat[1]);kind="message";}
      if(!target)return next();const u=await auth(req,res);if(!u)return;if(await blocked(u.id,target))return res.status(403).json({ok:false,error:"USER_BLOCKED"});const p=(await pool.query(`SELECT who_can_message,who_can_add FROM profile_privacy WHERE user_id=$1`,[target])).rows[0]||{who_can_message:"friends",who_can_add:"everyone"};const rule=kind==="message"?p.who_can_message:p.who_can_add;if(rule==="nobody")return res.status(403).json({ok:false,error:"PRIVACY_RESTRICTED"});if(rule==="friends"&&kind==="message"&&!await areFriends(u.id,target))return res.status(403).json({ok:false,error:"FRIENDS_ONLY"});next();
    }catch(e){next(e)}});

    // Handle request-to-join rooms before the stricter invite middleware.
    app.post("/api/rooms/:id/request-join",async(req,res)=>{const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),room=(await pool.query(`SELECT join_policy FROM rooms WHERE id=$1`,[roomId])).rows[0];if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});if(room.join_policy!=="request")return res.status(409).json({ok:false,error:"ROOM_NOT_REQUEST_BASED"});if((await pool.query(`SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0])return res.status(403).json({ok:false,error:"ROOM_BANNED"});const row=(await pool.query(`INSERT INTO room_join_requests(room_id,user_id,status) VALUES($1,$2,'pending') ON CONFLICT(room_id,user_id) DO UPDATE SET status='pending',updated_at=NOW() RETURNING id,status,created_at`,[roomId,u.id])).rows[0];res.status(201).json({ok:true,request:row});});
    app.get("/api/rooms/:id/join-requests",async(req,res)=>{const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id);if(!await ownerOrAdmin(roomId,u))return res.status(403).json({ok:false,error:"ROOM_OWNER_ONLY"});const rows=(await pool.query(`SELECT r.id,r.user_id,r.status,r.created_at,u.username,u.display_name FROM room_join_requests r JOIN users u ON u.id=r.user_id WHERE r.room_id=$1 ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.id DESC LIMIT 200`,[roomId])).rows;res.json({ok:true,requests:rows});});
    app.post("/api/rooms/:id/join-requests/:requestId/respond",async(req,res)=>{const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),requestId=Number(req.params.requestId),action=req.body?.action;if(!await ownerOrAdmin(roomId,u))return res.status(403).json({ok:false,error:"ROOM_OWNER_ONLY"});if(!["accept","reject"].includes(action))return res.status(400).json({ok:false,error:"INVALID_ACTION"});const r=(await pool.query(`UPDATE room_join_requests SET status=$1,updated_at=NOW() WHERE id=$2 AND room_id=$3 RETURNING user_id`,[action==="accept"?"accepted":"rejected",requestId,roomId])).rows[0];if(!r)return res.status(404).json({ok:false,error:"REQUEST_NOT_FOUND"});if(action==="accept")await pool.query(`INSERT INTO room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[roomId,r.user_id]);res.json({ok:true});});

    // Extended profile and location.
    app.get("/api/profile/extended",async(req,res)=>{const u=await auth(req,res);if(!u)return;const loc=(await pool.query(`SELECT city,latitude,longitude,share_precise FROM user_locations WHERE user_id=$1`,[u.id])).rows[0]||null;const privacy=(await pool.query(`SELECT * FROM profile_privacy WHERE user_id=$1`,[u.id])).rows[0]||null;res.json({ok:true,user:u,location:loc,privacy});});
    app.patch("/api/profile/extended",async(req,res)=>{const u=await auth(req,res);if(!u)return;const avatar=clean(req.body?.avatarUrl,500)||null,cover=clean(req.body?.coverUrl,500)||null,bio=clean(req.body?.bio??u.bio,160);await pool.query(`UPDATE users SET avatar_url=COALESCE($1,avatar_url),cover_url=COALESCE($2,cover_url),bio=$3,updated_at=NOW() WHERE id=$4`,[avatar,cover,bio,u.id]);if(req.body?.city!==undefined){const city=clean(req.body.city,80),lat=Number(req.body?.latitude),lng=Number(req.body?.longitude),share=Boolean(req.body?.sharePrecise);await pool.query(`INSERT INTO user_locations(user_id,city,latitude,longitude,share_precise,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET city=EXCLUDED.city,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,share_precise=EXCLUDED.share_precise,updated_at=NOW()`,[u.id,city,Number.isFinite(lat)?lat:null,Number.isFinite(lng)?lng:null,share]);}res.json({ok:true});});

    // Override public profile with privacy-aware data.
    app.get("/api/public/profile/:username",async(req,res)=>{await infra();const row=(await pool.query(`SELECT u.id,u.username,u.display_name,u.bio,u.avatar_url,u.cover_url,u.created_at,u.last_seen_at,p.show_last_seen,p.show_city,l.city FROM users u LEFT JOIN profile_privacy p ON p.user_id=u.id LEFT JOIN user_locations l ON l.user_id=u.id WHERE LOWER(u.username)=LOWER($1) AND u.account_status='active'`,[clean(req.params.username,24)])).rows[0];if(!row)return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});const online=Boolean(await redis.zScore("presence:users",String(row.id)).then(s=>s&&Number(s)>Date.now()-120000).catch(()=>false));res.json({ok:true,user:{username:row.username,display_name:row.display_name,bio:row.bio,avatar_url:row.avatar_url,cover_url:row.cover_url,created_at:row.created_at,last_seen_at:row.show_last_seen===false?null:row.last_seen_at,city:row.show_city===false?null:row.city,online}});});

    app.patch("/api/rooms/:id/image",async(req,res)=>{const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id);if(!await ownerOrAdmin(roomId,u))return res.status(403).json({ok:false,error:"ROOM_OWNER_ONLY"});const imageUrl=clean(req.body?.imageUrl,500)||null;await pool.query(`UPDATE rooms SET image_url=$1 WHERE id=$2`,[imageUrl,roomId]);res.json({ok:true,imageUrl});});
  }
  return priorCreateServer(app,...args);
};
