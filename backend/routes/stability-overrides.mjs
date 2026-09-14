import {pool,requireAdmin,redis,ensureRedis} from "../runtime.mjs";

const LY_TZ="Africa/Tripoli";
const row0=(rows,fallback={})=>rows?.[0]||fallback;
async function safeRows(sql,params=[],fallback=[]){
  try{return(await pool.query(sql,params)).rows}catch(e){console.error("stability query",e?.message||e);return fallback}
}

async function audienceSnapshot(){
  await ensureRedis().catch(()=>{});
  let onlineUsers=0;
  try{
    const cutoff=Date.now()-90_000;
    const scores=await redis.zRangeWithScores("presence:users",0,-1);
    onlineUsers=scores.filter(x=>Number(x.score)>cutoff).length;
  }catch{}
  const [guestTotalRows,legacyUserRows,activeGuestRows,registeredRows,trackingRows]=await Promise.all([
    safeRows(`SELECT COUNT(*)::int c FROM guest_visitors`),
    safeRows(`SELECT COUNT(*)::int c FROM users u WHERE NOT EXISTS(SELECT 1 FROM guest_visitors g WHERE g.linked_user_id=u.id)`),
    safeRows(`SELECT COUNT(*)::int c FROM guest_visitors WHERE linked_user_id IS NULL AND last_seen_at>NOW()-INTERVAL '90 seconds'`),
    safeRows(`SELECT COUNT(*)::int c FROM users`),
    safeRows(`SELECT MIN(first_seen_at) tracking_started_at FROM guest_visitors`,[],[{tracking_started_at:null}])
  ]);
  const guestTotal=Number(row0(guestTotalRows,{c:0}).c||0);
  const legacyUsers=Number(row0(legacyUserRows,{c:0}).c||0);
  const registeredUsers=Number(row0(registeredRows,{c:0}).c||0);
  const onlineGuests=Number(row0(activeGuestRows,{c:0}).c||0);
  const totalVisitors=guestTotal+legacyUsers;
  return{
    totalVisitors,
    trackedAudience:totalVisitors,
    guestVisitorIds:guestTotal,
    registeredUsers,
    trackingStartedAt:row0(trackingRows,{tracking_started_at:null}).tracking_started_at||null,
    metricDefinition:"tracked-identities",
    onlineNow:onlineUsers+onlineGuests,
    onlineUsers,
    onlineGuests
  };
}

