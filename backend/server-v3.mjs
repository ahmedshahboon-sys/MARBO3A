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

app.get("/health",async(_req,res)=>{try{await pool.query("SELECT 1");res.json({ok:true,project:"MARBO3A",database:true,redis:redis.isReady})}catch{res.status(503).json({ok:false,project:"MARBO3A",database:false,redis:redis.isReady})}});
app.get("/api/health",async(_req,res)=>{let database="connected";try{await pool.query("SELECT 1")}catch{database="disconnected"}res.status(database==="connected"?200:503).json({ok:database==="connected",api:"MARBO3A API",database,realtime:"ready",redis:redis.isReady?"connected":"disconnected",email:process.env.BREVO_API_KEY?"configured":"missing",time:new Date().toISOString()})});

await ensureRedis();
server.listen(4000,"0.0.0.0",()=>console.log("MARBO3A API listening on 4000 · explicit routes · realtime + presence"));
