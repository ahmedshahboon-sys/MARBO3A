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

const OTP_TTL_SECONDS = 10 * 60;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_PER_HOUR = 6;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const VERIFIED_EMAIL_TTL_SECONDS = 30 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const io = new Server(server, {
  path: "/socket.io",
  cors: { origin: "*" }
});

function normalizeEmail(value = "") { return String(value).trim().toLowerCase(); }
function normalizeUsername(value = "") { return String(value).trim().toLowerCase(); }
function normalizeDisplayName(value = "") { return String(value).trim().replace(/\s+/g, " "); }
function cleanText(value = "", max = 500) { return String(value).trim().replace(/\s+/g, " ").slice(0, max); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
function isValidUsername(username) { return /^[a-z0-9._]{3,24}$/.test(username); }
function isValidDisplayName(name) { return name.length >= 2 && name.length <= 50; }
function isValidPassword(password) { return typeof password === "string" && password.length >= 8 && password.length <= 128; }
function otpHash(email, code) { return crypto.createHash("sha256").update(`${email}:${code}`).digest("hex"); }

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
    if (algo !== "scrypt" || !saltHex || !hashHex) return false;
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
  const result = await pool.query(
    `SELECT id, email, username, display_name, gender, bio, avatar_url, created_at
     FROM users WHERE id = $1`, [userId]
  );
  if (!result.rows[0]) return null;
  await redis.expire(`session:${token}`, SESSION_TTL_SECONDS);
  return { token, user: result.rows[0] };
}

async function getSessionUser(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match ? sessionFromToken(match[1]) : null;
}

async function requireAuth(req, res) {
  const session = await getSessionUser(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    return null;
  }
  return session;
}

