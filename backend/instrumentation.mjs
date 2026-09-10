import http from "http";
import pg from "pg";
import { createClient } from "redis";

const originalCreateServer = http.createServer.bind(http);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", err => console.error("Platform Redis:", err));
const sseClients = new Set();
let infraPromise;

function clean(v = "", max = 300) { return String(v).trim().slice(0, max); }
function dayKey() { return new Date().toISOString().slice(0, 10); }
function clientIp(req) { return clean(String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0], 80); }
function safePath(req) { return clean(String(req.originalUrl || req.url || "").split("?")[0], 300); }

async function ensureInfra() {
  if (!infraPromise) infraPromise = (async () => {
    if (!redis.isOpen) await redis.connect();
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
    await pool.query(`CREATE TABLE IF NOT EXISTS operation_logs(id BIGSERIAL PRIMARY KEY,level TEXT NOT NULL DEFAULT 'INFO',category TEXT NOT NULL DEFAULT 'API',action TEXT NOT NULL,user_id BIGINT,username TEXT,method TEXT,path TEXT,status_code INTEGER,duration_ms INTEGER,ip_address TEXT,user_agent TEXT,meta JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS operation_logs_created_idx ON operation_logs(id DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS debug_events(id BIGSERIAL PRIMARY KEY,user_id BIGINT,source TEXT NOT NULL,level TEXT NOT NULL DEFAULT 'ERROR',message TEXT NOT NULL,context JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS debug_events_created_idx ON debug_events(id DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_locations(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,city TEXT NOT NULL DEFAULT '',latitude NUMERIC(9,6),longitude NUMERIC(9,6),share_map BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_settings(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,theme TEXT NOT NULL DEFAULT 'dark',notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,notification_sounds BOOLEAN NOT NULL DEFAULT TRUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_broadcasts(id BIGSERIAL PRIMARY KEY,admin_id BIGINT REFERENCES users(id) ON DELETE SET NULL,message TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'info',duration_ms INTEGER NOT NULL DEFAULT 5000,sound BOOLEAN NOT NULL DEFAULT FALSE,action_label TEXT,action_url TEXT,target_type TEXT NOT NULL DEFAULT 'all',target_id BIGINT,persist_until TIMESTAMPTZ,delivered_count INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS admin_broadcasts_created_idx ON admin_broadcasts(id DESC)`);
  })().catch(e => { infraPromise = null; throw e; });
  return infraPromise;
}

function tokenFrom(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match?.[1] || "";
}
async function sessionUser(req) {
  await ensureInfra();
  const token = tokenFrom(req); if (!token) return null;
  const id = await redis.get(`session:${token}`); if (!id) return null;
  return (await pool.query(`SELECT id,email,username,display_name,account_status,last_seen_at FROM users WHERE id=$1`, [id])).rows[0] || null;
}
async function requireAdmin(req, res) {
  const user = await sessionUser(req);
  if (!user) { res.status(401).json({ok:false,error:"UNAUTHORIZED"}); return null; }
  if (String(user.username).toLowerCase() !== "ahmed") { res.status(403).json({ok:false,error:"ADMIN_ONLY"}); return null; }
  return user;
}
async function writeLog(entry) {
  try {
    await ensureInfra();
    await pool.query(`INSERT INTO operation_logs(level,category,action,user_id,username,method,path,status_code,duration_ms,ip_address,user_agent,meta) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`, [entry.level||"INFO",entry.category||"API",clean(entry.action,200),entry.userId||null,entry.username||null,entry.method||null,entry.path||null,entry.statusCode||null,entry.durationMs||null,entry.ip||null,clean(entry.userAgent,300),JSON.stringify(entry.meta||{})]);
  } catch(e) { console.error("operation log failed:", e.message); }
}
function sendSse(payload) {
  const wire = `event: broadcast\ndata: ${JSON.stringify(payload)}\n\n`;
  let delivered = 0;
  for (const res of [...sseClients]) { try { res.write(wire); delivered++; } catch { sseClients.delete(res); } }
  return delivered;
}