async function advancedAnalytics(){
  const [regs,gender,activity,logins,posts,messages,rooms,reactions,peakHours,topDays,topPages,sessionAvg,returning]=await Promise.all([
    safeRows(`SELECT COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE)::int today,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE-INTERVAL '7 days')::int week,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE-INTERVAL '30 days')::int month,COUNT(*)::int total FROM users`,[],[{today:0,week:0,month:0,total:0}]),
    safeRows(`SELECT COUNT(*) FILTER(WHERE gender='male')::int male,COUNT(*) FILTER(WHERE gender='female')::int female FROM users`,[],[{male:0,female:0}]),
    safeRows(`SELECT COUNT(*) FILTER(WHERE last_seen_at>=NOW()-INTERVAL '30 days')::int active,COUNT(*) FILTER(WHERE last_seen_at IS NULL OR last_seen_at<NOW()-INTERVAL '30 days')::int inactive FROM users`,[],[{active:0,inactive:0}]),
    safeRows(`SELECT COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE)::int today,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE-INTERVAL '7 days')::int week,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE-INTERVAL '30 days')::int month FROM platform_login_events`,[],[{today:0,week:0,month:0}]),
    safeRows(`SELECT COUNT(*) FILTER(WHERE deleted_at IS NULL)::int total,COUNT(*) FILTER(WHERE deleted_at IS NULL AND created_at>=CURRENT_DATE)::int today,COUNT(*) FILTER(WHERE deleted_at IS NULL AND created_at>=CURRENT_DATE-INTERVAL '30 days')::int month FROM posts`,[],[{total:0,today:0,month:0}]),
    safeRows(`SELECT (COALESCE((SELECT COUNT(*) FROM messages),0)+COALESCE((SELECT COUNT(*) FROM direct_messages),0))::int total,(COALESCE((SELECT COUNT(*) FROM messages WHERE created_at>=CURRENT_DATE),0)+COALESCE((SELECT COUNT(*) FROM direct_messages WHERE created_at>=CURRENT_DATE),0))::int today,(COALESCE((SELECT COUNT(*) FROM messages WHERE created_at>=CURRENT_DATE-INTERVAL '30 days'),0)+COALESCE((SELECT COUNT(*) FROM direct_messages WHERE created_at>=CURRENT_DATE-INTERVAL '30 days'),0))::int month`,[],[{total:0,today:0,month:0}]),
    safeRows(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE)::int today,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE-INTERVAL '30 days')::int month FROM rooms`,[],[{total:0,today:0,month:0}]),
    safeRows(`SELECT (COALESCE((SELECT COUNT(*) FROM post_reactions),0)+COALESCE((SELECT COUNT(*) FROM story_reactions),0))::int total,(COALESCE((SELECT COUNT(*) FROM post_reactions WHERE updated_at>=CURRENT_DATE),0)+COALESCE((SELECT COUNT(*) FROM story_reactions WHERE created_at>=CURRENT_DATE),0))::int today`,[],[{total:0,today:0}]),
    safeRows(`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${LY_TZ}')::int hour,COUNT(*)::int views FROM usage_page_views WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY views DESC,hour ASC LIMIT 8`),
    safeRows(`SELECT (created_at AT TIME ZONE '${LY_TZ}')::date day,COUNT(*)::int views FROM usage_page_views WHERE created_at>=NOW()-INTERVAL '30 days' GROUP BY 1 ORDER BY views DESC,day DESC LIMIT 10`),
    safeRows(`SELECT path,COUNT(*)::int views,COUNT(DISTINCT session_key)::int sessions FROM usage_page_views WHERE created_at>=NOW()-INTERVAL '30 days' AND path NOT LIKE '/admin%' GROUP BY path ORDER BY views DESC,path LIMIT 12`),
    safeRows(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM LEAST(last_seen_at-started_at,INTERVAL '4 hours'))),0)::int seconds FROM usage_sessions WHERE started_at>=NOW()-INTERVAL '30 days'`,[],[{seconds:0}]),
    safeRows(`SELECT COUNT(*)::int c FROM(SELECT user_id FROM usage_sessions WHERE user_id IS NOT NULL AND started_at>=NOW()-INTERVAL '30 days' GROUP BY user_id HAVING COUNT(*)>=2)x`,[],[{c:0}])
  ]);
  return{
    registrations:row0(regs,{today:0,week:0,month:0,total:0}),
    gender:row0(gender,{male:0,female:0}),
    users:row0(activity,{active:0,inactive:0}),
    logins:row0(logins,{today:0,week:0,month:0}),
    posts:row0(posts,{total:0,today:0,month:0}),
    messages:row0(messages,{total:0,today:0,month:0}),
    rooms:row0(rooms,{total:0,today:0,month:0}),
    reactions:row0(reactions,{total:0,today:0}),
    peakHours,topDays,topPages,
    averageSessionSeconds:Number(row0(sessionAvg,{seconds:0}).seconds||0),
    returningUsers:Number(row0(returning,{c:0}).c||0)
  };
}

export function registerStabilityOverrides(app){
  app.get("/api/public/site-stats",async(_req,res)=>{
    try{
      const stats=await audienceSnapshot();
      res.setHeader("Cache-Control","public,max-age=10,stale-while-revalidate=20");
      res.json({ok:true,...stats});
    }catch(e){console.error("public site stats",e);res.json({ok:true,totalVisitors:0,trackedAudience:0,guestVisitorIds:0,registeredUsers:0,trackingStartedAt:null,metricDefinition:"tracked-identities",onlineNow:0,onlineUsers:0,onlineGuests:0})}
  });

  /* Registered before Group O's legacy handler. One unavailable analytics source
     no longer takes the whole dashboard down; each metric degrades independently. */
  app.get("/api/admin/advanced/analytics",async(req,res)=>{
    const admin=await requireAdmin(req,res);if(!admin)return;
    try{
      const [analytics,audience]=await Promise.all([advancedAnalytics(),audienceSnapshot()]);
      res.json({ok:true,generatedAt:new Date().toISOString(),analytics:{...analytics,audience}});
    }catch(e){console.error("advanced analytics stable",e);res.status(500).json({ok:false,error:"ADVANCED_ANALYTICS_FAILED"})}
  });
}
