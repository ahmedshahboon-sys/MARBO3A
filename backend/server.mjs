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
app.use(express.json({ limit: "32kb" }));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const redis = createClient({
  url: process.env.REDIS_URL
});

redis.on("error", err => console.error("Redis:", err));

const OTP_TTL_SECONDS = 10 * 60;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_PER_HOUR = 6;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const VERIFIED_EMAIL_TTL_SECONDS = 30 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeDisplayName(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidUsername(username) {
  return /^[a-z0-9._]{3,24}$/.test(username);
}

function isValidDisplayName(name) {
  return name.length >= 2 && name.length <= 50;
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

function otpHash(email, code) {
  return crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function safeEqualHex(a, b) {
  try {
    const aa = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
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
  } catch {
    return false;
  }
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${token}`, String(userId), { EX: SESSION_TTL_SECONDS });
  return token;
}

async function getSessionUser(req) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!match) return null;

  const token = match[1];
  const userId = await redis.get(`session:${token}`);
  if (!userId) return null;

  const result = await pool.query(
    `SELECT id, email, username, display_name, gender, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (!result.rows[0]) return null;
  await redis.expire(`session:${token}`, SESSION_TTL_SECONDS);
  return { token, user: result.rows[0] };
}

async function sendOtpEmail(email, code) {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY is missing");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: {
        name: "مربوعة",
        email: "no-reply@marbo3a.ly"
      },
      to: [{ email }],
      subject: "رمز التحقق من مربوعة",
      htmlContent: `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:20px;padding:32px;text-align:center">
      <div style="font-size:28px;font-weight:800;margin-bottom:12px">مربوعة</div>
      <p style="font-size:16px;line-height:1.8;margin:0 0 18px">استخدم رمز التحقق التالي لإكمال العملية:</p>
      <div style="font-size:36px;font-weight:900;letter-spacing:8px;background:#f3f4f6;border-radius:14px;padding:18px;margin:18px 0">${code}</div>
      <p style="font-size:14px;color:#6b7280;line-height:1.8">الرمز صالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أي شخص.</p>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px">إذا لم تطلب هذا الرمز، تجاهل الرسالة.</p>
    </div>
  </body>
</html>`
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo ${response.status}: ${body.slice(0, 300)}`);
  }

  return response.json();
}

async function boot() {
  await redis.connect();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_status (
      id SERIAL PRIMARY KEY,
      service TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
      password_hash TEXT NOT NULL,
      email_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users ((LOWER(username)))`);
  await pool.query(`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users ((LOWER(email)))`);

  const io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", socket => {
    socket.emit("welcome", {
      app: "MARBO3A",
      realtime: true
    });
  });

  app.get("/health", async (req, res) => {
    const db = await pool.query("SELECT NOW() AS now");
    res.json({
      ok: true,
      project: "MARBO3A",
      database: true,
      redis: redis.isReady,
      time: db.rows[0].now
    });
  });

  app.get("/api/health", async (req, res) => {
    const db = await pool.query("SELECT NOW() AS now");
    res.json({
      ok: true,
      api: "MARBO3A API",
      database: "connected",
      realtime: "ready",
      redis: redis.isReady ? "connected" : "disconnected",
      email: process.env.BREVO_API_KEY ? "configured" : "missing",
      time: db.rows[0].now
    });
  });

  app.post("/api/auth/request-email-otp", async (req, res) => {
    const email = normalizeEmail(req.body?.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: "INVALID_EMAIL" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1", [email]);
    if (existing.rows[0]) {
      return res.status(409).json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" });
    }

    const cooldownKey = `otp:cooldown:${email}`;
    const otpKey = `otp:email:${email}`;
    const hourKey = `otp:hour:${email}`;

    const cooldown = await redis.set(cooldownKey, "1", {
      NX: true,
      EX: OTP_RESEND_SECONDS
    });

    if (!cooldown) {
      const retryAfter = await redis.ttl(cooldownKey);
      return res.status(429).json({
        ok: false,
        error: "OTP_TOO_SOON",
        retryAfter: Math.max(1, retryAfter)
      });
    }

    const hourlyCount = await redis.incr(hourKey);
    if (hourlyCount === 1) await redis.expire(hourKey, 60 * 60);

    if (hourlyCount > OTP_MAX_PER_HOUR) {
      await redis.del(cooldownKey);
      return res.status(429).json({
        ok: false,
        error: "OTP_RATE_LIMITED",
        retryAfter: Math.max(1, await redis.ttl(hourKey))
      });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const payload = {
      hash: otpHash(email, code),
      attempts: 0,
      createdAt: Date.now()
    };

    await redis.set(otpKey, JSON.stringify(payload), { EX: OTP_TTL_SECONDS });

    try {
      await sendOtpEmail(email, code);
      return res.json({
        ok: true,
        expiresIn: OTP_TTL_SECONDS,
        resendAfter: OTP_RESEND_SECONDS
      });
    } catch (error) {
      console.error("OTP email send failed:", error.message);
      await redis.del(otpKey);
      await redis.del(cooldownKey);
      return res.status(502).json({ ok: false, error: "EMAIL_SEND_FAILED" });
    }
  });

  app.post("/api/auth/verify-email-otp", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code ?? "").trim();

    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ ok: false, error: "INVALID_OTP_REQUEST" });
    }

    const otpKey = `otp:email:${email}`;
    const raw = await redis.get(otpKey);

    if (!raw) {
      return res.status(400).json({ ok: false, error: "OTP_EXPIRED" });
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      await redis.del(otpKey);
      return res.status(400).json({ ok: false, error: "OTP_EXPIRED" });
    }

    if (payload.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await redis.del(otpKey);
      return res.status(429).json({ ok: false, error: "OTP_TOO_MANY_ATTEMPTS" });
    }

    const matches = safeEqualHex(payload.hash, otpHash(email, code));

    if (!matches) {
      payload.attempts += 1;
      const ttl = Math.max(1, await redis.ttl(otpKey));
      await redis.set(otpKey, JSON.stringify(payload), { EX: ttl });

      return res.status(400).json({
        ok: false,
        error: "OTP_INVALID",
        attemptsLeft: Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - payload.attempts)
      });
    }

    await redis.del(otpKey);
    await redis.set(`email:verified:${email}`, "1", { EX: VERIFIED_EMAIL_TTL_SECONDS });

    return res.json({
      ok: true,
      verified: true,
      email
    });
  });

  app.post("/api/auth/register", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const displayName = normalizeDisplayName(req.body?.displayName);
    const gender = req.body?.gender;
    const password = req.body?.password;

    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: "INVALID_EMAIL" });
    if (!isValidUsername(username)) return res.status(400).json({ ok: false, error: "INVALID_USERNAME" });
    if (!isValidDisplayName(displayName)) return res.status(400).json({ ok: false, error: "INVALID_DISPLAY_NAME" });
    if (!['male', 'female'].includes(gender)) return res.status(400).json({ ok: false, error: "INVALID_GENDER" });
    if (!isValidPassword(password)) return res.status(400).json({ ok: false, error: "WEAK_PASSWORD" });

    const verified = await redis.get(`email:verified:${email}`);
    if (!verified) {
      return res.status(403).json({ ok: false, error: "EMAIL_NOT_VERIFIED" });
    }

    const duplicate = await pool.query(
      `SELECT email, username FROM users
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)
       LIMIT 1`,
      [email, username]
    );

    if (duplicate.rows[0]) {
      if (duplicate.rows[0].email.toLowerCase() === email) {
        return res.status(409).json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" });
      }
      return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });
    }

    const passwordHash = await hashPassword(password);

    try {
      const inserted = await pool.query(
        `INSERT INTO users (email, username, display_name, gender, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, username, display_name, gender, created_at`,
        [email, username, displayName, gender, passwordHash]
      );

      await redis.del(`email:verified:${email}`);
      const token = await createSession(inserted.rows[0].id);

      return res.status(201).json({
        ok: true,
        token,
        expiresIn: SESSION_TTL_SECONDS,
        user: inserted.rows[0]
      });
    } catch (error) {
      if (error?.code === "23505") {
        return res.status(409).json({ ok: false, error: "ACCOUNT_CONFLICT" });
      }
      console.error("Register failed:", error);
      return res.status(500).json({ ok: false, error: "REGISTER_FAILED" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const identifier = String(req.body?.identifier || "").trim().toLowerCase();
    const password = req.body?.password;

    if (!identifier || !isValidPassword(password)) {
      return res.status(400).json({ ok: false, error: "INVALID_LOGIN" });
    }

    const result = await pool.query(
      `SELECT id, email, username, display_name, gender, password_hash, created_at
       FROM users
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );

    const row = result.rows[0];
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return res.status(401).json({ ok: false, error: "INVALID_LOGIN" });
    }

    const token = await createSession(row.id);
    delete row.password_hash;

    return res.json({ ok: true, token, expiresIn: SESSION_TTL_SECONDS, user: row });
  });

  app.get("/api/auth/me", async (req, res) => {
    const session = await getSessionUser(req);
    if (!session) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    return res.json({ ok: true, user: session.user });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const session = await getSessionUser(req);
    if (session) await redis.del(`session:${session.token}`);
    return res.json({ ok: true });
  });

  server.listen(4000, "0.0.0.0", () => {
    console.log("MARBO3A API listening on 4000");
  });
}

boot().catch(err => {
  console.error(err);
  process.exit(1);
});
