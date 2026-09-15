import fs from "node:fs";
import {pool,redis,ensureRedis,requireAdmin} from "../runtime.mjs";

const num=row=>Number(row?.c||0);
async function safeRows(sql,params=[],fallback=[]){try{return(await pool.query(sql,params)).rows}catch(e){console.error("admin control metric",e?.message||e);return fallback}}
async function safeCount(sql){return num((await safeRows(sql,[],[{c:0}]))[0])}
const configured=name=>{const value=String(process.env[name]||"").trim();return Boolean(value&&value.length>20&&!/^(CHANGE_ME|YOUR_|REPLACE_ME)/i.test(value))};

export function registerCoreAdminControl(app){
  app.get("/api/admin/control/overview",async(req,res)=>{try{
    const admin=await requireAdmin(req,res);if(!admin)return;
    let onlineUsers=0,onlineVisitors=0,visitorsToday=0;
    try{
      await ensureRedis();const cutoff=Date.now()-90000;
      await Promise.all([redis.zRemRangeByScore("presence:users",0,cutoff).catch(()=>{}),redis.zRemRangeByScore("presence:visitors",0,cutoff).catch(()=>{})]);
      const day=new Date().toISOString().slice(0,10);
      [onlineUsers,onlineVisitors,visitorsToday]=await Promise.all([redis.zCard("presence:users").catch(()=>0),redis.zCard("presence:visitors").catch(()=>0),redis.pfCount(`visits:day:${day}`).catch(()=>0)]);
    }catch(e){console.error("admin control presence",e?.message||e)}
    const [openReports,errorsHour,errorsDay,newUsersHour,newUsersDay,messagesHour,messagesDay,activeRooms,admins,moderators,activeBroadcasts,registeredUsers,activeUsers24h,rooms,frozen,banned,totalMessages,recentUsers,recentErrors,recentReports]=await Promise.all([
      safeCount(`SELECT COUNT(*)::int c FROM reports WHERE status='open'`),safeCount(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=NOW()-INTERVAL '1 hour'`),safeCount(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=CURRENT_DATE`),safeCount(`SELECT COUNT(*)::int c FROM users WHERE created_at>=NOW()-INTERVAL '1 hour'`),safeCount(`SELECT COUNT(*)::int c FROM users WHERE created_at>=CURRENT_DATE`),safeCount(`SELECT ((SELECT COUNT(*) FROM messages WHERE created_at>=NOW()-INTERVAL '1 hour')+(SELECT COUNT(*) FROM direct_messages WHERE created_at>=NOW()-INTERVAL '1 hour'))::int c`),safeCount(`SELECT ((SELECT COUNT(*) FROM messages WHERE created_at>=CURRENT_DATE)+(SELECT COUNT(*) FROM direct_messages WHERE created_at>=CURRENT_DATE))::int c`),safeCount(`SELECT COUNT(DISTINCT room_id)::int c FROM messages WHERE created_at>=NOW()-INTERVAL '24 hours'`),safeCount(`SELECT COUNT(*)::int c FROM users WHERE role='admin'`),safeCount(`SELECT COUNT(*)::int c FROM users WHERE role='moderator'`),safeCount(`SELECT COUNT(*)::int c FROM admin_broadcasts WHERE persist_until IS NOT NULL AND persist_until>NOW()`),safeCount(`SELECT COUNT(*)::int c FROM users`),safeCount(`SELECT COUNT(*)::int c FROM users WHERE last_seen_at>=NOW()-INTERVAL '24 hours'`),safeCount(`SELECT COUNT(*)::int c FROM rooms`),safeCount(`SELECT COUNT(*)::int c FROM users WHERE account_status='frozen'`),safeCount(`SELECT COUNT(*)::int c FROM users WHERE account_status='banned'`),safeCount(`SELECT ((SELECT COUNT(*) FROM messages)+(SELECT COUNT(*) FROM direct_messages))::int c`),safeRows(`SELECT id,username,display_name,role,account_status,created_at FROM users ORDER BY id DESC LIMIT 6`),safeRows(`SELECT id,category,action,status_code,path,created_at FROM operation_logs WHERE level='ERROR' ORDER BY id DESC LIMIT 6`),safeRows(`SELECT r.id,r.reason,r.target_type,r.target_id,r.created_at,u.username reporter_username FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.id DESC LIMIT 6`)
    ]);
    res.json({ok:true,overview:{generatedAt:new Date().toISOString(),admin:{id:admin.id,username:admin.username},live:{onlineUsers:Number(onlineUsers||0),onlineVisitors:Number(onlineVisitors||0),visitorsToday:Number(visitorsToday||0)},moderation:{openReports,errorsHour,errorsToday:errorsDay,frozen,banned},growth:{newUsersHour,newUsersToday:newUsersDay,registeredUsers,activeUsers24h},activity:{messagesHour,messagesToday:messagesDay,totalMessages,activeRooms24h:activeRooms,rooms},access:{admins,moderators},broadcasts:{active:activeBroadcasts},recent:{users:recentUsers,errors:recentErrors,reports:recentReports}}});
  }catch(e){console.error("admin control overview",e);res.status(500).json({ok:false,error:"ADMIN_CONTROL_OVERVIEW_FAILED"})}});

  app.get("/api/admin/system",async(req,res)=>{try{
    const admin=await requireAdmin(req,res);if(!admin)return;
    const db=(await pool.query(`SELECT NOW() now,pg_database_size(current_database()) db_bytes`)).rows[0],mem=process.memoryUsage();let disk=null,redisReady=false;
    try{const s=fs.statfsSync("/");disk={total:s.blocks*s.bsize,free:s.bfree*s.bsize}}catch{}
    try{await ensureRedis();redisReady=(await redis.ping())==="PONG"}catch{}
    res.json({ok:true,system:{uptimeSeconds:Math.round(process.uptime()),memory:{rss:mem.rss,heapUsed:mem.heapUsed,heapTotal:mem.heapTotal},database:db,redis:redisReady,disk,push:configured("VAPID_PUBLIC_KEY")&&configured("VAPID_PRIVATE_KEY"),email:configured("BREVO_API_KEY"),node:process.version}});
  }catch(e){console.error("admin system",e);res.status(500).json({ok:false,error:"ADMIN_SYSTEM_FAILED"})}});
}
