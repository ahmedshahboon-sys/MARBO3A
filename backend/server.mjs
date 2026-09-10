import express from "express";
import cors from "cors";
import http from "http";
import crypto from "crypto";
import { promisify } from "util";
import { Server } from "socket.io";
import pg from "pg";
import { createClient } from "redis";

const app = express();
const server = http.createServer(app);
const scryptAsync = promisify(crypto.scrypt);
app.use(cors());
app.use(express.json({ limit: "64kb" }));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", err => console.error("Redis:", err));

const OTP_TTL_SECONDS = 600;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_PER_HOUR = 6;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const VERIFIED_EMAIL_TTL_SECONDS = 1800;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_USERNAME = "ahmed";

const io = new Server(server, { path: "/socket.io", cors: { origin: "*" } });

const normalizeEmail = v => String(v || "").trim().toLowerCase();
const normalizeUsername = v => String(v || "").trim().toLowerCase();
const normalizeDisplayName = v => String(v || "").trim().replace(/\s+/g, " ");
const cleanText = (v = "", max = 500) => String(v).trim().replace(/\s+/g, " ").slice(0, max);
const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const isValidUsername = u => /^[a-z0-9._]{3,24}$/.test(u);
const isValidDisplayName = n => n.length >= 2 && n.length <= 50;
const isValidPassword = p => typeof p === "string" && p.length >= 8 && p.length <= 128;
const otpHash = (email, code) => crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
const isAdminUser = user => normalizeUsername(user?.username) === ADMIN_USERNAME;

function safeEqualHex(a, b) {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch { return false; }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  try {
    const [algo, saltHex, hashHex] = String(stored).split(":");
    if (algo !== "scrypt") return false;
    const derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), 64);
    const expected = Buffer.from(hashHex, "hex");
    const actual = Buffer.from(derived);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${token}`, String(userId), { EX: SESSION_TTL_SECONDS });
  return token;
}

async function sessionFromToken(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ""))) return null;
  const userId = await redis.get(`session:${token}`);
  if (!userId) return null;
  const result = await pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,account_status,ban_reason,created_at FROM users WHERE id=$1`, [userId]);
  if (!result.rows[0]) return null;
  await redis.expire(`session:${token}`, SESSION_TTL_SECONDS);
  return { token, user: result.rows[0] };
}

async function getSessionUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match ? sessionFromToken(match[1]) : null;
}

