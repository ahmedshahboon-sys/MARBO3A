import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import pg from "pg";
import { createClient } from "redis";

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const redis = createClient({
  url: process.env.REDIS_URL
});

redis.on("error", err => console.error("Redis:", err));

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
      time: db.rows[0].now
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
