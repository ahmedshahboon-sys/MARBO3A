import http from "http";
import crypto from "crypto";
import pg from "pg";
import { createClient } from "redis";

const originalCreateServer = http.createServer.bind(http);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", err => console.error("Telemetry Redis:", err));

let infraPromise;
function ensureInfra() {
  if (!infraPromise) {
    infraPromise = (async () => {
      if (!redis.isOpen) await redis.connect();
      await pool.query(`CREATE TABLE IF NOT EXISTS operation_logs (
        id BIGSERIAL PRIMARY KEY,
        level TEXT NOT NULL DEFAULT 'INFO',
        category TEXT NOT NULL DEFAULT 'API',
        action TEXT NOT NULL,
        user_id BIGINT,
        username TEXT,
        method TEXT,
        path TEXT,
        status_code INTEGER,
        duration_ms INTEGER,
        ip_address TEXT,
        user_agent TEXT,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS operation_logs_created_idx ON operation_logs(id DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS operation_logs_level_idx ON operation_logs(level,id DESC)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS user_locations (
        user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        city TEXT NOT NULL DEFAULT '',
        latitude NUMERIC(9,6),
        longitude NUMERIC(9,6),
        share_map BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    })().catch(err => {
      infraPromise = null;
      throw err;
    });
  }
  return infraPromise;
}

function tokenFrom(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match?.[1] || "";
}

async function sessionUser(req) {
  await ensureInfra();
  const token = tokenFrom(req);
  if (!token) return null;
  const userId = await redis.get(`session:${token}`);
  if (!userId) return null;
  const row = (await pool.query("SELECT id,email,username,display_name FROM users WHERE id=$1", [userId])).rows[0];
  return row || null;
}

async function requireAdmin(req, res) {
  const user = await sessionUser(req);
  const wantedUsername = String(process.env.ADMIN_USERNAME || "ahmed").toLowerCase();
  const wantedEmail = String(process.env.ADMIN_EMAIL || "ad.shahboun@gmail.com").toLowerCase();
  const allowed = user && (String(user.username).toLowerCase() === wantedUsername || String(user.email).toLowerCase() === wantedEmail);
  if (!allowed) {
    res.status(user ? 403 : 401).json({ ok: false, error: "ADMIN_ONLY" });
    return null;
  }
  return user;
}

function safePath(req) {
  return String(req.originalUrl || req.url || "").split("?")[0].slice(0, 300);
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || req.socket?.remoteAddress || "").slice(0, 80);
}

async function writeLog(entry) {
  try {
    await ensureInfra();
    await pool.query(`INSERT INTO operation_logs
      (level,category,action,user_id,username,method,path,status_code,duration_ms,ip_address,user_agent,meta)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [
      entry.level || "INFO", entry.category || "API", entry.action || "request",
      entry.userId || null, entry.username || null, entry.method || null, entry.path || null,
      entry.statusCode || null, entry.durationMs || null, entry.ip || null,
      String(entry.userAgent || "").slice(0, 300), JSON.stringify(entry.meta || {})
    ]);
  } catch (err) {
    console.error("operation log failed:", err.message);
  }
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

http.createServer = function patchedCreateServer(app, ...args) {
  if (typeof app === "function" && app?.use) {
    ensureInfra().catch(err => console.error("Telemetry init:", err));

    app.use((req, res, next) => {
      const started = Date.now();
      res.on("finish", async () => {
        const path = safePath(req);
        const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
        const noteworthy = mutating || res.statusCode >= 400;
        if (!noteworthy || path === "/api/telemetry/ping") return;
        let user = null;
        try { user = await sessionUser(req); } catch {}
        const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARNING" : "INFO";
        const category = path.includes("/auth/") ? "AUTH" : path.includes("/rooms") ? "ROOMS" : path.includes("/friends") ? "FRIENDS" : "API";
        writeLog({ level, category, action: `${req.method} ${path}`, userId: user?.id, username: user?.username, method: req.method, path, statusCode: res.statusCode, durationMs: Date.now() - started, ip: clientIp(req), userAgent: req.headers["user-agent"] });
      });
      next();
    });

    app.post("/api/telemetry/ping", async (req, res) => {
      await ensureInfra();
      const visitorId = String(req.body?.visitorId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
      if (!visitorId) return res.status(400).json({ ok: false, error: "VISITOR_ID_REQUIRED" });
      const now = Date.now();
      const cutoff = now - 2 * 60 * 1000;
      const user = await sessionUser(req);
      await redis.zAdd("presence:visitors", [{ score: now, value: visitorId }]);
      await redis.zRemRangeByScore("presence:visitors", 0, cutoff);
      await redis.pfAdd(`visits:day:${dayKey()}`, visitorId);
      await redis.expire(`visits:day:${dayKey()}`, 60 * 60 * 24 * 90);
      if (user) {
        await redis.zAdd("presence:users", [{ score: now, value: String(user.id) }]);
        await redis.zRemRangeByScore("presence:users", 0, cutoff);
      }
      res.json({ ok: true });
    });

    app.get("/api/admin/stats", async (req, res) => {
      const admin = await requireAdmin(req, res); if (!admin) return;
      await ensureInfra();
      const cutoff = Date.now() - 2 * 60 * 1000;
      await redis.zRemRangeByScore("presence:visitors", 0, cutoff);
      await redis.zRemRangeByScore("presence:users", 0, cutoff);
      const [onlineVisitors, onlineUsers, visitorsToday, users, newToday, rooms, messages, errorsToday] = await Promise.all([
        redis.zCard("presence:visitors"), redis.zCard("presence:users"), redis.pfCount(`visits:day:${dayKey()}`),
        pool.query("SELECT COUNT(*)::int c FROM users"),
        pool.query("SELECT COUNT(*)::int c FROM users WHERE created_at >= CURRENT_DATE"),
        pool.query("SELECT COUNT(*)::int c FROM rooms"),
        pool.query("SELECT COUNT(*)::int c FROM messages"),
        pool.query("SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at >= CURRENT_DATE")
      ]);
      res.json({ ok: true, admin: { username: admin.username }, stats: {
        onlineVisitors, onlineUsers, visitorsToday,
        registeredUsers: users.rows[0].c, newUsersToday: newToday.rows[0].c,
        rooms: rooms.rows[0].c, messages: messages.rows[0].c, errorsToday: errorsToday.rows[0].c
      }});
    });

    app.get("/api/admin/logs", async (req, res) => {
      const admin = await requireAdmin(req, res); if (!admin) return;
      const level = String(req.query.level || "").toUpperCase();
      const q = String(req.query.q || "").trim().slice(0, 80);
      const limit = Math.min(200, Math.max(20, Number(req.query.limit) || 100));
      const result = await pool.query(`SELECT id,level,category,action,username,method,path,status_code,duration_ms,ip_address,user_agent,meta,created_at
        FROM operation_logs
        WHERE ($1='' OR level=$1) AND ($2='' OR action ILIKE '%'||$2||'%' OR COALESCE(username,'') ILIKE '%'||$2||'%')
        ORDER BY id DESC LIMIT $3`, [level, q, limit]);
      res.json({ ok: true, logs: result.rows });
    });

    app.post("/api/profile/location", async (req, res) => {
      const user = await sessionUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      const city = String(req.body?.city || "").trim().slice(0, 80);
      const lat = Number(req.body?.latitude); const lng = Number(req.body?.longitude);
      const shareMap = Boolean(req.body?.shareMap);
      const validCoords = Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;
      await pool.query(`INSERT INTO user_locations(user_id,city,latitude,longitude,share_map,updated_at)
        VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET city=EXCLUDED.city,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,share_map=EXCLUDED.share_map,updated_at=NOW()`,
        [user.id, city, validCoords ? lat : null, validCoords ? lng : null, shareMap]);
      res.json({ ok: true });
    });

    app.get("/api/map/places", async (req, res) => {
      const user = await sessionUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      const result = await pool.query(`SELECT city, ROUND(AVG(latitude)::numeric,3) latitude, ROUND(AVG(longitude)::numeric,3) longitude, COUNT(*)::int users
        FROM user_locations WHERE share_map=TRUE AND city<>'' AND latitude IS NOT NULL AND longitude IS NOT NULL
        GROUP BY city ORDER BY users DESC LIMIT 100`);
      res.json({ ok: true, places: result.rows });
    });
  }
  return originalCreateServer(app, ...args);
};
