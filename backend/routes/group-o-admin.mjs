import {pool,requireAdmin,sessionUser,clean} from "../runtime.mjs";
import {SETTING_SPECS,FEATURE_SPECS,parseOperationalSetting,operationalSettingMeta,invalidateOperationalControls} from "../operational-controls.mjs";

const LY_TZ="Africa/Tripoli";
const SETTINGS=SETTING_SPECS;
const FLAGS=new Set(Object.keys(FEATURE_SPECS));
const MOD_TYPES=new Set(["posts","images","stories","comments","rooms","reports","reported_messages"]);
const safeInt=(v,min=1,max=1_000_000)=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=min&&n<=max?n:null};
const n=row=>Number(row?.c||0);
const safePath=v=>{const x=String(v||"").split("?")[0].trim();return x.startsWith("/")?x.slice(0,220):"/"};
const safeKey=v=>/^[a-zA-Z0-9_-]{16,100}$/.test(String(v||""))?String(v):"";
const auditReason=v=>clean(v,500);

async function writeChangeAudit(adminId,action,entityType,entityId,beforeState,afterState,reason=""){
  await pool.query(`INSERT INTO admin_change_audit(admin_id,action,entity_type,entity_id,before_state,after_state,reason) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,[adminId,clean(action,120),clean(entityType,80),entityId==null?null:String(entityId),beforeState==null?null:JSON.stringify(beforeState),afterState==null?null:JSON.stringify(afterState),auditReason(reason)]);
}
const parseSetting=parseOperationalSetting;
async function systemSettings(){const rows=(await pool.query(`SELECT key,value,description,updated_at,updated_by FROM admin_system_settings WHERE key=ANY($1::text[]) ORDER BY key`,[Object.keys(SETTINGS)])).rows;return Object.fromEntries(rows.map(r=>[r.key,{value:r.value,description:r.description,updatedAt:r.updated_at,updatedBy:r.updated_by}]))}
async function featureFlags(){return(await pool.query(`SELECT key,enabled,description,updated_at,updated_by FROM feature_flags WHERE key=ANY($1::text[]) ORDER BY key`,[[...FLAGS]])).rows}

async function detectAnomalies(){
  const [regNow,regBase,errorNow,errorBase,failedNow,loginNow,roomNow,roomBase,abuse]=await Promise.all([
    pool.query(`SELECT COUNT(*)::int c FROM users WHERE created_at>=NOW()-INTERVAL '1 hour'`),
    pool.query(`SELECT COUNT(*)::numeric/24 c FROM users WHERE created_at>=NOW()-INTERVAL '25 hours' AND created_at<NOW()-INTERVAL '1 hour'`),
    pool.query(`SELECT COUNT(*)::int c FROM operation_logs WHERE level='ERROR' AND created_at>=NOW()-INTERVAL '15 minutes'`),
    pool.query(`SELECT COUNT(*)::numeric/96 c FROM operation_logs WHERE level='ERROR' AND created_at>=NOW()-INTERVAL '24 hours' AND created_at<NOW()-INTERVAL '15 minutes'`),
    pool.query(`SELECT COUNT(*)::int c FROM account_security_events WHERE kind='failed_login' AND created_at>=NOW()-INTERVAL '1 hour'`),
    pool.query(`SELECT COUNT(*)::int c FROM platform_login_events WHERE created_at>=NOW()-INTERVAL '1 hour'`),
    pool.query(`SELECT COUNT(*)::int c FROM rooms WHERE created_at>=NOW()-INTERVAL '1 hour'`),
    pool.query(`SELECT COUNT(*)::numeric/24 c FROM rooms WHERE created_at>=NOW()-INTERVAL '25 hours' AND created_at<NOW()-INTERVAL '1 hour'`),
    pool.query(`SELECT COALESCE(MAX(c),0)::int c FROM(SELECT COUNT(*) c FROM reports WHERE created_at>=NOW()-INTERVAL '1 hour' GROUP BY target_type,target_id)x`)
  ]);
  const hour=new Date().toISOString().slice(0,13),quarter=new Date(Math.floor(Date.now()/900000)*900000).toISOString().slice(0,16);
  const candidates=[];
  const reg=n(regNow.rows[0]),regThreshold=Math.max(10,Math.ceil(Number(regBase.rows[0]?.c||0)*3));if(reg>=regThreshold)candidates.push({type:"registration_spike",window:hour,severity:reg>=regThreshold*2?"critical":"warning",metric:reg,threshold:regThreshold,details:{window:"1h"}});
  const err=n(errorNow.rows[0]),errThreshold=Math.max(5,Math.ceil(Number(errorBase.rows[0]?.c||0)*4));if(err>=errThreshold)candidates.push({type:"error_spike",window:quarter,severity:err>=errThreshold*2?"critical":"warning",metric:err,threshold:errThreshold,details:{window:"15m"}});
  const failed=n(failedNow.rows[0]),logins=n(loginNow.rows[0]),loginThreshold=Math.max(10,logins*2+5);if(failed>=loginThreshold)candidates.push({type:"login_anomaly",window:hour,severity:failed>=loginThreshold*2?"critical":"warning",metric:failed,threshold:loginThreshold,details:{successfulSessions:logins,window:"1h"}});
  const rooms=n(roomNow.rows[0]),roomThreshold=Math.max(8,Math.ceil(Number(roomBase.rows[0]?.c||0)*3));if(rooms>=roomThreshold)candidates.push({type:"room_spam",window:hour,severity:rooms>=roomThreshold*2?"critical":"warning",metric:rooms,threshold:roomThreshold,details:{window:"1h"}});
  const repeated=n(abuse.rows[0]),abuseThreshold=5;if(repeated>=abuseThreshold)candidates.push({type:"abuse_reports",window:hour,severity:repeated>=10?"critical":"warning",metric:repeated,threshold:abuseThreshold,details:{window:"1h",meaning:"max reports against one target"}});
  for(const a of candidates)await pool.query(`INSERT INTO admin_anomaly_alerts(alert_type,window_key,severity,metric_value,threshold_value,details) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(alert_type,window_key) DO UPDATE SET severity=EXCLUDED.severity,metric_value=EXCLUDED.metric_value,threshold_value=EXCLUDED.threshold_value,details=EXCLUDED.details`,[a.type,a.window,a.severity,a.metric,a.threshold,JSON.stringify(a.details)]);
}

async function moderationRows(type,q,limit){
  const like=`%${q}%`;
  if(type==="posts")return(await pool.query(`SELECT p.id,p.user_id,u.username,u.display_name,p.body,p.image_url,p.created_at,p.deleted_at FROM posts p JOIN users u ON u.id=p.user_id WHERE ($1='' OR p.body ILIKE $2 OR u.username ILIKE $2) ORDER BY p.id DESC LIMIT $3`,[q,like,limit])).rows;
  if(type==="images")return(await pool.query(`SELECT p.id,p.user_id,u.username,u.display_name,p.body,p.image_url,p.created_at,p.deleted_at FROM posts p JOIN users u ON u.id=p.user_id WHERE p.image_url IS NOT NULL AND ($1='' OR p.body ILIKE $2 OR u.username ILIKE $2) ORDER BY p.id DESC LIMIT $3`,[q,like,limit])).rows;
  if(type==="stories")return(await pool.query(`SELECT s.id,s.user_id,u.username,u.display_name,s.kind,s.text_body,s.media_url,s.privacy,s.created_at,s.expires_at,s.deleted_at FROM stories s JOIN users u ON u.id=s.user_id WHERE ($1='' OR s.text_body ILIKE $2 OR u.username ILIKE $2) ORDER BY s.id DESC LIMIT $3`,[q,like,limit])).rows;
  if(type==="comments")return(await pool.query(`SELECT c.id,c.post_id,c.user_id,u.username,u.display_name,c.body,c.created_at,c.deleted_at FROM post_comments c JOIN users u ON u.id=c.user_id WHERE ($1='' OR c.body ILIKE $2 OR u.username ILIKE $2) ORDER BY c.id DESC LIMIT $3`,[q,like,limit])).rows;
  if(type==="rooms")return(await pool.query(`SELECT r.id,r.owner_id,u.username owner_username,r.name,r.slug,r.description,r.visibility,r.join_policy,r.created_at,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count FROM rooms r LEFT JOIN users u ON u.id=r.owner_id WHERE ($1='' OR r.name ILIKE $2 OR r.description ILIKE $2 OR COALESCE(u.username,'') ILIKE $2) ORDER BY r.id DESC LIMIT $3`,[q,like,limit])).rows;
  if(type==="reports")return(await pool.query(`SELECT r.*,u.username reporter_username FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE ($1='' OR r.reason ILIKE $2 OR r.details ILIKE $2 OR COALESCE(u.username,'') ILIKE $2) ORDER BY r.id DESC LIMIT $3`,[q,like,limit])).rows;
  if(type==="reported_messages")return(await pool.query(`SELECT r.id report_id,r.status,r.reason,r.details,r.target_id message_id,r.created_at,dm.sender_id,u.username sender_username,dm.created_at message_created_at FROM reports r JOIN direct_messages dm ON dm.id=r.target_id LEFT JOIN users u ON u.id=dm.sender_id WHERE r.target_type='direct_message' AND ($1='' OR r.reason ILIKE $2 OR COALESCE(u.username,'') ILIKE $2) ORDER BY r.id DESC LIMIT $3`,[q,like,limit])).rows;
  return[];
}

export function registerGroupOAdmin(app){
  app.post("/api/telemetry/activity",async(req,res)=>{try{const sessionKey=safeKey(req.body?.sessionId),visitorKey=safeKey(req.body?.visitorId),event=req.body?.event==="pageview"?"pageview":"heartbeat",path=safePath(req.body?.path);if(!sessionKey)return res.status(400).json({ok:false,error:"SESSION_ID_REQUIRED"});const user=await sessionUser(req).catch(()=>null),ua=clean(req.headers["user-agent"],300);await pool.query(`INSERT INTO usage_sessions(session_key,user_id,visitor_key,started_at,last_seen_at,page_views,user_agent) VALUES($1,$2,$3,NOW(),NOW(),0,$4) ON CONFLICT(session_key) DO UPDATE SET user_id=COALESCE(EXCLUDED.user_id,usage_sessions.user_id),visitor_key=COALESCE(NULLIF(EXCLUDED.visitor_key,''),usage_sessions.visitor_key),last_seen_at=NOW(),user_agent=EXCLUDED.user_agent`,[sessionKey,user?.id||null,visitorKey||null,ua]);if(event==="pageview"){const ins=await pool.query(`INSERT INTO usage_page_views(session_key,user_id,path,view_bucket) VALUES($1,$2,$3,date_trunc('minute',NOW())) ON CONFLICT(session_key,path,view_bucket) DO NOTHING RETURNING id`,[sessionKey,user?.id||null,path]);if(ins.rowCount)await pool.query(`UPDATE usage_sessions SET page_views=page_views+1,last_seen_at=NOW() WHERE session_key=$1`,[sessionKey])}res.json({ok:true})}catch(e){console.error("usage telemetry",e);res.status(500).json({ok:false,error:"TELEMETRY_FAILED"})}});

  app.get("/api/public/ui-settings",async(_req,res)=>{try{const value=(await pool.query(`SELECT value FROM admin_system_settings WHERE key='site_font'`)).rows[0]?.value,font=["readex","cairo"].includes(String(value))?String(value):"readex";res.setHeader("Cache-Control","public,max-age=30,stale-while-revalidate=120");res.json({ok:true,font})}catch{res.json({ok:true,font:"readex"})}});

  app.get("/api/features",async(_req,res)=>{try{const rows=await featureFlags();res.json({ok:true,features:Object.fromEntries(rows.map(x=>[x.key,Boolean(x.enabled)]))})}catch{res.json({ok:true,features:{}})}});

  app.get("/api/admin/advanced/users",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;const q=clean(req.query.q,100),limit=Math.min(250,Math.max(10,Number(req.query.limit)||100)),numeric=/^\d+$/.test(q)?Number(q):null,like=`%${q}%`;const rows=(await pool.query(`SELECT id,email,username,display_name,gender,role,account_status,last_seen_at,created_at FROM users WHERE ($1='' OR display_name ILIKE $2 OR username ILIKE $2 OR email ILIKE $2 OR ($3::bigint IS NOT NULL AND id=$3)) ORDER BY id DESC LIMIT $4`,[q,like,numeric,limit])).rows;res.json({ok:true,users:rows})}catch(e){console.error("advanced user search",e);res.status(500).json({ok:false,error:"ADVANCED_USER_SEARCH_FAILED"})}});

  app.get("/api/admin/advanced/moderation",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;const type=MOD_TYPES.has(String(req.query.type))?String(req.query.type):"reports",q=clean(req.query.q,100),limit=Math.min(150,Math.max(10,Number(req.query.limit)||60));res.json({ok:true,type,items:await moderationRows(type,q,limit),privateMessagesPolicy:"reported_context_only"})}catch(e){console.error("advanced moderation",e);res.status(500).json({ok:false,error:"ADVANCED_MODERATION_FAILED"})}});

  app.get("/api/admin/advanced/reported-messages/:reportId",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;const reportId=safeInt(req.params.reportId),reason=auditReason(req.query.reason);if(!reportId||reason.length<5)return res.status(400).json({ok:false,error:"AUDIT_REASON_REQUIRED"});const row=(await pool.query(`SELECT r.id report_id,r.reason report_reason,r.details report_details,r.status,r.target_id message_id,dm.conversation_id,dm.sender_id,dm.body,dm.created_at,dm.deleted_at,c.user1_id,c.user2_id,s.username sender_username FROM reports r JOIN direct_messages dm ON dm.id=r.target_id JOIN direct_conversations c ON c.id=dm.conversation_id LEFT JOIN users s ON s.id=dm.sender_id WHERE r.id=$1 AND r.target_type='direct_message'`,[reportId])).rows[0];if(!row)return res.status(404).json({ok:false,error:"REPORTED_MESSAGE_NOT_FOUND"});await writeChangeAudit(admin.id,"private_message_report_access","direct_message",row.message_id,null,{reportId,status:row.status},reason);res.json({ok:true,context:row,policy:"Access granted only because this direct message is attached to the specified report. Access was audited."})}catch(e){console.error("reported message access",e);res.status(500).json({ok:false,error:"REPORTED_MESSAGE_ACCESS_FAILED"})}});

  app.post("/api/admin/advanced/moderation/:type/:id/action",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;const type=String(req.params.type),id=safeInt(req.params.id),reason=auditReason(req.body?.reason);if(!id||reason.length<3||!["post","image","story","comment","room"].includes(type))return res.status(400).json({ok:false,error:"MODERATION_INPUT_INVALID"});let before,after;if(type==="post"){before=(await pool.query(`SELECT id,user_id,body,image_url,deleted_at FROM posts WHERE id=$1`,[id])).rows[0];if(!before)return res.status(404).json({ok:false,error:"CONTENT_NOT_FOUND"});after=(await pool.query(`UPDATE posts SET deleted_at=COALESCE(deleted_at,NOW()) WHERE id=$1 RETURNING id,user_id,body,image_url,deleted_at`,[id])).rows[0]}else if(type==="image"){before=(await pool.query(`SELECT id,user_id,body,image_url,deleted_at FROM posts WHERE id=$1`,[id])).rows[0];if(!before)return res.status(404).json({ok:false,error:"CONTENT_NOT_FOUND"});after=(await pool.query(`UPDATE posts SET image_url=NULL WHERE id=$1 RETURNING id,user_id,body,image_url,deleted_at`,[id])).rows[0]}else if(type==="story"){before=(await pool.query(`SELECT id,user_id,kind,text_body,media_url,deleted_at FROM stories WHERE id=$1`,[id])).rows[0];if(!before)return res.status(404).json({ok:false,error:"CONTENT_NOT_FOUND"});after=(await pool.query(`UPDATE stories SET deleted_at=COALESCE(deleted_at,NOW()) WHERE id=$1 RETURNING id,user_id,kind,text_body,media_url,deleted_at`,[id])).rows[0]}else if(type==="comment"){before=(await pool.query(`SELECT id,post_id,user_id,body,deleted_at FROM post_comments WHERE id=$1`,[id])).rows[0];if(!before)return res.status(404).json({ok:false,error:"CONTENT_NOT_FOUND"});after=(await pool.query(`UPDATE post_comments SET body='',deleted_at=COALESCE(deleted_at,NOW()) WHERE id=$1 RETURNING id,post_id,user_id,body,deleted_at`,[id])).rows[0]}else{before=(await pool.query(`SELECT id,owner_id,name,visibility,join_policy,is_public FROM rooms WHERE id=$1`,[id])).rows[0];if(!before)return res.status(404).json({ok:false,error:"CONTENT_NOT_FOUND"});after=(await pool.query(`UPDATE rooms SET visibility='private',join_policy='invite',is_public=FALSE WHERE id=$1 RETURNING id,owner_id,name,visibility,join_policy,is_public`,[id])).rows[0]}await writeChangeAudit(admin.id,"moderation_remove",type,id,before,after,reason);res.json({ok:true,type,id,before,after})}catch(e){console.error("advanced moderation action",e);res.status(500).json({ok:false,error:"ADVANCED_MODERATION_ACTION_FAILED"})}});

  app.get("/api/admin/advanced/settings",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;res.json({ok:true,settings:await systemSettings(),features:await featureFlags(),schema:operationalSettingMeta(),capabilities:{turnstileConfigured:Boolean(String(process.env.TURNSTILE_SECRET_KEY||"").trim()&&String(process.env.TURNSTILE_SITE_KEY||"").trim())}})}catch(e){console.error("advanced settings",e);res.status(500).json({ok:false,error:"ADVANCED_SETTINGS_FAILED"})}});

  app.patch("/api/admin/advanced/settings",async(req,res)=>{try{
    const admin=await requireAdmin(req,res);if(!admin)return;
    const key=String(req.body?.key||""),parsed=parseSetting(key,req.body?.value),reason=auditReason(req.body?.reason);
    if(!parsed.ok||reason.length<3)return res.status(400).json({ok:false,error:parsed.error||"SETTING_INPUT_INVALID"});
    if(key==="captcha_escalation_enabled"&&parsed.value===true&&!(String(process.env.TURNSTILE_SECRET_KEY||"").trim()&&String(process.env.TURNSTILE_SITE_KEY||"").trim()))return res.status(409).json({ok:false,error:"TURNSTILE_NOT_CONFIGURED"});
    const before=(await pool.query(`SELECT key,value,description,updated_at,updated_by FROM admin_system_settings WHERE key=$1`,[key])).rows[0];
    if(!before)return res.status(404).json({ok:false,error:"SETTING_NOT_FOUND"});
    if(key==="room_default_max_members"||key==="room_max_members_cap"){
      const rows=(await pool.query(`SELECT key,value FROM admin_system_settings WHERE key IN ('room_default_max_members','room_max_members_cap')`)).rows;
      const current=Object.fromEntries(rows.map(x=>[x.key,Number(x.value)]));
      const nextDefault=key==="room_default_max_members"?Number(parsed.value):Number(current.room_default_max_members||100);
      const nextCap=key==="room_max_members_cap"?Number(parsed.value):Number(current.room_max_members_cap||500);
      if(nextDefault>nextCap)return res.status(409).json({ok:false,error:"ROOM_DEFAULT_EXCEEDS_CAP"});
    }
    if(["upload_max_image_mb","upload_max_video_mb","upload_max_audio_mb"].includes(key)){
      const global=Number((await pool.query(`SELECT value FROM admin_system_settings WHERE key='upload_max_mb'`)).rows[0]?.value||8);
      if(Number(parsed.value)>global)return res.status(409).json({ok:false,error:"UPLOAD_TYPE_LIMIT_EXCEEDS_GLOBAL"});
    }
    if(key==="upload_max_mb"){
      const rows=(await pool.query(`SELECT value FROM admin_system_settings WHERE key IN ('upload_max_image_mb','upload_max_video_mb','upload_max_audio_mb')`)).rows;
      if(rows.some(x=>Number(x.value)>Number(parsed.value)))return res.status(409).json({ok:false,error:"GLOBAL_UPLOAD_LIMIT_BELOW_TYPE_LIMIT"});
    }
    const after=(await pool.query(`UPDATE admin_system_settings SET value=$2::jsonb,updated_by=$3,updated_at=NOW() WHERE key=$1 RETURNING key,value,description,updated_at,updated_by`,[key,JSON.stringify(parsed.value),admin.id])).rows[0];
    invalidateOperationalControls();
    await writeChangeAudit(admin.id,"system_setting_change","system_setting",key,before,after,reason);
    res.json({ok:true,setting:after});
  }catch(e){console.error("setting change",e);res.status(500).json({ok:false,error:"SETTING_CHANGE_FAILED"})}});

  app.patch("/api/admin/advanced/features/:key",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;const key=String(req.params.key),reason=auditReason(req.body?.reason);if(!FLAGS.has(key)||typeof req.body?.enabled!=="boolean"||reason.length<3)return res.status(400).json({ok:false,error:"FEATURE_INPUT_INVALID"});const before=(await pool.query(`SELECT key,enabled,description,updated_at,updated_by FROM feature_flags WHERE key=$1`,[key])).rows[0];if(!before)return res.status(404).json({ok:false,error:"FEATURE_NOT_FOUND"});const after=(await pool.query(`UPDATE feature_flags SET enabled=$2,updated_by=$3,updated_at=NOW() WHERE key=$1 RETURNING key,enabled,description,updated_at,updated_by`,[key,req.body.enabled,admin.id])).rows[0];invalidateOperationalControls();await writeChangeAudit(admin.id,"feature_flag_change","feature_flag",key,before,after,reason);res.json({ok:true,feature:after})}catch(e){console.error("feature change",e);res.status(500).json({ok:false,error:"FEATURE_CHANGE_FAILED"})}});

  app.get("/api/admin/advanced/audit",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;const q=clean(req.query.q,100),entity=clean(req.query.entityType,80),limit=Math.min(250,Math.max(20,Number(req.query.limit)||100)),like=`%${q}%`;const rows=(await pool.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.before_state,a.after_state,a.reason,a.created_at,a.admin_id,u.username admin_username,u.display_name admin_display_name FROM admin_change_audit a LEFT JOIN users u ON u.id=a.admin_id WHERE ($1='' OR a.action ILIKE $3 OR a.reason ILIKE $3 OR COALESCE(a.entity_id,'') ILIKE $3 OR COALESCE(u.username,'') ILIKE $3) AND ($2='' OR a.entity_type=$2) ORDER BY a.id DESC LIMIT $4`,[q,entity,like,limit])).rows;res.json({ok:true,audit:rows})}catch(e){console.error("advanced audit",e);res.status(500).json({ok:false,error:"ADVANCED_AUDIT_FAILED"})}});

  app.get("/api/admin/advanced/anomalies",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;await detectAnomalies();const rows=(await pool.query(`SELECT a.*,u.username acknowledged_by_username FROM admin_anomaly_alerts a LEFT JOIN users u ON u.id=a.acknowledged_by ORDER BY CASE a.status WHEN 'open' THEN 0 ELSE 1 END,a.detected_at DESC LIMIT 100`)).rows;res.json({ok:true,alerts:rows})}catch(e){console.error("anomaly alerts",e);res.status(500).json({ok:false,error:"ANOMALY_ALERTS_FAILED"})}});

  app.post("/api/admin/advanced/anomalies/:id/ack",async(req,res)=>{try{const admin=await requireAdmin(req,res);if(!admin)return;const id=safeInt(req.params.id),reason=auditReason(req.body?.reason);if(!id||reason.length<3)return res.status(400).json({ok:false,error:"ACK_INPUT_INVALID"});const before=(await pool.query(`SELECT * FROM admin_anomaly_alerts WHERE id=$1`,[id])).rows[0];if(!before)return res.status(404).json({ok:false,error:"ALERT_NOT_FOUND"});const after=(await pool.query(`UPDATE admin_anomaly_alerts SET status='acknowledged',acknowledged_by=$2,acknowledged_at=NOW() WHERE id=$1 RETURNING *`,[id,admin.id])).rows[0];await writeChangeAudit(admin.id,"anomaly_acknowledged","anomaly_alert",id,before,after,reason);res.json({ok:true,alert:after})}catch(e){console.error("anomaly ack",e);res.status(500).json({ok:false,error:"ANOMALY_ACK_FAILED"})}});
}
