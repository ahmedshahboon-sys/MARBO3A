import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return "scrypt:"+salt.toString("hex")+":"+derived.toString("hex")};

async function makeUser(label,password="Group8!Pass123"){
  const suffix=("g8_"+label.replace(/[^a-z0-9]/gi,"").slice(0,6)+"_"+Date.now().toString(36).slice(-4)+"_"+crypto.randomBytes(3).toString("hex")).toLowerCase();
  const row=(await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male',$4,'active','user') RETURNING id,email,username,display_name",[suffix+"@example.invalid",suffix,label,passwordHash(password)])).rows[0];
  return{...row,password};
}
async function session(userId,name=""){
  const token=crypto.randomBytes(32).toString("hex"),h=tokenHash(token);
  await redis.set("session:"+token,String(userId),{EX:1800});
  await pool.query("INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '30 minutes',NOW())",[h,userId]);
  await pool.query("INSERT INTO user_sessions(session_hash,user_id,user_agent,ip_address,device_name,last_seen) VALUES($1,$2,'Group8 Runtime','127.0.0.1',$3,NOW()) ON CONFLICT(session_hash) DO UPDATE SET device_name=EXCLUDED.device_name,last_seen=NOW()",[h,userId,name]);
  return token;
}
async function raw(path,{token,method="GET",body}={}){
  const headers={};if(token)headers.authorization="Bearer "+token;
  if(body!==undefined)headers["content-type"]="application/json";
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text(),data=(()=>{try{return JSON.parse(text)}catch{return{text}}})();
  return{r,data,text};
}
function expect(result,status,error){
  if(result.r.status!==status)throw new Error("expected "+status+", got "+result.r.status+" at "+result.r.url+": "+result.text);
  if(error&&result.data.error!==error)throw new Error("expected "+error+", got "+result.text);
  return result.data;
}
async function api(path,opts={}){const result=await raw(path,opts);return expect(result,opts.status||200,opts.error)}

try{
  const user=await makeUser("SettingsOwner"),actor=await makeUser("Actor"),peer=await makeUser("Peer");
  const token=await session(user.id,"Initial device"),actorToken=await session(actor.id),peerToken=await session(peer.id);

  // Unified privacy: full write then partial write must preserve every omitted field.
  let d=await api("/api/privacy",{token,method:"PATCH",body:{
    whoCanMessage:"everyone",whoCanAdd:"friends",showLastSeen:false,showCity:false,birthVisibility:"hidden",
    whoCanSeePosts:"friends",whoCanSeeStory:"friends_of_friends",whoCanReplyStory:"nobody",whoCanCall:"nobody",
    whoCanSeeFriends:"everyone",whoCanInviteRoom:"friends_of_friends",showOnline:false,readReceipts:false,
    messageRequestsEnabled:false,whoCanMention:"nobody",whoCanTag:"friends"
  }});
  if(d.privacy.who_can_call!=="nobody"||d.privacy.who_can_mention!=="nobody"||d.privacy.who_can_tag!=="friends")throw new Error("full privacy contract did not persist");
  await api("/api/privacy",{token,method:"PATCH",body:{showLastSeen:true}});
  d=await api("/api/privacy/v2",{token});
  if(d.privacy.show_last_seen!==true)throw new Error("partial privacy write did not update target field");
  for(const [key,value] of [["who_can_call","nobody"],["who_can_see_story","friends_of_friends"],["who_can_invite_room","friends_of_friends"],["who_can_mention","nobody"],["who_can_tag","friends"],["message_requests_enabled",false]]){
    if(d.privacy[key]!==value)throw new Error("partial privacy write overwrote "+key);
  }

  // Full settings contract and partial preservation.
  d=await api("/api/settings",{token,method:"PATCH",body:{
    theme:"light",language:"ar",notificationsEnabled:true,notificationSounds:false,
    notificationCategories:{friend_requests:false,reactions:false,calls:false},
    quietHours:{enabled:true,start:"22:15",end:"07:45",timezone:"Africa/Tripoli"},
    autoplayMedia:false,dataSaver:true,reducedMotion:true,textScale:1.15
  }});
  if(d.settings.theme!=="light"||d.settings.data_saver!==true||d.settings.reduced_motion!==true||Number(d.settings.text_scale)!==1.15)throw new Error("settings media/accessibility save failed");
  if(d.settings.notification_categories.friend_requests!==false||d.settings.notification_categories.dms!==true)throw new Error("notification category merge failed");
  await api("/api/settings",{token,method:"PATCH",body:{theme:"dark"}});
  d=await api("/api/settings",{token});
  if(d.settings.theme!=="dark"||d.settings.notification_categories.friend_requests!==false||d.settings.quiet_hours_enabled!==true||d.settings.data_saver!==true)throw new Error("partial settings write overwrote unrelated preferences");
  await api("/api/settings",{token,method:"PATCH",body:{textScale:2},status:400,error:"INVALID_TEXT_SCALE"});
  await api("/api/settings",{token,method:"PATCH",body:{quietHours:{timezone:"Mars/Tripoli"}},status:400,error:"INVALID_TIMEZONE"});

  // Category suppression is persistent and absent from visible list/count.
  const cat=(await pool.query("INSERT INTO notifications(user_id,actor_id,type,title,body) VALUES($1,$2,'friend_request','request','hello') RETURNING id,category,suppressed",[user.id,actor.id])).rows[0];
  if(cat.category!=="friend_requests"||cat.suppressed!==true)throw new Error("notification category trigger failed");
  d=await api("/api/notifications",{token});
  if((d.notifications||[]).some(x=>Number(x.id)===Number(cat.id)))throw new Error("suppressed notification leaked into visible list");
  const unread=await api("/api/notifications/unread-count",{token});
  if(Number(unread.count)!==0)throw new Error("suppressed notification leaked into unread count");

  // Hidden words suppress matching notifications.
  d=await api("/api/settings/hidden-words",{token,method:"POST",body:{word:"ممنوع"},status:201});
  const hiddenId=Number(d.hiddenWord?.id);if(!hiddenId)throw new Error("hidden word id missing");
  const hidden=(await pool.query("INSERT INTO notifications(user_id,actor_id,type,title,body) VALUES($1,$2,'comment','تعليق جديد','هذا نص ممنوع هنا') RETURNING suppressed",[user.id,actor.id])).rows[0];
  if(hidden.suppressed!==true)throw new Error("hidden word did not suppress notification");

  // Muted users suppress their notifications.
  await api("/api/users/"+actor.id+"/mute",{token,method:"POST",body:{}});
  const muted=(await pool.query("INSERT INTO notifications(user_id,actor_id,type,title,body) VALUES($1,$2,'live_started','live','go') RETURNING suppressed",[user.id,actor.id])).rows[0];
  if(muted.suppressed!==true)throw new Error("muted user notification was not suppressed");
  d=await api("/api/settings/mutes",{token});
  if(!(d.mutedUsers||[]).some(x=>Number(x.user_id)===Number(actor.id))||!(d.hiddenWords||[]).some(x=>Number(x.id)===hiddenId))throw new Error("mute management list incomplete");

  // Conversation mute requires membership and persists.
  const conv=(await pool.query("INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) RETURNING id",[Math.min(Number(user.id),Number(peer.id)),Math.max(Number(user.id),Number(peer.id))])).rows[0];
  await api("/api/settings/muted-conversations/"+conv.id,{token,method:"PUT",body:{}});
  const convMute=Number((await pool.query("SELECT COUNT(*)::int c FROM conversation_notification_mutes WHERE user_id=$1 AND conversation_id=$2",[user.id,conv.id])).rows[0]?.c||0);
  if(convMute!==1)throw new Error("conversation mute did not persist");
  await api("/api/settings/muted-conversations/"+conv.id,{token:actorToken,method:"PUT",body:{},status:404,error:"CONVERSATION_NOT_FOUND"});

  // Trusted device naming.
  d=await api("/api/account/sessions",{token});
  const current=(d.sessions||[]).find(x=>x.current);if(!current)throw new Error("current session not listed");
  await api("/api/account/sessions/"+current.id,{token,method:"PATCH",body:{name:"هاتفي الرئيسي"}});
  d=await api("/api/account/sessions",{token});
  if((d.sessions||[]).find(x=>x.current)?.device_name!=="هاتفي الرئيسي")throw new Error("trusted device name not returned");

  // Export is downloadable and excludes credential/session secrets.
  const exported=await raw("/api/account/export",{token});
  expect(exported,200);
  if(!/attachment/i.test(String(exported.r.headers.get("content-disposition")||"")))throw new Error("export missing attachment header");
  for(const secret of ["password_hash","session_hash","token_hash","two_factor_recovery_codes"]){
    if(exported.text.includes(secret))throw new Error("export leaked secret field "+secret);
  }
  if(!exported.data.profile||!exported.data.privacy||!exported.data.settings)throw new Error("export missing core datasets");

  // Deactivation is step-up protected and invalidates the current session.
  await api("/api/account/deactivate",{token,method:"POST",body:{},status:403,error:"STEP_UP_REQUIRED"});
  d=await api("/api/account/step-up/request",{token,method:"POST",body:{currentPassword:user.password}});
  const grant=String(d.stepUpToken||"");if(!/^[a-f0-9]{64}$/i.test(grant))throw new Error("step-up grant missing");
  await api("/api/account/deactivate",{token,method:"POST",body:{stepUpToken:grant}});
  const state=(await pool.query("SELECT account_status,deactivated_at FROM users WHERE id=$1",[user.id])).rows[0];
  if(state.account_status!=="deactivated"||!state.deactivated_at)throw new Error("account deactivation did not persist");
  await api("/api/auth/me",{token,status:401});

  // Correct login reactivates a password-only deactivated account.
  const login=await raw("/api/auth/login",{method:"POST",body:{identifier:user.email,password:user.password}});
  expect(login,200);
  if(login.data.user?.account_status!=="active"||!/^[a-f0-9]{64}$/i.test(String(login.data.token||"")))throw new Error("deactivated account did not reactivate on valid login");
  const active=(await pool.query("SELECT account_status,deactivated_at FROM users WHERE id=$1",[user.id])).rows[0];
  if(active.account_status!=="active"||active.deactivated_at)throw new Error("reactivation database state incorrect");

  // 2FA reactivation source contract: challenge must remember reactivation and success occurs after factor verification.
  const authSource=await import("node:fs").then(fs=>fs.readFileSync(new URL("../routes/auth-session.mjs",import.meta.url),"utf8"));
  for(const needle of ['reactivate:u.account_status==="deactivated"','p.reactivate&&u.account_status==="deactivated"','factor:"password+2fa"'])if(!authSource.includes(needle))throw new Error("2FA reactivation contract missing "+needle);

  console.log("group8 unified settings privacy notifications data rights runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
