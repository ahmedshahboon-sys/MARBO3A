import express from "express";
import http from "http";
import {restoreHttpCreateServer} from "./bootstrap.mjs";
import {pool,redis,ensureRedis} from "./runtime.mjs";
import {attachRealtime} from "./realtime.mjs";
import {registerExplicitRoutes} from "./routes/index.mjs";

const app=express();
// bootstrap instrumentation owns /api/telemetry/ping when createServer is invoked.
// Keep a single canonical telemetry owner instead of registering an unreachable
// second handler later in this file.
const server=http.createServer(app);
restoreHttpCreateServer();

registerExplicitRoutes(app);
attachRealtime(server);

async function publicHealth(_req,res){
  res.setHeader("Cache-Control","no-store");
  try{await pool.query("SELECT 1");return res.json({ok:true})}
  catch{return res.status(503).json({ok:false})}
}
app.get("/health",publicHealth);
app.get("/api/health",publicHealth);

await ensureRedis();
server.listen(4000,"0.0.0.0",()=>console.log("MARBO3A API listening on 4000 · explicit routes · realtime + presence"));
