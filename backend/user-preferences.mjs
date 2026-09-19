import {pool} from "./runtime.mjs";

export const DEFAULT_NOTIFICATION_CATEGORIES={
  dms:true,friend_requests:true,comments:true,reactions:true,rooms:true,live:true,calls:true,moderation_system:true
};

export function normalizeNotificationCategories(input,current=DEFAULT_NOTIFICATION_CATEGORIES){
  const out={...DEFAULT_NOTIFICATION_CATEGORIES,...(current||{})};
  if(input&&typeof input==="object"&&!Array.isArray(input)){
    for(const key of Object.keys(DEFAULT_NOTIFICATION_CATEGORIES))if(typeof input[key]==="boolean")out[key]=input[key];
  }
  return out;
}
export function notificationCategory(type=""){
  const t=String(type||"").toLowerCase();
  if(/direct|message_request|\bdm\b|chat/.test(t))return"dms";
  if(/^friend|friend_/.test(t))return"friend_requests";
  if(/comment|reply/.test(t))return"comments";
  if(/reaction|like|love/.test(t))return"reactions";
  if(/room|invite/.test(t))return"rooms";
  if(/live/.test(t))return"live";
  if(/call/.test(t))return"calls";
  return"moderation_system";
}
export async function ensureUserSettings(userId){
  await pool.query(`INSERT INTO user_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING`,[userId]);
}
export async function userSettings(userId){
  await ensureUserSettings(userId);
  return (await pool.query(`SELECT user_id,theme,notifications_enabled,notification_sounds,language,notification_categories,quiet_hours_enabled,quiet_hours_start::text,quiet_hours_end::text,quiet_hours_timezone,autoplay_media,data_saver,reduced_motion,text_scale::float8 text_scale,updated_at FROM user_settings WHERE user_id=$1`,[userId])).rows[0];
}
function inQuietWindow(now,start,end){
  if(!start||!end)return false;
  if(start===end)return true;
  return start<end?now>=start&&now<end:now>=start||now<end;
}
export async function notificationDeliveryState(userId,{category,type,actorId,conversationId,title="",body=""}={}){
  const settings=await userSettings(userId),cat=category||notificationCategory(type),categories=normalizeNotificationCategories(settings.notification_categories);
  if(!settings.notifications_enabled||categories[cat]===false)return{allowed:false,reason:"category_or_master",quiet:false,sounds:false,category:cat};
  if(actorId&&Number(actorId)!==Number(userId)){
    const muted=(await pool.query(`SELECT 1 FROM user_mutes WHERE muter_id=$1 AND muted_id=$2 LIMIT 1`,[userId,actorId])).rowCount>0;
    if(muted)return{allowed:false,reason:"muted_user",quiet:false,sounds:false,category:cat};
  }
  if(conversationId){
    const muted=(await pool.query(`SELECT 1 FROM conversation_notification_mutes WHERE user_id=$1 AND conversation_id=$2 LIMIT 1`,[userId,conversationId])).rowCount>0;
    if(muted)return{allowed:false,reason:"muted_conversation",quiet:false,sounds:false,category:cat};
  }
  const text=(String(title||"")+" "+String(body||"")).toLowerCase();
  if(text){
    const words=(await pool.query(`SELECT word FROM user_hidden_words WHERE user_id=$1`,[userId])).rows;
    if(words.some(x=>text.includes(String(x.word||"").toLowerCase())))return{allowed:false,reason:"hidden_word",quiet:false,sounds:false,category:cat};
  }
  let quiet=false;
  if(settings.quiet_hours_enabled){
    let local=null;
    try{local=(await pool.query(`SELECT TO_CHAR(NOW() AT TIME ZONE $1,'HH24:MI:SS') now`,[settings.quiet_hours_timezone])).rows[0]?.now||null}catch{}
    if(local)quiet=inQuietWindow(local,String(settings.quiet_hours_start||"").slice(0,8),String(settings.quiet_hours_end||"").slice(0,8));
  }
  return{allowed:!quiet,reason:quiet?"quiet_hours":"allowed",quiet,sounds:Boolean(settings.notification_sounds)&&!quiet,category:cat};
}