http.createServer = function patchedCreateServer(app, ...args) {
  if (typeof app === "function" && app?.use) {
    ensureInfra().catch(err => console.error("Platform init:", err));

    app.use((req,res,next) => {
      const started = Date.now();
      res.on("finish", async () => {
        const path = safePath(req);
        if (path === "/api/telemetry/ping" || path === "/api/realtime/broadcasts") return;
        if (["GET","HEAD","OPTIONS"].includes(req.method) && res.statusCode < 400) return;
        let user = null; try { user = await sessionUser(req); } catch {}
        const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARNING" : "INFO";
        const category = path.includes("/auth/") ? "AUTH" : path.includes("/admin/") ? "ADMIN" : path.includes("/rooms") ? "ROOMS" : path.includes("/friends") ? "FRIENDS" : "API";
        writeLog({level,category,action:`${req.method} ${path}`,userId:user?.id,username:user?.username,method:req.method,path,statusCode:res.statusCode,durationMs:Date.now()-started,ip:clientIp(req),userAgent:req.headers["user-agent"]});
      });
      next();
    });

    app.post("/api/telemetry/ping", async(req,res) => {
      await ensureInfra();
      const visitorId = String(req.body?.visitorId || "").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,80);
      if (!visitorId) return res.status(400).json({ok:false,error:"VISITOR_ID_REQUIRED"});
      const now = Date.now(), cutoff = now - 90000;
      const user = await sessionUser(req);
      await redis.zAdd("presence:visitors",[{score:now,value:visitorId}]);
      await redis.zRemRangeByScore("presence:visitors",0,cutoff);
      await redis.pfAdd(`visits:day:${dayKey()}`,visitorId);
      await redis.expire(`visits:day:${dayKey()}`,7776000);
      if (user) {
        await redis.zAdd("presence:users",[{score:now,value:String(user.id)}]);
        await redis.zRemRangeByScore("presence:users",0,cutoff);
        await pool.query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`,[user.id]);
      }
      res.json({ok:true,online:await redis.zCard("presence:users")});
    });

    app.get("/api/presence", async(_req,res) => {
      await ensureInfra(); const cutoff=Date.now()-90000;
      await redis.zRemRangeByScore("presence:users",0,cutoff);
      res.json({ok:true,onlineUsers:await redis.zCard("presence:users")});
    });

    app.get("/api/realtime/broadcasts", async(req,res) => {
      res.setHeader("Content-Type","text/event-stream"); res.setHeader("Cache-Control","no-cache,no-transform"); res.setHeader("Connection","keep-alive"); res.setHeader("X-Accel-Buffering","no");
      res.flushHeaders?.(); res.write(`event: ready\ndata: {}\n\n`); sseClients.add(res);
      const heartbeat=setInterval(()=>{ try{res.write(`: ping\n\n`);}catch{} },25000);
      req.on("close",()=>{clearInterval(heartbeat);sseClients.delete(res);});
    });

    app.get("/api/broadcasts/active", async(_req,res) => {
      await ensureInfra();
      const rows=(await pool.query(`SELECT id,message,kind,duration_ms,sound,action_label,action_url,created_at,persist_until FROM admin_broadcasts WHERE persist_until IS NOT NULL AND persist_until>NOW() ORDER BY id DESC LIMIT 5`)).rows;
      res.json({ok:true,broadcasts:rows});
    });

    app.post("/api/admin/broadcasts", async(req,res) => {
      const admin=await requireAdmin(req,res); if(!admin) return;
      const message=clean(req.body?.message,500); if(!message) return res.status(400).json({ok:false,error:"MESSAGE_REQUIRED"});
      const kind=["normal","info","alert","warning","announcement"].includes(req.body?.kind)?req.body.kind:"info";
      const duration=Math.max(1000,Math.min(60000,Number(req.body?.durationMs)||5000));
      const persistSeconds=Math.max(0,Math.min(86400,Number(req.body?.persistSeconds)||0));
      const actionLabel=clean(req.body?.actionLabel,40)||null, actionUrl=clean(req.body?.actionUrl,300)||null;
      const row=(await pool.query(`INSERT INTO admin_broadcasts(admin_id,message,kind,duration_ms,sound,action_label,action_url,persist_until) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::int>0 THEN NOW()+($8||' seconds')::interval ELSE NULL END) RETURNING *`,[admin.id,message,kind,duration,Boolean(req.body?.sound),actionLabel,actionUrl,persistSeconds])).rows[0];
      const delivered=sendSse(row); await pool.query(`UPDATE admin_broadcasts SET delivered_count=$1 WHERE id=$2`,[delivered,row.id]);
      await writeLog({level:"INFO",category:"ADMIN",action:"broadcast.send",userId:admin.id,username:admin.username,ip:clientIp(req),meta:{broadcastId:row.id,kind,durationMs:duration,delivered,message}});
      res.status(201).json({ok:true,broadcast:{...row,delivered_count:delivered}});
    });

    app.get("/api/admin/broadcasts", async(req,res) => { const a=await requireAdmin(req,res); if(!a)return; res.json({ok:true,broadcasts:(await pool.query(`SELECT * FROM admin_broadcasts ORDER BY id DESC LIMIT 100`)).rows}); });

    app.post("/api/debug/report", async(req,res) => {
      await ensureInfra(); const user=await sessionUser(req);
      const source=clean(req.body?.source,40)||"frontend", level=["INFO","WARNING","ERROR"].includes(String(req.body?.level).toUpperCase())?String(req.body.level).toUpperCase():"ERROR", message=clean(req.body?.message,1000);
      if(!message) return res.status(400).json({ok:false,error:"MESSAGE_REQUIRED"});
      const context={url:clean(req.body?.context?.url,300),component:clean(req.body?.context?.component,120),stack:clean(req.body?.context?.stack,2000),ua:clean(req.headers["user-agent"],300)};
      await pool.query(`INSERT INTO debug_events(user_id,source,level,message,context) VALUES($1,$2,$3,$4,$5::jsonb)`,[user?.id||null,source,level,message,JSON.stringify(context)]);
      res.status(201).json({ok:true});
    });
    app.get("/api/admin/debug", async(req,res) => { const a=await requireAdmin(req,res); if(!a)return; const q=clean(req.query.q,80); const rows=(await pool.query(`SELECT d.*,u.username FROM debug_events d LEFT JOIN users u ON u.id=d.user_id WHERE ($1='' OR d.message ILIKE '%'||$1||'%' OR d.source ILIKE '%'||$1||'%') ORDER BY d.id DESC LIMIT 200`,[q])).rows; res.json({ok:true,events:rows}); });

    app.get("/api/settings", async(req,res) => { const u=await sessionUser(req); if(!u)return res.status(401).json({ok:false,error:"UNAUTHORIZED"}); await ensureInfra(); await pool.query(`INSERT INTO user_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING`,[u.id]); res.json({ok:true,settings:(await pool.query(`SELECT theme,notifications_enabled,notification_sounds FROM user_settings WHERE user_id=$1`,[u.id])).rows[0]}); });
    app.patch("/api/settings", async(req,res) => { const u=await sessionUser(req); if(!u)return res.status(401).json({ok:false,error:"UNAUTHORIZED"}); const theme=["dark","light","system"].includes(req.body?.theme)?req.body.theme:"dark"; const row=(await pool.query(`INSERT INTO user_settings(user_id,theme,notifications_enabled,notification_sounds) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET theme=EXCLUDED.theme,notifications_enabled=EXCLUDED.notifications_enabled,notification_sounds=EXCLUDED.notification_sounds,updated_at=NOW() RETURNING theme,notifications_enabled,notification_sounds`,[u.id,theme,Boolean(req.body?.notificationsEnabled),Boolean(req.body?.notificationSounds)])).rows[0]; res.json({ok:true,settings:row}); });

    app.get("/api/admin/stats", async(req,res) => {
      const a=await requireAdmin(req,res); if(!a)return; await ensureInfra(); const cutoff=Date.now()-90000;
      await redis.zRemRangeByScore("presence:visitors",0,cutoff); await redis.zRemRangeByScore("presence:users",0,cutoff);
      const [ov,ou,vt,users,newToday,active24,rooms,activeRooms,msgs,errors,frozen,banned]=await Promise.all([redis.zCard("presence:visitors"),redis.zCard("presence:users"),redis.pfCount(`visits:day:${dayKey()}`),pool.query(`SELECT COUNT(*)::int c FROM users`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE created_at>=CURRENT_DATE`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE last_seen_at>=NOW()-INTERVAL '24 hours'`),pool.query(`SELECT COUNT(*)::int c FROM rooms`),pool.query(`SELECT COUNT(DISTINCT room_id)::int c FROM messages WHERE created_at>=NOW()-INTERVAL '24 hours'`),pool.query(`SELECT (SELECT COUNT(*) FROM messages)+(SELECT COUNT(*) FROM direct_messages)::int c`),pool.query(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=CURRENT_DATE`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE account_status='frozen'`),pool.query(`SELECT COUNT(*)::int c FROM users WHERE account_status='banned'`)]);
      res.json({ok:true,admin:{username:a.username},stats:{onlineVisitors:ov,onlineUsers:ou,visitorsToday:vt,registeredUsers:users.rows[0].c,newUsersToday:newToday.rows[0].c,activeUsers24h:active24.rows[0].c,rooms:rooms.rows[0].c,activeRooms24h:activeRooms.rows[0].c,messages:msgs.rows[0].c,errorsToday:errors.rows[0].c,frozen:frozen.rows[0].c,banned:banned.rows[0].c}});
    });

    app.get("/api/admin/logs", async(req,res) => { const a=await requireAdmin(req,res); if(!a)return; const level=clean(req.query.level,20).toUpperCase(),q=clean(req.query.q,80),limit=Math.min(200,Math.max(20,Number(req.query.limit)||100)); const rows=(await pool.query(`SELECT id,level,category,action,username,method,path,status_code,duration_ms,ip_address,user_agent,meta,created_at FROM operation_logs WHERE ($1='' OR level=$1) AND ($2='' OR action ILIKE '%'||$2||'%' OR COALESCE(username,'') ILIKE '%'||$2||'%') ORDER BY id DESC LIMIT $3`,[level,q,limit])).rows; res.json({ok:true,logs:rows}); });

    app.post("/api/profile/location", async(req,res) => { const u=await sessionUser(req); if(!u)return res.status(401).json({ok:false,error:"UNAUTHORIZED"}); const city=clean(req.body?.city,80),lat=Number(req.body?.latitude),lng=Number(req.body?.longitude),valid=Number.isFinite(lat)&&lat>=-90&&lat<=90&&Number.isFinite(lng)&&lng>=-180&&lng<=180; await pool.query(`INSERT INTO user_locations(user_id,city,latitude,longitude,share_map,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET city=EXCLUDED.city,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,share_map=EXCLUDED.share_map,updated_at=NOW()`,[u.id,city,valid?lat:null,valid?lng:null,Boolean(req.body?.shareMap)]); res.json({ok:true}); });
    app.get("/api/map/places", async(req,res) => { const u=await sessionUser(req); if(!u)return res.status(401).json({ok:false,error:"UNAUTHORIZED"}); const rows=(await pool.query(`SELECT city,ROUND(AVG(latitude)::numeric,3) latitude,ROUND(AVG(longitude)::numeric,3) longitude,COUNT(*)::int users FROM user_locations WHERE share_map=TRUE AND city<>'' AND latitude IS NOT NULL AND longitude IS NOT NULL GROUP BY city ORDER BY users DESC LIMIT 100`)).rows; res.json({ok:true,places:rows}); });
  }
  return originalCreateServer(app,...args);
};
