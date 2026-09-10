import http from "http";
import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const previous=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("V1 Redis:",e));
const SESSION_TTL=7*24*60*60;
let ready;
const clean=(v="",n=500)=>String(v??"").trim().replace(/\s+/g," ").slice(0,n);
const hash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const bearer=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";

async function infra(){
 if(!ready) ready=(async()=>{
   if(!redis.isOpen) await redis.connect();
   await pool.query(`CREATE TABLE IF NOT EXISTS durable_sessions(token_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
   await pool.query(`CREATE INDEX IF NOT EXISTS durable_sessions_user_idx ON durable_sessions(user_id,expires_at DESC)`);
   await pool.query(`CREATE TABLE IF NOT EXISTS direct_message_reads(conversation_id BIGINT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,last_read_message_id BIGINT,last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(conversation_id,user_id))`);
   await pool.query(`CREATE TABLE IF NOT EXISTS room_bans(room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,reason TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(room_id,user_id))`);
   await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pinned_message_id BIGINT`);
   await pool.query(`CREATE INDEX IF NOT EXISTS room_members_user_room_idx ON room_members(user_id,room_id)`);
   await pool.query(`CREATE INDEX IF NOT EXISTS dm_conversation_sender_idx ON direct_messages(conversation_id,sender_id,id DESC)`);
   await pool.query(`CREATE INDEX IF NOT EXISTS users_search_idx ON users((LOWER(username)),(LOWER(display_name)))`);
   await pool.query(`DELETE FROM durable_sessions WHERE expires_at<NOW()`);
 })().catch(e=>{ready=null;throw e});
 return ready;
}

