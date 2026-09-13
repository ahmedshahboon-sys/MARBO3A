import express from "express";
import http from "http";
import {pool,redis,ensureRedis,sessionUser,ipOf,clean} from "./runtime.mjs";
import {registerAuthRegistration} from "./routes/auth-registration.mjs";
import {registerCoreRooms} from "./routes/core-rooms.mjs";
import {registerCoreMessaging} from "./routes/core-messaging.mjs";
import {registerCoreSocial} from "./routes/core-social.mjs";
import {registerCoreLocation} from "./routes/core-location.mjs";
import {registerCoreAdminRooms} from "./routes/core-admin-rooms.mjs";

const app=express();
const server=http.createServer(app);

registerAuthRegistration(app);
registerCoreRooms(app);
registerCoreMessaging(app);
registerCoreSocial(app);
registerCoreLocation(app);
registerCoreAdminRooms(app);

app.get("/health",async(_req,res)=>{try{await pool.query("SELECT 1");res.json({ok:true,project:"MARBO3A",database:true,redis:redis.isReady})}catch{res.status(503).json({ok:false,project:"MARBO3A",database:false,redis:redis.isReady})}});
app.get("/api/health",async(_req,res)=>{let database="connected";try{await pool.query("SELECT 1")}catch{database="disconnected"}res.status(database==="connected"?200:503).json({ok:database==="connected",api:"MARBO3A API",database,realtime:"ready",redis:redis.isReady?"connected":"disconnected",email:process.env.BREVO_API_KEY?"configured":"missing",time:new Date().toISOString()})});
app.post("/api/telemetry/ping",async(req,res)=>{const visitorId=clean(req.body?.visitorId,100);if(!visitorId)return res.status(400).json({ok:false});const user=await sessionUser(req).catch(()=>null);await pool.query(`INSERT INTO visitor_presence(visitor_id,user_id,last_seen,first_seen,last_ip) VALUES($1,$2,NOW(),NOW(),$3) ON CONFLICT(visitor_id) DO UPDATE SET user_id=EXCLUDED.user_id,last_seen=NOW(),last_ip=EXCLUDED.last_ip`,[visitorId,user?.id||null,ipOf(req)]);res.json({ok:true})});

await ensureRedis();
server.listen(4000,"0.0.0.0",()=>console.log("MARBO3A API listening on 4000 · shared runtime · realtime v2"));
