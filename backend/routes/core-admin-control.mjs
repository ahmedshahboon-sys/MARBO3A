import {pool,redis,ensureRedis,requireAdmin} from "../runtime.mjs";

const num=row=>Number(row?.c||0);

export function registerCoreAdminControl(app){
  app.get("/api/admin/control/overview",async(req,res)=>{try{
    const admin=await requireAdmin(req,res);if(!admin)return;
    await ensureRedis();
    const cutoff=Date.now()-90000;
    await Promise.all([
      redis.zRemRangeByScore("presence:users",0,cutoff).catch(()=>{}),
      redis.zRemRangeByScore("presence:visitors",0,cutoff).catch(()=>{})
    ]);
    const [
      onlineUsers,onlineVisitors,openReports,errorsHour,errorsDay,newUsersHour,newUsersDay,
      messagesHour,messagesDay,activeRooms,admins,moderators,activeBroadcasts,recentUsers,recentErrors,recentReports
    ]=await Promise.all([
      redis.zCard("presence:users").catch(()=>0),
      redis.zCard("presence:visitors").catch(()=>0),
      pool.query(`SELECT COUNT(*)::int c FROM reports WHERE status='open'`),
      pool.query(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=NOW()-INTERVAL '1 hour'`),
      pool.query(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=CURRENT_DATE`),
      pool.query(`SELECT COUNT(*)::int c FROM users WHERE created_at>=NOW()-INTERVAL '1 hour'`),
      pool.query(`SELECT COUNT(*)::int c FROM users WHERE created_at>=CURRENT_DATE`),
      pool.query(`SELECT ((SELECT COUNT(*) FROM messages WHERE created_at>=NOW()-INTERVAL '1 hour')+(SELECT COUNT(*) FROM direct_messages WHERE created_at>=NOW()-INTERVAL '1 hour'))::int c`),
      pool.query(`SELECT ((SELECT COUNT(*) FROM messages WHERE created_at>=CURRENT_DATE)+(SELECT COUNT(*) FROM direct_messages WHERE created_at>=CURRENT_DATE))::int c`),
      pool.query(`SELECT COUNT(DISTINCT room_id)::int c FROM messages WHERE created_at>=NOW()-INTERVAL '24 hours'`),
      pool.query(`SELECT COUNT(*)::int c FROM users WHERE role='admin'`),
      pool.query(`SELECT COUNT(*)::int c FROM users WHERE role='moderator'`),
      pool.query(`SELECT COUNT(*)::int c FROM admin_broadcasts WHERE persist_until IS NOT NULL AND persist_until>NOW()`),
      pool.query(`SELECT id,username,display_name,role,account_status,created_at FROM users ORDER BY id DESC LIMIT 6`),
      pool.query(`SELECT id,category,action,status_code,path,created_at FROM operation_logs WHERE level='ERROR' ORDER BY id DESC LIMIT 6`),
      pool.query(`SELECT r.id,r.reason,r.target_type,r.target_id,r.created_at,u.username reporter_username FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.id DESC LIMIT 6`)
    ]);
    res.json({ok:true,overview:{
      generatedAt:new Date().toISOString(),admin:{id:admin.id,username:admin.username},
      live:{onlineUsers:Number(onlineUsers||0),onlineVisitors:Number(onlineVisitors||0)},
      moderation:{openReports:num(openReports.rows[0]),errorsHour:num(errorsHour.rows[0]),errorsToday:num(errorsDay.rows[0])},
      growth:{newUsersHour:num(newUsersHour.rows[0]),newUsersToday:num(newUsersDay.rows[0])},
      activity:{messagesHour:num(messagesHour.rows[0]),messagesToday:num(messagesDay.rows[0]),activeRooms24h:num(activeRooms.rows[0])},
      access:{admins:num(admins.rows[0]),moderators:num(moderators.rows[0])},
      broadcasts:{active:num(activeBroadcasts.rows[0])},
      recent:{users:recentUsers.rows,errors:recentErrors.rows,reports:recentReports.rows}
    }});
  }catch(e){console.error("admin control overview",e);res.status(500).json({ok:false,error:"ADMIN_CONTROL_OVERVIEW_FAILED"})}});
}
