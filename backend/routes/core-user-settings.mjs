import {pool,requireAuth,clean} from "../runtime.mjs";
import {DEFAULT_NOTIFICATION_CATEGORIES,normalizeNotificationCategories,userSettings} from "../user-preferences.mjs";

const THEMES=new Set(["dark","light","system"]);
const LANGUAGES=new Set(["ar","en"]);
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const wordClean=v=>clean(String(v||"").toLocaleLowerCase("ar"),60);

async function validTimezone(value){
  const tz=String(value||"").trim();
  if(!tz||tz.length>80)return false;
  return (await pool.query(`SELECT 1 FROM pg_timezone_names WHERE name=$1 LIMIT 1`,[tz])).rowCount>0;
}
async function peerForConversation(conversationId,userId){
  return (await pool.query(`SELECT x.id,x.username,x.display_name,x.avatar_url FROM direct_conversations c JOIN users x ON x.id=CASE WHEN c.user1_id=$2 THEN c.user2_id ELSE c.user1_id END WHERE c.id=$1 AND $2 IN(c.user1_id,c.user2_id)`,[conversationId,userId])).rows[0]||null;
}

export function registerCoreUserSettings(app){
  app.get("/api/settings",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;
    res.json({ok:true,settings:await userSettings(u.id),notificationCategoryDefaults:DEFAULT_NOTIFICATION_CATEGORIES});
  }catch(e){console.error("settings load",e);res.status(500).json({ok:false,error:"SETTINGS_LOAD_FAILED"})}});

  app.patch("/api/settings",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;
    const current=await userSettings(u.id),b=req.body||{};
    const theme=b.theme===undefined?current.theme:(THEMES.has(b.theme)?b.theme:null);
    if(!theme)return res.status(400).json({ok:false,error:"INVALID_THEME"});
    const language=b.language===undefined?current.language:(LANGUAGES.has(b.language)?b.language:null);
    if(!language)return res.status(400).json({ok:false,error:"INVALID_LANGUAGE"});
    const notificationsEnabled=typeof b.notificationsEnabled==="boolean"?b.notificationsEnabled:Boolean(current.notifications_enabled);
    const notificationSounds=typeof b.notificationSounds==="boolean"?b.notificationSounds:Boolean(current.notification_sounds);
    const categories=normalizeNotificationCategories(b.notificationCategories,current.notification_categories);
    const quiet=b.quietHours&&typeof b.quietHours==="object"?b.quietHours:{};
    const quietEnabled=typeof quiet.enabled==="boolean"?quiet.enabled:Boolean(current.quiet_hours_enabled);
    const quietStart=quiet.start===undefined?String(current.quiet_hours_start).slice(0,8):String(quiet.start);
    const quietEnd=quiet.end===undefined?String(current.quiet_hours_end).slice(0,8):String(quiet.end);
    if(!TIME.test(quietStart)||!TIME.test(quietEnd))return res.status(400).json({ok:false,error:"INVALID_QUIET_HOURS"});
    const quietTimezone=quiet.timezone===undefined?current.quiet_hours_timezone:String(quiet.timezone);
    if(!await validTimezone(quietTimezone))return res.status(400).json({ok:false,error:"INVALID_TIMEZONE"});
    const autoplayMedia=typeof b.autoplayMedia==="boolean"?b.autoplayMedia:Boolean(current.autoplay_media);
    const dataSaver=typeof b.dataSaver==="boolean"?b.dataSaver:Boolean(current.data_saver);
    const reducedMotion=typeof b.reducedMotion==="boolean"?b.reducedMotion:Boolean(current.reduced_motion);
    const textScale=b.textScale===undefined?Number(current.text_scale):Number(b.textScale);
    if(!Number.isFinite(textScale)||textScale<0.85||textScale>1.5)return res.status(400).json({ok:false,error:"INVALID_TEXT_SCALE"});
    await pool.query(`UPDATE user_settings SET theme=$2,notifications_enabled=$3,notification_sounds=$4,language=$5,notification_categories=$6::jsonb,quiet_hours_enabled=$7,quiet_hours_start=$8::time,quiet_hours_end=$9::time,quiet_hours_timezone=$10,autoplay_media=$11,data_saver=$12,reduced_motion=$13,text_scale=$14,updated_at=NOW() WHERE user_id=$1`,[u.id,theme,notificationsEnabled,notificationSounds,language,JSON.stringify(categories),quietEnabled,quietStart,quietEnd,quietTimezone,autoplayMedia,dataSaver,reducedMotion,textScale]);
    res.json({ok:true,settings:await userSettings(u.id)});
  }catch(e){console.error("settings save",e);res.status(500).json({ok:false,error:"SETTINGS_SAVE_FAILED"})}});

  app.get("/api/settings/mutes",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;
    const [users,conversations,words]=await Promise.all([
      pool.query(`SELECT m.muted_id user_id,x.username,x.display_name,x.avatar_url,m.created_at FROM user_mutes m JOIN users x ON x.id=m.muted_id WHERE m.muter_id=$1 ORDER BY m.created_at DESC`,[u.id]),
      pool.query(`SELECT m.conversation_id,m.created_at,x.id user_id,x.username,x.display_name,x.avatar_url FROM conversation_notification_mutes m JOIN direct_conversations c ON c.id=m.conversation_id JOIN users x ON x.id=CASE WHEN c.user1_id=$1 THEN c.user2_id ELSE c.user1_id END WHERE m.user_id=$1 AND $1 IN(c.user1_id,c.user2_id) ORDER BY m.created_at DESC`,[u.id]),
      pool.query(`SELECT id,word,created_at FROM user_hidden_words WHERE user_id=$1 ORDER BY created_at DESC,id DESC`,[u.id])
    ]);
    res.json({ok:true,mutedUsers:users.rows,mutedConversations:conversations.rows,hiddenWords:words.rows});
  }catch(e){console.error("mutes load",e);res.status(500).json({ok:false,error:"MUTES_LOAD_FAILED"})}});

  app.put("/api/settings/muted-conversations/:id",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<=0||!await peerForConversation(id,u.id))return res.status(404).json({ok:false,error:"CONVERSATION_NOT_FOUND"});
    await pool.query(`INSERT INTO conversation_notification_mutes(user_id,conversation_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[u.id,id]);
    res.json({ok:true,muted:true,conversationId:id});
  }catch(e){console.error("conversation mute",e);res.status(500).json({ok:false,error:"MUTE_FAILED"})}});

  app.delete("/api/settings/muted-conversations/:id",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const id=Number(req.params.id);
    await pool.query(`DELETE FROM conversation_notification_mutes WHERE user_id=$1 AND conversation_id=$2`,[u.id,id]);
    res.json({ok:true,muted:false,conversationId:id});
  }catch(e){res.status(500).json({ok:false,error:"MUTE_FAILED"})}});

  app.post("/api/settings/hidden-words",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const word=wordClean(req.body?.word);
    if(word.length<2)return res.status(400).json({ok:false,error:"INVALID_HIDDEN_WORD"});
    const row=(await pool.query(`INSERT INTO user_hidden_words(user_id,word) VALUES($1,$2) ON CONFLICT (user_id,(LOWER(word))) DO UPDATE SET word=EXCLUDED.word RETURNING id,word,created_at`,[u.id,word])).rows[0];
    res.status(201).json({ok:true,hiddenWord:row});
  }catch(e){console.error("hidden word",e);res.status(500).json({ok:false,error:"HIDDEN_WORD_FAILED"})}});

  app.delete("/api/settings/hidden-words/:id",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const id=Number(req.params.id);
    await pool.query(`DELETE FROM user_hidden_words WHERE id=$1 AND user_id=$2`,[id,u.id]);
    res.json({ok:true});
  }catch(e){res.status(500).json({ok:false,error:"HIDDEN_WORD_FAILED"})}});

  app.get("/api/account/export",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;
    const queries=await Promise.all([
      pool.query(`SELECT id,email,username,display_name,gender,bio,avatar_url,cover_url,birth_date,account_status,created_at,updated_at,last_seen_at FROM users WHERE id=$1`,[u.id]),
      pool.query(`SELECT * FROM profile_privacy WHERE user_id=$1`,[u.id]),
      pool.query(`SELECT theme,notifications_enabled,notification_sounds,language,notification_categories,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_timezone,autoplay_media,data_saver,reduced_motion,text_scale,updated_at FROM user_settings WHERE user_id=$1`,[u.id]),
      pool.query(`SELECT id,requester_id,addressee_id,status,created_at,updated_at FROM friendships WHERE requester_id=$1 OR addressee_id=$1 ORDER BY id`,[u.id]),
      pool.query(`SELECT blocker_id,blocked_id,created_at FROM user_blocks WHERE blocker_id=$1 OR blocked_id=$1 ORDER BY created_at`,[u.id]),
      pool.query(`SELECT muted_id,created_at FROM user_mutes WHERE muter_id=$1 ORDER BY created_at`,[u.id]),
      pool.query(`SELECT id,body,location_label,created_at,updated_at,deleted_at FROM posts WHERE user_id=$1 ORDER BY id`,[u.id]),
      pool.query(`SELECT id,post_id,body,parent_comment_id,created_at,edited_at,deleted_at FROM post_comments WHERE user_id=$1 ORDER BY id`,[u.id]),
      pool.query(`SELECT id,kind,text_body,media_url,media_type,privacy,created_at,expires_at,deleted_at FROM stories WHERE user_id=$1 ORDER BY id`,[u.id]),
      pool.query(`SELECT rm.room_id,rm.role,rm.joined_at,r.name,r.slug FROM room_members rm JOIN rooms r ON r.id=rm.room_id WHERE rm.user_id=$1 ORDER BY rm.joined_at`,[u.id]),
      pool.query(`SELECT id,requester_id,recipient_id,status,created_at,updated_at FROM message_requests WHERE requester_id=$1 OR recipient_id=$1 ORDER BY id`,[u.id]),
      pool.query(`SELECT dm.id,dm.conversation_id,dm.body,dm.attachment_url,dm.attachment_type,dm.created_at,dm.edited_at,dm.deleted_at FROM direct_messages dm WHERE dm.sender_id=$1 ORDER BY dm.id`,[u.id]),
      pool.query(`SELECT id,type,title,body,ref_id,read_at,category,suppressed,created_at FROM notifications WHERE user_id=$1 ORDER BY id`,[u.id])
    ]);
    const names=["profile","privacy","settings","friendships","blocks","mutes","posts","comments","stories","roomMemberships","messageRequests","sentDirectMessages","notifications"];
    const data={exportVersion:1,generatedAt:new Date().toISOString()};
    names.forEach((name,i)=>data[name]=name==="profile"||name==="privacy"||name==="settings"?(queries[i].rows[0]||null):queries[i].rows);
    const filename=`marbo3a-data-${u.id}-${new Date().toISOString().slice(0,10)}.json`;
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Content-Disposition",`attachment; filename="${filename}"`);
    res.send(JSON.stringify(data,null,2));
  }catch(e){console.error("account export",e);res.status(500).json({ok:false,error:"EXPORT_FAILED"})}});
}