async function requireAuth(req, res) {
  const session = await getSessionUser(req);
  if (!session) { res.status(401).json({ ok:false, error:"UNAUTHORIZED" }); return null; }
  if (!isAdminUser(session.user) && session.user.account_status !== "active") {
    res.status(403).json({ ok:false, error:session.user.account_status === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_FROZEN", reason:session.user.ban_reason || "" });
    return null;
  }
  return session;
}

async function requireAdmin(req, res) {
  const session = await getSessionUser(req);
  if (!session) { res.status(401).json({ ok:false, error:"UNAUTHORIZED" }); return null; }
  if (!isAdminUser(session.user)) { res.status(403).json({ ok:false, error:"ADMIN_ONLY" }); return null; }
  return session;
}

async function audit({ userId = null, level = "INFO", category = "SYSTEM", action, req = null, statusCode = null, durationMs = null, details = {} }) {
  try {
    const ip = req ? String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim().slice(0,80) : null;
    await pool.query(`INSERT INTO audit_logs(user_id,level,category,action,status_code,duration_ms,ip_address,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [userId,level,category,cleanText(action,200),statusCode,durationMs,ip,JSON.stringify(details || {})]);
  } catch (e) { console.error("audit", e.message); }
}

async function sendOtpEmail(email, code) {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY is missing");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method:"POST",
    headers:{ accept:"application/json", "content-type":"application/json", "api-key":process.env.BREVO_API_KEY },
    body:JSON.stringify({ sender:{name:"مربوعة",email:"no-reply@marbo3a.ly"}, to:[{email}], subject:"رمز التحقق من مربوعة", htmlContent:`<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#111318;font-family:Arial,sans-serif;color:#111318"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:20px;padding:32px;text-align:center"><div style="font-size:28px;font-weight:800;color:#FF7A00">مربوعة</div><p>استخدم رمز التحقق التالي لإكمال العملية:</p><div style="font-size:36px;font-weight:900;letter-spacing:8px;background:#fff4e8;border-radius:14px;padding:18px;margin:18px 0">${code}</div><p style="font-size:14px;color:#6b7280">الرمز صالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أي شخص.</p></div></body></html>` })
  });
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${(await response.text()).slice(0,300)}`);
  return response.json();
}

async function addNotification(userId, type, title, body = "", actorId = null, refId = null) {
  const result = await pool.query(`INSERT INTO notifications(user_id,actor_id,type,title,body,ref_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,type,title,body,ref_id,read_at,created_at`, [userId,actorId,type,title,body,refId]);
  io.to(`user:${userId}`).emit("notification:new", result.rows[0]);
  return result.rows[0];
}

async function boot() {
  await redis.connect();

  await pool.query(`CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL UNIQUE,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,gender TEXT NOT NULL CHECK(gender IN('male','female')),password_hash TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',avatar_url TEXT,email_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT NOT NULL DEFAULT ''`);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users((LOWER(username)))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users((LOWER(email)))`);

  await pool.query(`CREATE TABLE IF NOT EXISTS rooms(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',is_public BOOLEAN NOT NULL DEFAULT TRUE,owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS room_members(room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member' CHECK(role IN('owner','moderator','member')),joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(room_id,user_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS messages(id BIGSERIAL PRIMARY KEY,room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),edited_at TIMESTAMPTZ)`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_message_id BIGINT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS messages_room_id_id_idx ON messages(room_id,id DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS friendships(id BIGSERIAL PRIMARY KEY,requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(requester_id<>addressee_id))`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships(LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',ref_id BIGINT,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,id DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS direct_conversations(id BIGSERIAL PRIMARY KEY,user1_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,user2_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(user1_id<>user2_id))`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS direct_conversations_pair_idx ON direct_conversations(LEAST(user1_id,user2_id),GREATEST(user1_id,user2_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS direct_messages(id BIGSERIAL PRIMARY KEY,conversation_id BIGINT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),edited_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,forwarded_from_message_id BIGINT)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS direct_messages_conv_idx ON direct_messages(conversation_id,id DESC)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,level TEXT NOT NULL DEFAULT 'INFO',category TEXT NOT NULL DEFAULT 'SYSTEM',action TEXT NOT NULL,status_code INT,duration_ms INT,ip_address TEXT,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(id DESC)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS visitor_presence(visitor_id TEXT PRIMARY KEY,user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_ip TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_locations(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,city TEXT NOT NULL DEFAULT '',latitude DOUBLE PRECISION,longitude DOUBLE PRECISION,share_precise BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

  const roomCount = Number((await pool.query(`SELECT COUNT(*)::int count FROM rooms`)).rows[0].count);
  if (!roomCount) await pool.query(`INSERT INTO rooms(name,slug,description,is_public) VALUES('مربوعة العامة','general','تعرف على ناس جدد وشارك الحديث',TRUE),('شباب ليبيا','libya-youth','دردشة ومواضيع يومية',TRUE),('هوايات وتقنية','tech-hobbies','تقنية، ألعاب، سيارات وهوايات',TRUE) ON CONFLICT(slug) DO NOTHING`);

  io.use(async (socket,next) => {
    try { const session = await sessionFromToken(socket.handshake.auth?.token || socket.handshake.query?.token); if (!session || (!isAdminUser(session.user) && session.user.account_status !== "active")) return next(new Error("UNAUTHORIZED")); socket.session=session; next(); } catch(e){ next(e); }
  });
  io.on("connection", socket => {
    const userId=String(socket.session.user.id); socket.join(`user:${userId}`);
    socket.emit("welcome",{app:"MARBO3A",realtime:true,user:socket.session.user});
    socket.on("room:join",async roomId=>{ if((await pool.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,userId])).rows[0]) socket.join(`room:${roomId}`); });
    socket.on("room:leave",roomId=>socket.leave(`room:${roomId}`));
    socket.on("chat:join",async conversationId=>{ const c=(await pool.query(`SELECT 1 FROM direct_conversations WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,[conversationId,userId])).rows[0]; if(c) socket.join(`chat:${conversationId}`); });
  });

  app.get("/health",async(_req,res)=>res.json({ok:true,project:"MARBO3A",database:true,redis:redis.isReady}));
  app.get("/api/health",async(_req,res)=>res.json({ok:true,api:"MARBO3A API",database:"connected",realtime:"ready",redis:redis.isReady?"connected":"disconnected",email:process.env.BREVO_API_KEY?"configured":"missing",time:new Date().toISOString()}));

  app.post("/api/telemetry/ping", async(req,res)=>{
    const visitorId=cleanText(req.body?.visitorId,100); if(!visitorId) return res.status(400).json({ok:false});
    const session=await getSessionUser(req); const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"").split(",")[0].trim().slice(0,80);
    await pool.query(`INSERT INTO visitor_presence(visitor_id,user_id,last_seen,first_seen,last_ip) VALUES($1,$2,NOW(),NOW(),$3) ON CONFLICT(visitor_id) DO UPDATE SET user_id=EXCLUDED.user_id,last_seen=NOW(),last_ip=EXCLUDED.last_ip`,[visitorId,session?.user?.id||null,ip]);
    res.json({ok:true});
  });

  app.post("/api/auth/request-email-otp",async(req,res)=>{
    const email=normalizeEmail(req.body?.email); if(!isValidEmail(email)) return res.status(400).json({ok:false,error:"INVALID_EMAIL"});
    if((await pool.query(`SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`,[email])).rows[0]) return res.status(409).json({ok:false,error:"EMAIL_ALREADY_REGISTERED"});
    const cooldownKey=`otp:cooldown:${email}`,otpKey=`otp:email:${email}`,hourKey=`otp:hour:${email}`;
    if(!(await redis.set(cooldownKey,"1",{NX:true,EX:OTP_RESEND_SECONDS}))) return res.status(429).json({ok:false,error:"OTP_TOO_SOON",retryAfter:Math.max(1,await redis.ttl(cooldownKey))});
    const hourly=await redis.incr(hourKey); if(hourly===1) await redis.expire(hourKey,3600); if(hourly>OTP_MAX_PER_HOUR){await redis.del(cooldownKey);return res.status(429).json({ok:false,error:"OTP_RATE_LIMITED"});}
    const code=String(crypto.randomInt(100000,1000000)); await redis.set(otpKey,JSON.stringify({hash:otpHash(email,code),attempts:0}),{EX:OTP_TTL_SECONDS});
    try{ const delivery=await sendOtpEmail(email,code); await audit({category:"EMAIL",action:`OTP accepted for ${email}`,req,statusCode:200,details:{messageId:delivery?.messageId||null}}); res.json({ok:true,expiresIn:OTP_TTL_SECONDS,resendAfter:OTP_RESEND_SECONDS}); }
    catch(e){await redis.del(otpKey);await redis.del(cooldownKey);await audit({level:"ERROR",category:"EMAIL",action:`OTP send failed for ${email}`,req,statusCode:502,details:{error:e.message}});res.status(502).json({ok:false,error:"EMAIL_SEND_FAILED"});}
  });

  app.post("/api/auth/verify-email-otp",async(req,res)=>{
    const email=normalizeEmail(req.body?.email),code=String(req.body?.code||"").trim(); if(!isValidEmail(email)||!/^\d{6}$/.test(code)) return res.status(400).json({ok:false,error:"INVALID_OTP_REQUEST"});
    const key=`otp:email:${email}`,raw=await redis.get(key); if(!raw) return res.status(400).json({ok:false,error:"OTP_EXPIRED"}); const p=JSON.parse(raw);
    if(p.attempts>=OTP_MAX_VERIFY_ATTEMPTS){await redis.del(key);return res.status(429).json({ok:false,error:"OTP_TOO_MANY_ATTEMPTS"});}
    if(!safeEqualHex(p.hash,otpHash(email,code))){p.attempts++;await redis.set(key,JSON.stringify(p),{EX:Math.max(1,await redis.ttl(key))});return res.status(400).json({ok:false,error:"OTP_INVALID",attemptsLeft:OTP_MAX_VERIFY_ATTEMPTS-p.attempts});}
    await redis.del(key);await redis.set(`email:verified:${email}`,"1",{EX:VERIFIED_EMAIL_TTL_SECONDS});res.json({ok:true,verified:true,email});
  });

  app.post("/api/auth/register",async(req,res)=>{
    const email=normalizeEmail(req.body?.email),username=normalizeUsername(req.body?.username),displayName=normalizeDisplayName(req.body?.displayName),gender=req.body?.gender,password=req.body?.password;
    if(!isValidEmail(email))return res.status(400).json({ok:false,error:"INVALID_EMAIL"});if(!isValidUsername(username))return res.status(400).json({ok:false,error:"INVALID_USERNAME"});if(!isValidDisplayName(displayName))return res.status(400).json({ok:false,error:"INVALID_DISPLAY_NAME"});if(!["male","female"].includes(gender))return res.status(400).json({ok:false,error:"INVALID_GENDER"});if(!isValidPassword(password))return res.status(400).json({ok:false,error:"WEAK_PASSWORD"});if(!(await redis.get(`email:verified:${email}`)))return res.status(403).json({ok:false,error:"EMAIL_NOT_VERIFIED"});
    const dup=(await pool.query(`SELECT email,username FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2) LIMIT 1`,[email,username])).rows[0];if(dup)return res.status(409).json({ok:false,error:dup.email.toLowerCase()===email?"EMAIL_ALREADY_REGISTERED":"USERNAME_TAKEN"});
    const user=(await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,email,username,display_name,gender,bio,avatar_url,account_status,created_at`,[email,username,displayName,gender,await hashPassword(password)])).rows[0];await redis.del(`email:verified:${email}`);const token=await createSession(user.id);await audit({userId:user.id,category:"AUTH",action:"account_registered",req,statusCode:201});res.status(201).json({ok:true,token,expiresIn:SESSION_TTL_SECONDS,user});
  });

  app.post("/api/auth/login",async(req,res)=>{
    const identifier=String(req.body?.identifier||"").trim().toLowerCase(),password=req.body?.password;if(!identifier||!isValidPassword(password))return res.status(400).json({ok:false,error:"INVALID_LOGIN"});
    const row=(await pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,password_hash,account_status,ban_reason,created_at FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) LIMIT 1`,[identifier])).rows[0];
    if(!row||!(await verifyPassword(password,row.password_hash))){await audit({level:"WARNING",category:"AUTH",action:`failed_login:${identifier}`,req,statusCode:401});return res.status(401).json({ok:false,error:"INVALID_LOGIN"});}
    if(!isAdminUser(row)&&row.account_status!=="active") return res.status(403).json({ok:false,error:row.account_status==="banned"?"ACCOUNT_BANNED":"ACCOUNT_FROZEN",reason:row.ban_reason||""});
    delete row.password_hash;const token=await createSession(row.id);await audit({userId:row.id,category:"AUTH",action:"login",req,statusCode:200});res.json({ok:true,token,expiresIn:SESSION_TTL_SECONDS,user:row});
  });
  app.get("/api/auth/me",async(req,res)=>{const s=await requireAuth(req,res);if(s)res.json({ok:true,user:s.user,isAdmin:isAdminUser(s.user)});});
  app.post("/api/auth/logout",async(req,res)=>{const s=await getSessionUser(req);if(s){await redis.del(`session:${s.token}`);await audit({userId:s.user.id,category:"AUTH",action:"logout",req,statusCode:200});}res.json({ok:true});});

  app.get("/api/dashboard",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=s.user.id;const [r,f,p,n,c]=await Promise.all([pool.query(`SELECT COUNT(*)::int c FROM room_members WHERE user_id=$1`,[id]),pool.query(`SELECT COUNT(*)::int c FROM friendships WHERE status='accepted' AND(requester_id=$1 OR addressee_id=$1)`,[id]),pool.query(`SELECT COUNT(*)::int c FROM friendships WHERE status='pending' AND addressee_id=$1`,[id]),pool.query(`SELECT COUNT(*)::int c FROM notifications WHERE user_id=$1 AND read_at IS NULL`,[id]),pool.query(`SELECT COUNT(*)::int c FROM direct_conversations WHERE user1_id=$1 OR user2_id=$1`,[id])]);res.json({ok:true,stats:{rooms:r.rows[0].c,friends:f.rows[0].c,pendingRequests:p.rows[0].c,unreadNotifications:n.rows[0].c,chats:c.rows[0].c}});});

  app.get("/api/rooms",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const q=cleanText(req.query.q||"",80);const result=await pool.query(`SELECT r.id,r.name,r.slug,r.description,r.is_public,r.owner_id,r.created_at,EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=$1) joined,(SELECT COUNT(*)::int FROM room_members x WHERE x.room_id=r.id) members_count FROM rooms r WHERE r.is_public=TRUE AND($2='' OR r.name ILIKE '%'||$2||'%' OR r.description ILIKE '%'||$2||'%') ORDER BY members_count DESC,r.id ASC LIMIT 100`,[s.user.id,q]);res.json({ok:true,rooms:result.rows});});
  app.post("/api/rooms",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const name=cleanText(req.body?.name,60),description=cleanText(req.body?.description,180);if(name.length<3)return res.status(400).json({ok:false,error:"INVALID_ROOM_NAME"});const slug=`${name.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,"-").replace(/^-|-$/g,"").slice(0,45)||"room"}-${crypto.randomBytes(3).toString("hex")}`;const client=await pool.connect();try{await client.query("BEGIN");const room=(await client.query(`INSERT INTO rooms(name,slug,description,is_public,owner_id) VALUES($1,$2,$3,TRUE,$4) RETURNING *`,[name,slug,description,s.user.id])).rows[0];await client.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'owner')`,[room.id,s.user.id]);await client.query("COMMIT");await audit({userId:s.user.id,category:"ROOM",action:`create_room:${room.id}`,req,statusCode:201});res.status(201).json({ok:true,room:{...room,joined:true,members_count:1}});}catch(e){await client.query("ROLLBACK");res.status(500).json({ok:false,error:"ROOM_CREATE_FAILED"});}finally{client.release();}});
  app.post("/api/rooms/:id/join",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id);if(!(await pool.query(`SELECT id FROM rooms WHERE id=$1 AND is_public=TRUE`,[id])).rows[0])return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});await pool.query(`INSERT INTO room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,s.user.id]);res.json({ok:true});});
  app.post("/api/rooms/:id/leave",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),m=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[id,s.user.id])).rows[0];if(m?.role==="owner"&&!isAdminUser(s.user))return res.status(409).json({ok:false,error:"OWNER_CANNOT_LEAVE"});await pool.query(`DELETE FROM room_members WHERE room_id=$1 AND user_id=$2`,[id,s.user.id]);res.json({ok:true});});

  app.get("/api/rooms/:id/messages",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id);if(!(await pool.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`,[id,s.user.id])).rows[0]&&!isAdminUser(s.user))return res.status(403).json({ok:false,error:"NOT_ROOM_MEMBER"});const rows=(await pool.query(`SELECT m.id,m.room_id,m.body,m.created_at,m.edited_at,m.deleted_at,m.forwarded_from_message_id,u.id user_id,u.username,u.display_name,u.gender FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.id DESC LIMIT 100`,[id])).rows.reverse();res.json({ok:true,messages:rows});});
  app.post("/api/rooms/:id/messages",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),body=cleanText(req.body?.body,1000);if(!body)return res.status(400).json({ok:false,error:"EMPTY_MESSAGE"});if(!(await pool.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`,[id,s.user.id])).rows[0])return res.status(403).json({ok:false,error:"NOT_ROOM_MEMBER"});const key=`msg:rate:${s.user.id}`,n=await redis.incr(key);if(n===1)await redis.expire(key,30);if(n>20)return res.status(429).json({ok:false,error:"MESSAGE_RATE_LIMIT"});const msg=(await pool.query(`INSERT INTO messages(room_id,user_id,body) VALUES($1,$2,$3) RETURNING id,room_id,body,created_at,edited_at,deleted_at,forwarded_from_message_id`,[id,s.user.id,body])).rows[0];const enriched={...msg,user_id:s.user.id,username:s.user.username,display_name:s.user.display_name,gender:s.user.gender};io.to(`room:${id}`).emit("message:new",enriched);res.status(201).json({ok:true,message:enriched});});
  app.patch("/api/messages/:id",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),body=cleanText(req.body?.body,1000);if(!body)return res.status(400).json({ok:false,error:"EMPTY_MESSAGE"});const msg=(await pool.query(`SELECT * FROM messages WHERE id=$1`,[id])).rows[0];if(!msg)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});if(String(msg.user_id)!==String(s.user.id)&&!isAdminUser(s.user))return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`UPDATE messages SET body=$1,edited_at=NOW(),deleted_at=NULL WHERE id=$2 RETURNING *`,[body,id])).rows[0];io.to(`room:${row.room_id}`).emit("message:updated",row);res.json({ok:true,message:row});});
  app.delete("/api/messages/:id",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),msg=(await pool.query(`SELECT * FROM messages WHERE id=$1`,[id])).rows[0];if(!msg)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});if(String(msg.user_id)!==String(s.user.id)&&!isAdminUser(s.user))return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`UPDATE messages SET body='',deleted_at=NOW() WHERE id=$1 RETURNING id,room_id,deleted_at`,[id])).rows[0];io.to(`room:${row.room_id}`).emit("message:deleted",row);res.json({ok:true,message:row});});
  app.post("/api/messages/:id/forward",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const source=(await pool.query(`SELECT * FROM messages WHERE id=$1 AND deleted_at IS NULL`,[Number(req.params.id)])).rows[0];if(!source)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});const roomId=Number(req.body?.roomId);if(!Number.isInteger(roomId))return res.status(400).json({ok:false,error:"INVALID_ROOM"});if(!(await pool.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,s.user.id])).rows[0])return res.status(403).json({ok:false,error:"NOT_ROOM_MEMBER"});const row=(await pool.query(`INSERT INTO messages(room_id,user_id,body,forwarded_from_message_id) VALUES($1,$2,$3,$4) RETURNING *`,[roomId,s.user.id,source.body,source.id])).rows[0];res.status(201).json({ok:true,message:row});});

  app.get("/api/chats",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const rows=(await pool.query(`SELECT c.id,c.updated_at,u.id user_id,u.username,u.display_name,u.gender,u.avatar_url,(SELECT CASE WHEN dm.deleted_at IS NULL THEN dm.body ELSE 'تم حذف الرسالة' END FROM direct_messages dm WHERE dm.conversation_id=c.id ORDER BY dm.id DESC LIMIT 1) last_message FROM direct_conversations c JOIN users u ON u.id=CASE WHEN c.user1_id=$1 THEN c.user2_id ELSE c.user1_id END WHERE c.user1_id=$1 OR c.user2_id=$1 ORDER BY c.updated_at DESC`,[s.user.id])).rows;res.json({ok:true,chats:rows});});
  app.post("/api/chats/with/:userId",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const target=Number(req.params.userId);if(!Number.isInteger(target)||target===Number(s.user.id))return res.status(400).json({ok:false,error:"INVALID_USER"});if(!(await pool.query(`SELECT id FROM users WHERE id=$1 AND account_status='active'`,[target])).rows[0])return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});let c=(await pool.query(`SELECT * FROM direct_conversations WHERE LEAST(user1_id,user2_id)=LEAST($1,$2) AND GREATEST(user1_id,user2_id)=GREATEST($1,$2)`,[s.user.id,target])).rows[0];if(!c)c=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) RETURNING *`,[s.user.id,target])).rows[0];res.status(201).json({ok:true,conversation:c});});
  app.get("/api/chats/:id/messages",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id);if(!(await pool.query(`SELECT 1 FROM direct_conversations WHERE id=$1 AND(user1_id=$2 OR user2_id=$2)`,[id,s.user.id])).rows[0]&&!isAdminUser(s.user))return res.status(403).json({ok:false,error:"FORBIDDEN"});const rows=(await pool.query(`SELECT dm.id,dm.conversation_id,dm.body,dm.created_at,dm.edited_at,dm.deleted_at,dm.forwarded_from_message_id,u.id sender_id,u.username,u.display_name FROM direct_messages dm JOIN users u ON u.id=dm.sender_id WHERE dm.conversation_id=$1 ORDER BY dm.id DESC LIMIT 100`,[id])).rows.reverse();res.json({ok:true,messages:rows});});
  app.post("/api/chats/:id/messages",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),body=cleanText(req.body?.body,1000);if(!body)return res.status(400).json({ok:false,error:"EMPTY_MESSAGE"});if(!(await pool.query(`SELECT 1 FROM direct_conversations WHERE id=$1 AND(user1_id=$2 OR user2_id=$2)`,[id,s.user.id])).rows[0])return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`INSERT INTO direct_messages(conversation_id,sender_id,body) VALUES($1,$2,$3) RETURNING *`,[id,s.user.id,body])).rows[0];await pool.query(`UPDATE direct_conversations SET updated_at=NOW() WHERE id=$1`,[id]);const enriched={...row,sender_id:s.user.id,username:s.user.username,display_name:s.user.display_name};io.to(`chat:${id}`).emit("direct:new",enriched);res.status(201).json({ok:true,message:enriched});});
  app.patch("/api/direct-messages/:id",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),body=cleanText(req.body?.body,1000),m=(await pool.query(`SELECT * FROM direct_messages WHERE id=$1`,[id])).rows[0];if(!m)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});if(String(m.sender_id)!==String(s.user.id)&&!isAdminUser(s.user))return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`UPDATE direct_messages SET body=$1,edited_at=NOW(),deleted_at=NULL WHERE id=$2 RETURNING *`,[body,id])).rows[0];io.to(`chat:${row.conversation_id}`).emit("direct:updated",row);res.json({ok:true,message:row});});
  app.delete("/api/direct-messages/:id",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),m=(await pool.query(`SELECT * FROM direct_messages WHERE id=$1`,[id])).rows[0];if(!m)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});if(String(m.sender_id)!==String(s.user.id)&&!isAdminUser(s.user))return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`UPDATE direct_messages SET body='',deleted_at=NOW() WHERE id=$1 RETURNING id,conversation_id,deleted_at`,[id])).rows[0];io.to(`chat:${row.conversation_id}`).emit("direct:deleted",row);res.json({ok:true,message:row});});
  app.post("/api/direct-messages/:id/forward",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const source=(await pool.query(`SELECT * FROM direct_messages WHERE id=$1 AND deleted_at IS NULL`,[Number(req.params.id)])).rows[0];if(!source)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});const conversationId=Number(req.body?.conversationId);if(!Number.isInteger(conversationId))return res.status(400).json({ok:false,error:"INVALID_CHAT"});if(!(await pool.query(`SELECT 1 FROM direct_conversations WHERE id=$1 AND(user1_id=$2 OR user2_id=$2)`,[conversationId,s.user.id])).rows[0])return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`INSERT INTO direct_messages(conversation_id,sender_id,body,forwarded_from_message_id) VALUES($1,$2,$3,$4) RETURNING *`,[conversationId,s.user.id,source.body,source.id])).rows[0];res.status(201).json({ok:true,message:row});});

  app.get("/api/users/search",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const q=cleanText(req.query.q||"",50);if(q.length<2)return res.json({ok:true,users:[]});const rows=(await pool.query(`SELECT u.id,u.username,u.display_name,u.gender,u.bio,u.account_status,CASE WHEN f.status='accepted' THEN 'friends' WHEN f.status='pending' AND f.requester_id=$1 THEN 'outgoing' WHEN f.status='pending' AND f.addressee_id=$1 THEN 'incoming' ELSE 'none' END relation FROM users u LEFT JOIN friendships f ON(LEAST(f.requester_id,f.addressee_id)=LEAST($1,u.id) AND GREATEST(f.requester_id,f.addressee_id)=GREATEST($1,u.id)) WHERE u.id<>$1 AND u.account_status='active' AND(u.username ILIKE '%'||$2||'%' OR u.display_name ILIKE '%'||$2||'%') ORDER BY u.id DESC LIMIT 30`,[s.user.id,q])).rows;res.json({ok:true,users:rows});});
  app.get("/api/friends",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=s.user.id;const friends=(await pool.query(`SELECT u.id,u.username,u.display_name,u.gender,u.bio,f.updated_at FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END WHERE f.status='accepted' AND(f.requester_id=$1 OR f.addressee_id=$1) ORDER BY f.updated_at DESC`,[id])).rows;const incoming=(await pool.query(`SELECT f.id request_id,u.id,u.username,u.display_name,u.gender,f.created_at FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=$1 AND f.status='pending' ORDER BY f.id DESC`,[id])).rows;const suggestions=(await pool.query(`SELECT u.id,u.username,u.display_name,u.gender,u.bio FROM users u WHERE u.id<>$1 AND u.account_status='active' AND NOT EXISTS(SELECT 1 FROM friendships f WHERE LEAST(f.requester_id,f.addressee_id)=LEAST($1,u.id) AND GREATEST(f.requester_id,f.addressee_id)=GREATEST($1,u.id)) ORDER BY u.created_at DESC LIMIT 12`,[id])).rows;res.json({ok:true,friends,incoming,suggestions});});
  app.post("/api/friends/request",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const target=Number(req.body?.userId);if(!Number.isInteger(target)||target===Number(s.user.id))return res.status(400).json({ok:false,error:"INVALID_USER"});try{const row=(await pool.query(`INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'pending') RETURNING id`,[s.user.id,target])).rows[0];await addNotification(target,"friend_request","طلب صداقة جديد",`${s.user.display_name} يبي يضيفك للأصحاب`,s.user.id,row.id);res.status(201).json({ok:true,requestId:row.id});}catch(e){if(e?.code==='23505')return res.status(409).json({ok:false,error:"RELATION_EXISTS"});throw e;}});
  app.post("/api/friends/:id/respond",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const id=Number(req.params.id),action=req.body?.action;if(!["accept","reject"].includes(action))return res.status(400).json({ok:false,error:"INVALID_ACTION"});const request=(await pool.query(`SELECT * FROM friendships WHERE id=$1 AND addressee_id=$2 AND status='pending'`,[id,s.user.id])).rows[0];if(!request)return res.status(404).json({ok:false,error:"REQUEST_NOT_FOUND"});const status=action==='accept'?'accepted':'rejected';await pool.query(`UPDATE friendships SET status=$1,updated_at=NOW() WHERE id=$2`,[status,id]);if(status==='accepted')await addNotification(request.requester_id,"friend_accepted","تم قبول طلب الصداقة",`${s.user.display_name} قبل طلب صداقتك`,s.user.id,id);res.json({ok:true,status});});
  app.delete("/api/friends/:userId",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;await pool.query(`DELETE FROM friendships WHERE status='accepted' AND((requester_id=$1 AND addressee_id=$2)OR(requester_id=$2 AND addressee_id=$1))`,[s.user.id,Number(req.params.userId)]);res.json({ok:true});});
  app.get("/api/notifications",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const rows=(await pool.query(`SELECT n.id,n.type,n.title,n.body,n.ref_id,n.read_at,n.created_at,u.username actor_username,u.display_name actor_name FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 100`,[s.user.id])).rows;res.json({ok:true,notifications:rows});});
  app.post("/api/notifications/read",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;await pool.query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1`,[s.user.id]);res.json({ok:true});});
  app.patch("/api/profile",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const displayName=normalizeDisplayName(req.body?.displayName??s.user.display_name),bio=cleanText(req.body?.bio??s.user.bio,160);if(!isValidDisplayName(displayName))return res.status(400).json({ok:false,error:"INVALID_DISPLAY_NAME"});const row=(await pool.query(`UPDATE users SET display_name=$1,bio=$2,updated_at=NOW() WHERE id=$3 RETURNING id,email,username,display_name,gender,bio,avatar_url,account_status,created_at`,[displayName,bio,s.user.id])).rows[0];res.json({ok:true,user:row});});

  app.get("/api/admin/stats",async(req,res)=>{const s=await requireAdmin(req,res);if(!s)return;const [onlineUsers,onlineVisitors,visitorsToday,registeredUsers,newUsersToday,rooms,messages,errorsToday,frozen,banned]=await Promise.all([pool.query(`SELECT COUNT(DISTINCT user_id)::int c FROM visitor_presence WHERE user_id IS NOT NULL AND last_seen>NOW()-INTERVAL '2 minutes'`),pool.query(`SELECT COUNT(*)::int c FROM visitor_presence WHERE last_seen>NOW()-INTERVAL '2 minutes'`),pool.query(`SELECT COUNT(*)::int c FROM visitor_presence WHERE first_seen::date=CURRENT_DATE`),pool.query(`SELECT COUNT(*)::int c FROM users`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE created_at::date=CURRENT_DATE`),pool.query(`SELECT COUNT(*)::int c FROM rooms`),pool.query(`SELECT ((SELECT COUNT(*) FROM messages)+(SELECT COUNT(*) FROM direct_messages))::int c`),pool.query(`SELECT COUNT(*)::int c FROM audit_logs WHERE level='ERROR' AND created_at::date=CURRENT_DATE`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE account_status='frozen'`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE account_status='banned'`)]);res.json({ok:true,stats:{onlineUsers:onlineUsers.rows[0].c,onlineVisitors:onlineVisitors.rows[0].c,visitorsToday:visitorsToday.rows[0].c,registeredUsers:registeredUsers.rows[0].c,newUsersToday:newUsersToday.rows[0].c,rooms:rooms.rows[0].c,messages:messages.rows[0].c,errorsToday:errorsToday.rows[0].c,frozen:frozen.rows[0].c,banned:banned.rows[0].c}});});
  app.get("/api/admin/logs",async(req,res)=>{const s=await requireAdmin(req,res);if(!s)return;const level=cleanText(req.query.level||"",20),q=cleanText(req.query.q||"",80),limit=Math.min(300,Math.max(20,Number(req.query.limit)||120));const rows=(await pool.query(`SELECT l.*,u.username FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id WHERE($1='' OR l.level=$1)AND($2='' OR l.action ILIKE '%'||$2||'%' OR l.category ILIKE '%'||$2||'%' OR u.username ILIKE '%'||$2||'%') ORDER BY l.id DESC LIMIT $3`,[level,q,limit])).rows;res.json({ok:true,logs:rows});});
  app.get("/api/admin/users",async(req,res)=>{const s=await requireAdmin(req,res);if(!s)return;const q=cleanText(req.query.q||"",80);const rows=(await pool.query(`SELECT id,email,username,display_name,gender,account_status,ban_reason,created_at FROM users WHERE($1='' OR username ILIKE '%'||$1||'%' OR display_name ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%') ORDER BY id DESC LIMIT 200`,[q])).rows;res.json({ok:true,users:rows});});
  app.patch("/api/admin/users/:id/status",async(req,res)=>{const s=await requireAdmin(req,res);if(!s)return;const target=Number(req.params.id),status=req.body?.status,reason=cleanText(req.body?.reason||"",240);if(!["active","frozen","banned"].includes(status))return res.status(400).json({ok:false,error:"INVALID_STATUS"});const u=(await pool.query(`SELECT id,username FROM users WHERE id=$1`,[target])).rows[0];if(!u)return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});if(normalizeUsername(u.username)===ADMIN_USERNAME)return res.status(409).json({ok:false,error:"CANNOT_MODERATE_ADMIN"});const row=(await pool.query(`UPDATE users SET account_status=$1,ban_reason=$2,updated_at=NOW() WHERE id=$3 RETURNING id,email,username,display_name,account_status,ban_reason`,[status,status==='active'?'':reason,target])).rows[0];if(status!=="active"){const keys=await redis.keys("session:*");for(const key of keys){if(String(await redis.get(key))===String(target))await redis.del(key);}}await audit({userId:s.user.id,category:"ADMIN",action:`user_status:${u.username}:${status}`,req,statusCode:200,details:{target,reason}});res.json({ok:true,user:row});});
  app.delete("/api/admin/rooms/:id",async(req,res)=>{const s=await requireAdmin(req,res);if(!s)return;const id=Number(req.params.id),room=(await pool.query(`SELECT id,name FROM rooms WHERE id=$1`,[id])).rows[0];if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});await pool.query(`DELETE FROM rooms WHERE id=$1`,[id]);await audit({userId:s.user.id,category:"ADMIN",action:`delete_room:${room.name}`,req,statusCode:200,details:{roomId:id}});res.json({ok:true});});
  app.get("/api/admin/rooms",async(req,res)=>{const s=await requireAdmin(req,res);if(!s)return;const rows=(await pool.query(`SELECT r.id,r.name,r.description,r.created_at,u.username owner_username,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count FROM rooms r LEFT JOIN users u ON u.id=r.owner_id ORDER BY r.id DESC`)).rows;res.json({ok:true,rooms:rows});});
  app.get("/api/map/cities",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const rows=(await pool.query(`SELECT city,COUNT(*)::int users FROM user_locations WHERE city<>'' GROUP BY city ORDER BY users DESC`)).rows;res.json({ok:true,cities:rows});});
  app.put("/api/location",async(req,res)=>{const s=await requireAuth(req,res);if(!s)return;const city=cleanText(req.body?.city,80),lat=Number(req.body?.latitude),lng=Number(req.body?.longitude),share=Boolean(req.body?.sharePrecise);await pool.query(`INSERT INTO user_locations(user_id,city,latitude,longitude,share_precise,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET city=EXCLUDED.city,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,share_precise=EXCLUDED.share_precise,updated_at=NOW()`,[s.user.id,city,Number.isFinite(lat)?lat:null,Number.isFinite(lng)?lng:null,share]);res.json({ok:true});});

  server.listen(4000,"0.0.0.0",()=>console.log("MARBO3A API listening on 4000"));
}
boot().catch(err=>{console.error(err);process.exit(1);});
