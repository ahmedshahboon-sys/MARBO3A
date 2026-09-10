import express from "express";
import cors from "cors";
import http from "http";
import crypto from "crypto";
import { Server } from "socket.io";
import pg from "pg";
import { createClient } from "redis";

const app = express();
const server = http.createServer(app);

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

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
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
    await redis.set(`email:verified:${email}`, "1", { EX: 30 * 60 });

    return res.json({
      ok: true,
      verified: true,
      email
    });
  });

  server.listen(4000, "0.0.0.0", () => {
    console.log("MARBO3A API listening on 4000");
  });
}

boot().catch(err => {
  console.error(err);
  process.exit(1);
});
