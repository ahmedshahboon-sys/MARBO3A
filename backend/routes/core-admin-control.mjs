import {pool,redis,ensureRedis,requireAdmin} from "../runtime.mjs";

const num=row=>Number(row?.c||0);
async function safeRows(sql,params=[],fallback=[]){try{return(await pool.query(sql,params)).rows}catch(e){console.error("admin control metric",e?.message||e);return fallback}}
async function safeCount(sql){return num((await safeRows(sql,[],[{c:0}]))[0])}

export function registerCoreAdminControl(app){
  app.get("/api/admin/control/overview",async(req,res)=>{try{
    const admin=await requireAdmin(req,res);if(!admin)return;
    let onlineUsers=0,onlineVisitors=0;
    try{
      await ensureRedis();
      const cutoff=Date.now()-90000;
      await Promise.all([
        redis.zRemRangeByScore("presence:users",0,cutoff).catch(()=>{}),
        redis.zRemRangeByScore("presence:visitors",0,cutoff).catch(()=>{})
      ]);
      [onlineUsers,onlineVisitors]=await Promise.all([
        redis.zCard("presence:users").catch(()=>0),
        redis.zCard("presence:visitors").catch(()=>0)
      ]);
    }catch(e){console.error("admin control presence",e?.message||e)}
    const [
      openReports,errorsHour,errorsDay,newUsersHour,newUsersDay,messagesHour,messagesDay,
      activeRooms,admins,moderators,activeBroadcasts,recentUsers,recentErrors,recentReports
    ]=await Promise.all([
      safeCount(`SELECT COUNT(*)::int c FROM reports WHERE status='open'`),
      safeCount(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=NOW()-INTERVAL '1 hour'`),
      safeCount(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=CURRENT_DATE`),
      safeCount(`SELECT COUNT(*)::int c FROM users WHERE created_at>=NOW()-INTERVAL '1 hour'`),
      safeCount(`SELECT COUNT(*)::int c FROM users WHERE created_at>=CURRENT_DATE`),
      safeCount(`SELECT ((SELECT COUNT(*) FROM messages WHERE created_at>=NOW()-INTERVAL '1 hour')+(SELECT COUNT(*) FROM direct_messages WHERE created_at>=NOW()-INTERVAL '1 hour'))::int c`),
      safeCount(`SELECT ((SELECT COUNT(*) FROM messages WHERE created_at>=CURRENT_DATE)+(SELECT COUNT(*) FROM direct_messages WHERE created_at>=CURRENT_DATE))::int c`),
      safeCount(`SELECT COUNT(DISTINCT room_id)::int c FROM messages WHERE created_at>=NOW()-INTERVAL '24 hours'`),
      safeCount(`SELECT COUNT(*)::int c FROM users WHERE role='admin'`),
      safeCount(`SELECT COUNT(*)::int c FROM users WHERE role='moderator'`),
      safeCount(`SELECT COUNT(*)::int c FROM admin_broadcasts WHERE persist_until IS NOT NULL AND persist_until>NOW()`),
      safeRows(`SELECT id,username,display_name,role,account_status,created_at FROM users ORDER BY id DESC LIMIT 6`),
      safeRows(`SELECT id,category,action,status_code,path,created_at FROM operation_logs WHERE level='ERROR' ORDER BY id DESC LIMIT 6`),
      safeRows(`SELECT r.id,r.reason,r.target_type,r.target_id,r.created_at,u.username reporter_username FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.id DESC LIMIT 6`)
    ]);
    res.json({ok:true,overview:{
      generatedAt:new Date().toISOString(),admin:{id:admin.id,username:admin.username},
      live:{onlineUsers:Number(onlineUsers||0),onlineVisitors:Number(onlineVisitors||0)},
      moderation:{openReports,errorsHour,errorsToday:errorsDay},
      growth:{newUsersHour,newUsersToday:newUsersDay},
      activity:{messagesHour,messagesToday:messagesDay,activeRooms24h:activeRooms},
      access:{admins,moderators},
      broadcasts:{active:activeBroadcasts},
      recent:{users:recentUsers,errors:recentErrors,reports:recentReports}
    }});
  }catch(e){console.error("admin control overview",e);res.status(500).json({ok:false,error:"ADMIN_CONTROL_OVERVIEW_FAILED"})}});
}