async function recoverSession(req){
 await infra();
 const t=bearer(req); if(!t) return null;
 let id=await redis.get(`session:${t}`);
 if(!id){
   const row=(await pool.query(`SELECT user_id FROM durable_sessions WHERE token_hash=$1 AND expires_at>NOW()`,[hash(t)])).rows[0];
   if(row){id=String(row.user_id);await redis.set(`session:${t}`,id,{EX:SESSION_TTL});}
 }
 if(id) await pool.query(`UPDATE durable_sessions SET last_seen=NOW(),expires_at=GREATEST(expires_at,NOW()+INTERVAL '7 days') WHERE token_hash=$1`,[hash(t)]).catch(()=>{});
 return id;
}
async function user(req){
 const id=await recoverSession(req);if(!id)return null;
 return (await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`,[id])).rows[0]||null;
}
async function auth(req,res){const u=await user(req);if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null}if(u.username!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null}return u}
async function roomRole(roomId,userId){return (await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,userId])).rows[0]?.role||null}

http.createServer=function(app,...args){
 if(typeof app==="function"&&app?.use){
   infra().catch(e=>console.error("v1 infra",e));

   // Recover Redis sessions from PostgreSQL before legacy auth checks run.
   app.use(async(req,_res,next)=>{try{if(bearer(req))await recoverSession(req)}catch(e){console.error("session recovery",e.message)}next()});

   // Persist fresh login/register tokens without changing legacy auth payloads.
   app.use((req,res,next)=>{
     const authResponse=req.method==="POST"&&(req.path==="/api/auth/login"||req.path==="/api/auth/register");
     if(!authResponse)return next();
     const original=res.json.bind(res);
     res.json=(data)=>{if(data?.token&&data?.user?.id){infra().then(()=>pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '7 days',NOW()) ON CONFLICT(token_hash) DO UPDATE SET user_id=EXCLUDED.user_id,expires_at=EXCLUDED.expires_at,last_seen=NOW()`,[hash(data.token),data.user.id])).catch(e=>console.error("persist session",e.message))}return original(data)};
     next();
   });
   app.use((req,res,next)=>{if(req.method==="POST"&&req.path==="/api/auth/logout"){const t=bearer(req);res.on("finish",()=>{if(t)pool.query(`DELETE FROM durable_sessions WHERE token_hash=$1`,[hash(t)]).catch(()=>{})})}next()});

   app.get("/api/search",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const q=clean(req.query.q,80);if(q.length<2)return res.json({ok:true,users:[],rooms:[],posts:[]});const like=`%${q}%`;const [users,rooms,posts]=await Promise.all([
     pool.query(`SELECT id,username,display_name,avatar_url,bio FROM users WHERE account_status='active' AND id<>$1 AND (username ILIKE $2 OR display_name ILIKE $2) ORDER BY display_name LIMIT 20`,[u.id,like]),
     pool.query(`SELECT id,name,slug,description,(SELECT COUNT(*)::int FROM room_members m WHERE m.room_id=rooms.id) members_count FROM rooms WHERE is_public=TRUE AND (name ILIKE $1 OR description ILIKE $1) ORDER BY id DESC LIMIT 20`,[like]),
     pool.query(`SELECT p.id,p.body,p.image_url,p.created_at,x.username,x.display_name,x.avatar_url FROM posts p JOIN users x ON x.id=p.user_id WHERE p.deleted_at IS NULL AND p.body ILIKE $1 ORDER BY p.id DESC LIMIT 20`,[like])
   ]);res.json({ok:true,users:users.rows,rooms:rooms.rows,posts:posts.rows})}catch(e){console.error("global search",e);res.status(500).json({ok:false,error:"SEARCH_FAILED"})}});

   app.post("/api/chats/:id/read",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const id=Number(req.params.id);const conv=(await pool.query(`SELECT 1 FROM direct_conversations WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,[id,u.id])).rows[0];if(!conv)return res.status(403).json({ok:false,error:"FORBIDDEN"});const last=(await pool.query(`SELECT id FROM direct_messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 1`,[id])).rows[0]?.id||null;await pool.query(`INSERT INTO direct_message_reads(conversation_id,user_id,last_read_message_id,last_read_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_message_id=EXCLUDED.last_read_message_id,last_read_at=NOW()`,[id,u.id,last]);res.json({ok:true,lastReadMessageId:last})}catch(e){res.status(500).json({ok:false,error:"READ_UPDATE_FAILED"})}});

   app.get("/api/chats/:id/receipt",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const id=Number(req.params.id);const conv=(await pool.query(`SELECT user1_id,user2_id FROM direct_conversations WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,[id,u.id])).rows[0];if(!conv)return res.status(403).json({ok:false,error:"FORBIDDEN"});const peer=String(conv.user1_id)===String(u.id)?conv.user2_id:conv.user1_id;const r=(await pool.query(`SELECT last_read_message_id,last_read_at FROM direct_message_reads WHERE conversation_id=$1 AND user_id=$2`,[id,peer])).rows[0]||null;res.json({ok:true,receipt:r})}catch(e){res.status(500).json({ok:false,error:"RECEIPT_FAILED"})}});

   app.get("/api/rooms/:id/members",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const id=Number(req.params.id);if(!await roomRole(id,u.id)&&u.username!=="ahmed")return res.status(403).json({ok:false,error:"NOT_ROOM_MEMBER"});const rows=(await pool.query(`SELECT m.user_id,m.role,m.joined_at,x.username,x.display_name,x.avatar_url,x.last_seen_at,EXISTS(SELECT 1 FROM room_bans b WHERE b.room_id=m.room_id AND b.user_id=m.user_id) banned FROM room_members m JOIN users x ON x.id=m.user_id WHERE m.room_id=$1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,m.joined_at`,[id])).rows;res.json({ok:true,members:rows})}catch(e){res.status(500).json({ok:false,error:"ROOM_MEMBERS_FAILED"})}});

   app.post("/api/rooms/:id/members/:userId/moderate",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),target=Number(req.params.userId),action=clean(req.body?.action,20),reason=clean(req.body?.reason,160);const role=await roomRole(roomId,u.id);if(u.username!=="ahmed"&&!['owner','moderator'].includes(role))return res.status(403).json({ok:false,error:"FORBIDDEN"});const targetRole=await roomRole(roomId,target);if(targetRole==='owner'&&u.username!=="ahmed")return res.status(403).json({ok:false,error:"OWNER_PROTECTED"});if(action==='promote'){if(role!=='owner'&&u.username!=="ahmed")return res.status(403).json({ok:false,error:"OWNER_ONLY"});await pool.query(`UPDATE room_members SET role='moderator' WHERE room_id=$1 AND user_id=$2`,[roomId,target])}else if(action==='demote'){if(role!=='owner'&&u.username!=="ahmed")return res.status(403).json({ok:false,error:"OWNER_ONLY"});await pool.query(`UPDATE room_members SET role='member' WHERE room_id=$1 AND user_id=$2`,[roomId,target])}else if(action==='kick'){await pool.query(`DELETE FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,target])}else if(action==='ban'){await pool.query(`INSERT INTO room_bans(room_id,user_id,created_by,reason) VALUES($1,$2,$3,$4) ON CONFLICT(room_id,user_id) DO UPDATE SET created_by=EXCLUDED.created_by,reason=EXCLUDED.reason,created_at=NOW()`,[roomId,target,u.id,reason]);await pool.query(`DELETE FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,target])}else if(action==='unban'){await pool.query(`DELETE FROM room_bans WHERE room_id=$1 AND user_id=$2`,[roomId,target])}else return res.status(400).json({ok:false,error:"INVALID_ACTION"});res.json({ok:true,action})}catch(e){console.error("room moderation",e);res.status(500).json({ok:false,error:"ROOM_MODERATION_FAILED"})}});

   app.use(async(req,res,next)=>{if(req.method==='POST'&&/^\/api\/rooms\/\d+\/join$/.test(req.path)){try{const u=await user(req);const roomId=Number(req.path.split('/')[3]);if(u&&(await pool.query(`SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0])return res.status(403).json({ok:false,error:'ROOM_BANNED'})}catch{}}next()});

   app.post("/api/rooms/:id/pin/:messageId",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),messageId=Number(req.params.messageId),role=await roomRole(roomId,u.id);if(u.username!=="ahmed"&&!['owner','moderator'].includes(role))return res.status(403).json({ok:false,error:"FORBIDDEN"});if(!(await pool.query(`SELECT 1 FROM messages WHERE id=$1 AND room_id=$2 AND deleted_at IS NULL`,[messageId,roomId])).rows[0])return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});await pool.query(`UPDATE rooms SET pinned_message_id=$1 WHERE id=$2`,[messageId,roomId]);res.json({ok:true,pinnedMessageId:messageId})}catch(e){res.status(500).json({ok:false,error:"PIN_FAILED"})}});

   app.get("/api/v1/status",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const [posts,rooms,users,online]=await Promise.all([pool.query(`SELECT COUNT(*)::int c FROM posts WHERE deleted_at IS NULL`),pool.query(`SELECT COUNT(*)::int c FROM rooms`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE account_status='active'`),pool.query(`SELECT COUNT(*)::int c FROM visitor_presence WHERE last_seen>NOW()-INTERVAL '2 minutes'`)]);res.json({ok:true,version:"1.0-readiness",counts:{posts:posts.rows[0].c,rooms:rooms.rows[0].c,users:users.rows[0].c,online:online.rows[0].c},features:{durableSessions:true,globalSearch:true,readReceipts:true,roomModeration:true,roomPins:true}})}catch(e){res.status(500).json({ok:false,error:"STATUS_FAILED"})}});
 }
 return previous(app,...args)
};