async function sendOtpEmail(email, code) {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY is missing");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "api-key": process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "مربوعة", email: "no-reply@marbo3a.ly" },
      to: [{ email }],
      subject: "رمز التحقق من مربوعة",
      htmlContent: `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#111827"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:20px;padding:32px;text-align:center"><div style="font-size:28px;font-weight:800">مربوعة</div><p>استخدم رمز التحقق التالي لإكمال العملية:</p><div style="font-size:36px;font-weight:900;letter-spacing:8px;background:#f3f4f6;border-radius:14px;padding:18px;margin:18px 0">${code}</div><p style="font-size:14px;color:#6b7280">الرمز صالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أي شخص.</p></div></body></html>`
    })
  });
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function addNotification(userId, type, title, body = "", actorId = null, refId = null) {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, actor_id, type, title, body, ref_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, type, title, body, ref_id, read_at, created_at`,
    [userId, actorId, type, title, body, refId]
  );
  io.to(`user:${userId}`).emit("notification:new", result.rows[0]);
  return result.rows[0];
}

async function boot() {
  await redis.connect();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('male','female')),
      password_hash TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      email_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users ((LOWER(username)))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users ((LOWER(email)))`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_members (
      room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (room_id,user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS messages_room_id_id_idx ON messages(room_id,id DESC)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id BIGSERIAL PRIMARY KEY,
      requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (requester_id <> addressee_id)
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships (LEAST(requester_id,addressee_id), GREATEST(requester_id,addressee_id))`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      ref_id BIGINT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,id DESC)`);

  const roomCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM rooms")).rows[0].count);
  if (roomCount === 0) {
    await pool.query(`INSERT INTO rooms (name,slug,description,is_public) VALUES
      ('مربوعة العامة','general','تعرف على ناس جدد وشارك الحديث',TRUE),
      ('شباب ليبيا','libya-youth','دردشة ومواضيع يومية',TRUE),
      ('هوايات وتقنية','tech-hobbies','تقنية، ألعاب، سيارات وهوايات',TRUE)
      ON CONFLICT (slug) DO NOTHING`);
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const session = await sessionFromToken(token);
      if (!session) return next(new Error("UNAUTHORIZED"));
      socket.session = session;
      next();
    } catch (error) { next(error); }
  });

  io.on("connection", socket => {
    const userId = String(socket.session.user.id);
    socket.join(`user:${userId}`);
    socket.emit("welcome", { app: "MARBO3A", realtime: true, user: socket.session.user });

    socket.on("room:join", async roomId => {
      const member = await pool.query("SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2", [roomId, userId]);
      if (member.rows[0]) socket.join(`room:${roomId}`);
    });
    socket.on("room:leave", roomId => socket.leave(`room:${roomId}`));
  });

  app.get("/health", async (_req, res) => res.json({ ok: true, project: "MARBO3A", database: true, redis: redis.isReady }));
  app.get("/api/health", async (_req, res) => res.json({ ok: true, api: "MARBO3A API", database: "connected", realtime: "ready", redis: redis.isReady ? "connected" : "disconnected", email: process.env.BREVO_API_KEY ? "configured" : "missing", time: new Date().toISOString() }));

  app.post("/api/auth/request-email-otp", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ ok:false, error:"INVALID_EMAIL" });
    if ((await pool.query("SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1", [email])).rows[0]) return res.status(409).json({ ok:false, error:"EMAIL_ALREADY_REGISTERED" });

    const cooldownKey = `otp:cooldown:${email}`;
    const otpKey = `otp:email:${email}`;
    const hourKey = `otp:hour:${email}`;
    const cooldown = await redis.set(cooldownKey, "1", { NX:true, EX:OTP_RESEND_SECONDS });
    if (!cooldown) return res.status(429).json({ ok:false, error:"OTP_TOO_SOON", retryAfter:Math.max(1,await redis.ttl(cooldownKey)) });
    const hourlyCount = await redis.incr(hourKey);
    if (hourlyCount === 1) await redis.expire(hourKey, 3600);
    if (hourlyCount > OTP_MAX_PER_HOUR) { await redis.del(cooldownKey); return res.status(429).json({ ok:false,error:"OTP_RATE_LIMITED",retryAfter:Math.max(1,await redis.ttl(hourKey)) }); }

    const code = String(crypto.randomInt(100000,1000000));
    await redis.set(otpKey, JSON.stringify({ hash:otpHash(email,code), attempts:0, createdAt:Date.now() }), { EX:OTP_TTL_SECONDS });
    try {
      await sendOtpEmail(email, code);
      return res.json({ ok:true, expiresIn:OTP_TTL_SECONDS, resendAfter:OTP_RESEND_SECONDS });
    } catch (error) {
      console.error("OTP email send failed:", error.message);
      await redis.del(otpKey); await redis.del(cooldownKey);
      return res.status(502).json({ ok:false, error:"EMAIL_SEND_FAILED" });
    }
  });

  app.post("/api/auth/verify-email-otp", async (req,res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code ?? "").trim();
    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ok:false,error:"INVALID_OTP_REQUEST"});
    const key = `otp:email:${email}`;
    const raw = await redis.get(key);
    if (!raw) return res.status(400).json({ok:false,error:"OTP_EXPIRED"});
    let payload;
    try { payload = JSON.parse(raw); } catch { await redis.del(key); return res.status(400).json({ok:false,error:"OTP_EXPIRED"}); }
    if (payload.attempts >= OTP_MAX_VERIFY_ATTEMPTS) { await redis.del(key); return res.status(429).json({ok:false,error:"OTP_TOO_MANY_ATTEMPTS"}); }
    if (!safeEqualHex(payload.hash, otpHash(email,code))) {
      payload.attempts += 1;
      await redis.set(key, JSON.stringify(payload), { EX:Math.max(1,await redis.ttl(key)) });
      return res.status(400).json({ok:false,error:"OTP_INVALID",attemptsLeft:Math.max(0,OTP_MAX_VERIFY_ATTEMPTS-payload.attempts)});
    }
    await redis.del(key);
    await redis.set(`email:verified:${email}`, "1", { EX:VERIFIED_EMAIL_TTL_SECONDS });
    res.json({ok:true,verified:true,email});
  });

  app.post("/api/auth/register", async (req,res) => {
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const displayName = normalizeDisplayName(req.body?.displayName);
    const gender = req.body?.gender;
    const password = req.body?.password;
    if (!isValidEmail(email)) return res.status(400).json({ok:false,error:"INVALID_EMAIL"});
    if (!isValidUsername(username)) return res.status(400).json({ok:false,error:"INVALID_USERNAME"});
    if (!isValidDisplayName(displayName)) return res.status(400).json({ok:false,error:"INVALID_DISPLAY_NAME"});
    if (!["male","female"].includes(gender)) return res.status(400).json({ok:false,error:"INVALID_GENDER"});
    if (!isValidPassword(password)) return res.status(400).json({ok:false,error:"WEAK_PASSWORD"});
    if (!(await redis.get(`email:verified:${email}`))) return res.status(403).json({ok:false,error:"EMAIL_NOT_VERIFIED"});
    const duplicate = await pool.query(`SELECT email,username FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($2) LIMIT 1`, [email,username]);
    if (duplicate.rows[0]) return res.status(409).json({ok:false,error:duplicate.rows[0].email.toLowerCase()===email?"EMAIL_ALREADY_REGISTERED":"USERNAME_TAKEN"});
    try {
      const inserted = await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,email,username,display_name,gender,bio,avatar_url,created_at`, [email,username,displayName,gender,await hashPassword(password)]);
      await redis.del(`email:verified:${email}`);
      const token = await createSession(inserted.rows[0].id);
      return res.status(201).json({ok:true,token,expiresIn:SESSION_TTL_SECONDS,user:inserted.rows[0]});
    } catch (error) {
      if (error?.code === "23505") return res.status(409).json({ok:false,error:"ACCOUNT_CONFLICT"});
      console.error("Register failed:",error); return res.status(500).json({ok:false,error:"REGISTER_FAILED"});
    }
  });

  app.post("/api/auth/login", async (req,res) => {
    const identifier = String(req.body?.identifier||"").trim().toLowerCase();
    const password = req.body?.password;
    if (!identifier || !isValidPassword(password)) return res.status(400).json({ok:false,error:"INVALID_LOGIN"});
    const result = await pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,password_hash,created_at FROM users WHERE LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) LIMIT 1`, [identifier]);
    const row = result.rows[0];
    if (!row || !(await verifyPassword(password,row.password_hash))) return res.status(401).json({ok:false,error:"INVALID_LOGIN"});
    const token = await createSession(row.id); delete row.password_hash;
    res.json({ok:true,token,expiresIn:SESSION_TTL_SECONDS,user:row});
  });

  app.get("/api/auth/me", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    res.json({ok:true,user:session.user});
  });
  app.post("/api/auth/logout", async (req,res) => {
    const session = await getSessionUser(req); if (session) await redis.del(`session:${session.token}`);
    res.json({ok:true});
  });

  app.get("/api/dashboard", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const userId = session.user.id;
    const [rooms,friends,pending,unread] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int c FROM room_members WHERE user_id=$1`,[userId]),
      pool.query(`SELECT COUNT(*)::int c FROM friendships WHERE status='accepted' AND (requester_id=$1 OR addressee_id=$1)`,[userId]),
      pool.query(`SELECT COUNT(*)::int c FROM friendships WHERE status='pending' AND addressee_id=$1`,[userId]),
      pool.query(`SELECT COUNT(*)::int c FROM notifications WHERE user_id=$1 AND read_at IS NULL`,[userId])
    ]);
    res.json({ok:true,stats:{rooms:rooms.rows[0].c,friends:friends.rows[0].c,pendingRequests:pending.rows[0].c,unreadNotifications:unread.rows[0].c}});
  });

  app.get("/api/rooms", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const q = cleanText(req.query.q||"",80);
    const result = await pool.query(`
      SELECT r.id,r.name,r.slug,r.description,r.is_public,r.owner_id,r.created_at,
        EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=$1) AS joined,
        (SELECT COUNT(*)::int FROM room_members x WHERE x.room_id=r.id) AS members_count
      FROM rooms r
      WHERE r.is_public=TRUE AND ($2='' OR r.name ILIKE '%'||$2||'%' OR r.description ILIKE '%'||$2||'%')
      ORDER BY members_count DESC,r.id ASC LIMIT 100`, [session.user.id,q]);
    res.json({ok:true,rooms:result.rows});
  });

  app.post("/api/rooms", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const name = cleanText(req.body?.name,60);
    const description = cleanText(req.body?.description,180);
    if (name.length < 3) return res.status(400).json({ok:false,error:"INVALID_ROOM_NAME"});
    const slugBase = name.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,"-").replace(/^-|-$/g,"").slice(0,45) || "room";
    const slug = `${slugBase}-${crypto.randomBytes(3).toString("hex")}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const room = (await client.query(`INSERT INTO rooms(name,slug,description,is_public,owner_id) VALUES($1,$2,$3,TRUE,$4) RETURNING *`,[name,slug,description,session.user.id])).rows[0];
      await client.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'owner')`,[room.id,session.user.id]);
      await client.query("COMMIT");
      res.status(201).json({ok:true,room:{...room,joined:true,members_count:1}});
    } catch (e) { await client.query("ROLLBACK"); console.error(e); res.status(500).json({ok:false,error:"ROOM_CREATE_FAILED"}); }
    finally { client.release(); }
  });

  app.post("/api/rooms/:id/join", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const roomId = Number(req.params.id); if (!Number.isInteger(roomId)) return res.status(400).json({ok:false,error:"INVALID_ROOM"});
    const room = (await pool.query("SELECT id FROM rooms WHERE id=$1 AND is_public=TRUE",[roomId])).rows[0];
    if (!room) return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
    await pool.query(`INSERT INTO room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[roomId,session.user.id]);
    res.json({ok:true});
  });

  app.post("/api/rooms/:id/leave", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const roomId = Number(req.params.id);
    const member = (await pool.query("SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2",[roomId,session.user.id])).rows[0];
    if (member?.role === "owner") return res.status(409).json({ok:false,error:"OWNER_CANNOT_LEAVE"});
    await pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id=$2",[roomId,session.user.id]);
    res.json({ok:true});
  });

  app.get("/api/rooms/:id/messages", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const roomId = Number(req.params.id);
    const member = (await pool.query("SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2",[roomId,session.user.id])).rows[0];
    if (!member) return res.status(403).json({ok:false,error:"NOT_ROOM_MEMBER"});
    const result = await pool.query(`SELECT m.id,m.room_id,m.body,m.created_at,m.edited_at,u.id user_id,u.username,u.display_name,u.gender FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.id DESC LIMIT 100`,[roomId]);
    res.json({ok:true,messages:result.rows.reverse()});
  });

  app.post("/api/rooms/:id/messages", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const roomId = Number(req.params.id); const body = cleanText(req.body?.body,1000);
    if (!body) return res.status(400).json({ok:false,error:"EMPTY_MESSAGE"});
    const member = (await pool.query("SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2",[roomId,session.user.id])).rows[0];
    if (!member) return res.status(403).json({ok:false,error:"NOT_ROOM_MEMBER"});
    const rateKey = `msg:rate:${session.user.id}`; const n = await redis.incr(rateKey); if (n===1) await redis.expire(rateKey,30); if (n>20) return res.status(429).json({ok:false,error:"MESSAGE_RATE_LIMIT"});
    const msg = (await pool.query(`INSERT INTO messages(room_id,user_id,body) VALUES($1,$2,$3) RETURNING id,room_id,body,created_at,edited_at`,[roomId,session.user.id,body])).rows[0];
    const enriched = {...msg,user_id:session.user.id,username:session.user.username,display_name:session.user.display_name,gender:session.user.gender};
    io.to(`room:${roomId}`).emit("message:new",enriched);
    res.status(201).json({ok:true,message:enriched});
  });

  app.get("/api/users/search", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const q = cleanText(req.query.q||"",50);
    if (q.length < 2) return res.json({ok:true,users:[]});
    const result = await pool.query(`
      SELECT u.id,u.username,u.display_name,u.gender,u.bio,
        CASE WHEN f.status='accepted' THEN 'friends' WHEN f.status='pending' AND f.requester_id=$1 THEN 'outgoing' WHEN f.status='pending' AND f.addressee_id=$1 THEN 'incoming' ELSE 'none' END AS relation
      FROM users u
      LEFT JOIN friendships f ON (LEAST(f.requester_id,f.addressee_id)=LEAST($1,u.id) AND GREATEST(f.requester_id,f.addressee_id)=GREATEST($1,u.id))
      WHERE u.id<>$1 AND (u.username ILIKE '%'||$2||'%' OR u.display_name ILIKE '%'||$2||'%')
      ORDER BY CASE WHEN u.username ILIKE $2||'%' THEN 0 ELSE 1 END,u.id DESC LIMIT 30`,[session.user.id,q]);
    res.json({ok:true,users:result.rows});
  });

  app.get("/api/friends", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const id = session.user.id;
    const friends = await pool.query(`SELECT u.id,u.username,u.display_name,u.gender,u.bio,f.updated_at FROM friendships f JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END WHERE f.status='accepted' AND (f.requester_id=$1 OR f.addressee_id=$1) ORDER BY f.updated_at DESC`,[id]);
    const incoming = await pool.query(`SELECT f.id request_id,u.id,u.username,u.display_name,u.gender,f.created_at FROM friendships f JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=$1 AND f.status='pending' ORDER BY f.id DESC`,[id]);
    const suggestions = await pool.query(`SELECT u.id,u.username,u.display_name,u.gender,u.bio FROM users u WHERE u.id<>$1 AND NOT EXISTS(SELECT 1 FROM friendships f WHERE LEAST(f.requester_id,f.addressee_id)=LEAST($1,u.id) AND GREATEST(f.requester_id,f.addressee_id)=GREATEST($1,u.id)) ORDER BY u.created_at DESC LIMIT 12`,[id]);
    res.json({ok:true,friends:friends.rows,incoming:incoming.rows,suggestions:suggestions.rows});
  });

  app.post("/api/friends/request", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const targetId = Number(req.body?.userId); if (!Number.isInteger(targetId) || targetId===Number(session.user.id)) return res.status(400).json({ok:false,error:"INVALID_USER"});
    if (!(await pool.query("SELECT id FROM users WHERE id=$1",[targetId])).rows[0]) return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});
    try {
      const row = (await pool.query(`INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'pending') RETURNING id`,[session.user.id,targetId])).rows[0];
      await addNotification(targetId,"friend_request","طلب صداقة جديد",`${session.user.display_name} يبي يضيفك للأصحاب`,session.user.id,row.id);
      res.status(201).json({ok:true,requestId:row.id});
    } catch (e) { if (e?.code==='23505') return res.status(409).json({ok:false,error:"RELATION_EXISTS"}); throw e; }
  });

  app.post("/api/friends/:id/respond", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const requestId = Number(req.params.id); const action = req.body?.action;
    if (!["accept","reject"].includes(action)) return res.status(400).json({ok:false,error:"INVALID_ACTION"});
    const request = (await pool.query("SELECT * FROM friendships WHERE id=$1 AND addressee_id=$2 AND status='pending'",[requestId,session.user.id])).rows[0];
    if (!request) return res.status(404).json({ok:false,error:"REQUEST_NOT_FOUND"});
    const status = action==='accept'?'accepted':'rejected';
    await pool.query("UPDATE friendships SET status=$1,updated_at=NOW() WHERE id=$2",[status,requestId]);
    if (status==='accepted') await addNotification(request.requester_id,"friend_accepted","تم قبول طلب الصداقة",`${session.user.display_name} قبل طلب صداقتك`,session.user.id,requestId);
    res.json({ok:true,status});
  });

  app.delete("/api/friends/:userId", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const targetId = Number(req.params.userId);
    await pool.query("DELETE FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))",[session.user.id,targetId]);
    res.json({ok:true});
  });

  app.get("/api/notifications", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const result = await pool.query(`SELECT n.id,n.type,n.title,n.body,n.ref_id,n.read_at,n.created_at,u.username actor_username,u.display_name actor_name FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 100`,[session.user.id]);
    res.json({ok:true,notifications:result.rows});
  });

  app.post("/api/notifications/read", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    await pool.query("UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=$1",[session.user.id]);
    res.json({ok:true});
  });

  app.patch("/api/profile", async (req,res) => {
    const session = await requireAuth(req,res); if (!session) return;
    const displayName = normalizeDisplayName(req.body?.displayName ?? session.user.display_name);
    const bio = cleanText(req.body?.bio ?? session.user.bio,160);
    if (!isValidDisplayName(displayName)) return res.status(400).json({ok:false,error:"INVALID_DISPLAY_NAME"});
    const row = (await pool.query(`UPDATE users SET display_name=$1,bio=$2,updated_at=NOW() WHERE id=$3 RETURNING id,email,username,display_name,gender,bio,avatar_url,created_at`,[displayName,bio,session.user.id])).rows[0];
    res.json({ok:true,user:row});
  });

  server.listen(4000,"0.0.0.0",()=>console.log("MARBO3A API listening on 4000"));
}

boot().catch(err => { console.error(err); process.exit(1); });
