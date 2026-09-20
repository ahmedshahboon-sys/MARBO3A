import http from "http";
import crypto from "crypto";
import {promisify} from "util";
import {pool,redis,ensureRedis,requireAuth,requireAdmin,clean} from "./runtime.mjs";

const priorCreateServer=http.createServer.bind(http);
const scryptAsync=promisify(crypto.scrypt);
async function auth(req,res){await ensureRedis();return requireAuth(req,res)}
async function admin(req,res){await ensureRedis();return requireAdmin(req,res)}
async function hashPassword(password){const salt=crypto.randomBytes(16);const derived=await scryptAsync(password,salt,64);return `scrypt:${salt.toString("hex")}:${Buffer.from(derived).toString("hex")}`}
async function sendResetEmail(email,code){if(!process.env.BREVO_API_KEY)throw new Error("BREVO_API_KEY missing");const r=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{accept:"application/json","content-type":"application/json","api-key":process.env.BREVO_API_KEY},body:JSON.stringify({sender:{name:"مربوعة",email:"no-reply@marbo3a.ly"},to:[{email}],subject:"استرجاع كلمة مرور مربوعة",htmlContent:`<div dir="rtl" style="font-family:Arial;padding:28px"><h2 style="color:#ff7a00">مربوعة</h2><p>رمز استرجاع كلمة المرور:</p><div style="font-size:34px;font-weight:900;letter-spacing:7px">${code}</div><p>صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.</p></div>`})});if(!r.ok)throw new Error(`BREVO_${r.status}`)}
async function revokeUserSessions(userId){await ensureRedis();for await(const key of redis.scanIterator({MATCH:"session:*",COUNT:200})){const k=String(key);if(String(await redis.get(k))===String(userId))await redis.del(k)}}
const resetRateKey=email=>`pwdreset:rate:${crypto.createHash("sha256").update(String(email||"")).digest("hex").slice(0,24)}`;

http.createServer=function extraCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    ensureRedis().catch(e=>console.error("Extra init:",e));

    app.get("/api/public/users/:username",async(req,res)=>{const username=clean(req.params.username,24).toLowerCase();const row=(await pool.query(`SELECT username,display_name,bio,avatar_url,created_at,last_seen_at FROM users WHERE LOWER(username)=LOWER($1) AND account_status='active'`,[username])).rows[0];if(!row)return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});res.json({ok:true,user:row})});
    app.get("/api/public/rooms/:slug",async(req,res)=>{const slug=clean(req.params.slug,100);const row=(await pool.query(`SELECT r.id,r.name,r.slug,r.description,r.created_at,u.username owner_username,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count FROM rooms r LEFT JOIN users u ON u.id=r.owner_id WHERE r.slug=$1 AND r.is_public=TRUE`,[slug])).rows[0];if(!row)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});res.json({ok:true,room:row})});

    app.post("/api/auth/request-password-reset",async(req,res)=>{await ensureRedis();const email=String(req.body?.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.json({ok:true});const rate=resetRateKey(email);if(!(await redis.set(rate,"1",{NX:true,EX:60})))return res.json({ok:true});const row=(await pool.query(`SELECT id,email FROM users WHERE LOWER(email)=LOWER($1)`,[email])).rows[0];if(!row)return res.json({ok:true});const code=String(crypto.randomInt(100000,1000000));const hash=crypto.createHash("sha256").update(`${row.id}:${code}`).digest("hex");await redis.set(`pwdreset:${row.id}`,hash,{EX:600});try{await sendResetEmail(row.email,code)}catch{await redis.del(`pwdreset:${row.id}`);return res.status(502).json({ok:false,error:"EMAIL_SEND_FAILED"})}res.json({ok:true})});
    app.post("/api/users/:id/block",async(req,res)=>{const u=await auth(req,res);if(!u)return;const target=Number(req.params.id);if(!Number.isInteger(target)||target===Number(u.id))return res.status(400).json({ok:false,error:"INVALID_USER"});await pool.query(`INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[u.id,target]);res.json({ok:true})});
    app.delete("/api/users/:id/block",async(req,res)=>{const u=await auth(req,res);if(!u)return;await pool.query(`DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`,[u.id,Number(req.params.id)]);res.json({ok:true})});
    app.get("/api/blocks",async(req,res)=>{const u=await auth(req,res);if(!u)return;const rows=(await pool.query(`SELECT b.blocked_id,u.username,u.display_name,b.created_at FROM user_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC`,[u.id])).rows;res.json({ok:true,blocks:rows})});

    app.get("/api/admin/reports",async(req,res)=>{const a=await admin(req,res);if(!a)return;const limit=Math.min(200,Math.max(20,Number(req.query.limit)||100)),cursor=Math.max(0,Number(req.query.cursor)||0);const rows=(await pool.query(`SELECT r.*,u.username reporter_username FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE ($1::bigint=0 OR r.id<$1) ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END,r.id DESC LIMIT $2`,[cursor,limit])).rows;res.json({ok:true,reports:rows,nextCursor:rows.length===limit?rows.at(-1)?.id:null})});
    app.patch("/api/admin/reports/:id",async(req,res)=>{const a=await admin(req,res);if(!a)return;const status=["open","reviewed","resolved","dismissed"].includes(req.body?.status)?req.body.status:null;if(!status)return res.status(400).json({ok:false,error:"INVALID_STATUS"});await pool.query(`UPDATE reports SET status=$1,reviewed_at=NOW(),reviewed_by=$2 WHERE id=$3`,[status,a.id,Number(req.params.id)]);res.json({ok:true})});
  }
  return priorCreateServer(app,...args);
};
