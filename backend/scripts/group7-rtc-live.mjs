import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();

const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return "scrypt:"+salt.toString("hex")+":"+derived.toString("hex")};
async function makeUser(label){
  const suffix=("g7_"+label.replace(/[^a-z0-9]/gi,"").slice(0,5)+"_"+Date.now().toString(36).slice(-4)+"_"+crypto.randomBytes(3).toString("hex")).toLowerCase();
  return (await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role,created_at) VALUES($1,$2,$3,'male',$4,'active','user',NOW()-INTERVAL '2 days') RETURNING id,email,username,display_name",[suffix+"@example.invalid",suffix,label,passwordHash("Group7!Pass123")])).rows[0];
}
async function session(userId){
  const token=crypto.randomBytes(32).toString("hex");
  await redis.set("session:"+token,String(userId),{EX:1800});
  await pool.query("INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '30 minutes',NOW())",[tokenHash(token),userId]);
  return token;
}
async function raw(path,{token,method="GET",body}={}){
  const headers={};if(token)headers.authorization="Bearer "+token;
  let payload;if(body!==undefined){headers["content-type"]="application/json";payload=JSON.stringify(body)}
  const r=await fetch(base+path,{method,headers,body:payload});
  const data=await r.json().catch(()=>({}));
  return{r,data};
}
function expect(result,status,error){
  if(result.r.status!==status)throw new Error("expected "+status+", got "+result.r.status+" at "+result.r.url+": "+JSON.stringify(result.data));
  if(error&&result.data.error!==error)throw new Error("expected "+error+", got "+JSON.stringify(result.data));
  return result.data;
}
async function api(path,opts={}){return expect(await raw(path,opts),opts.status||200,opts.error)}
async function setPrivacy(id,call="friends"){await pool.query("INSERT INTO profile_privacy(user_id,who_can_call) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET who_can_call=EXCLUDED.who_can_call,updated_at=NOW()",[id,call])}
async function befriend(a,b){
  await pool.query("DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)",[a,b]);
  await pool.query("INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'accepted')",[a,b]);
}
async function conversation(a,b){
  const low=Math.min(Number(a),Number(b)),high=Math.max(Number(a),Number(b));
  await pool.query("INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[low,high]);
  return (await pool.query("SELECT id FROM direct_conversations WHERE LEAST(user1_id,user2_id)=$1 AND GREATEST(user1_id,user2_id)=$2",[low,high])).rows[0];
}
async function makeRoom(token,name,visibility="public",joinPolicy="open"){
  const d=await api("/api/rooms",{token,method:"POST",body:{name,description:"Group 7 runtime",visibility,joinPolicy},status:201});
  return d.room;
}

try{
  // CALLS: participant authorization, Redis creation limit and history privacy.
  const caller=await makeUser("Caller"),callee=await makeUser("Callee"),outsider=await makeUser("Outsider");
  const callerToken=await session(caller.id),calleeToken=await session(callee.id),outsiderToken=await session(outsider.id);
  await setPrivacy(caller.id,"friends");await setPrivacy(callee.id,"friends");await befriend(caller.id,callee.id);
  const conv=await conversation(caller.id,callee.id);
  let lastCall=null;
  for(let i=0;i<8;i++){
    const d=await api("/api/calls",{token:callerToken,method:"POST",body:{conversationId:conv.id,kind:i%2?"video":"audio"},status:201});
    lastCall=d.call;
  }
  await api("/api/calls",{token:callerToken,method:"POST",body:{conversationId:conv.id,kind:"audio"},status:429,error:"CALL_RATE_LIMITED"});
  const outsiderHistory=await api("/api/calls/history",{token:outsiderToken});
  if((outsiderHistory.calls||[]).some(x=>String(x.id)===String(lastCall.id)))throw new Error("call history leaked to outsider");
  await api("/api/calls/"+lastCall.id+"/answer",{token:outsiderToken,method:"POST",status:404,error:"CALL_NOT_FOUND"});

  // VOICE ROOMS: private/ban checks and canonical public room flow.
  const owner=await makeUser("RoomOwner"),member=await makeUser("RoomMember"),moderator=await makeUser("RoomMod"),banned=await makeUser("RoomBanned");
  const ownerToken=await session(owner.id),memberToken=await session(member.id),moderatorToken=await session(moderator.id),bannedToken=await session(banned.id);
  const privateRoom=await makeRoom(ownerToken,"G7 Private "+crypto.randomBytes(2).toString("hex"),"private","invite");
  await api("/api/rooms/"+privateRoom.id+"/voice/join",{token:memberToken,method:"POST",body:{},status:403,error:"INVITE_REQUIRED"});

  const room=await makeRoom(ownerToken,"G7 Voice "+crypto.randomBytes(2).toString("hex"),"public","open");
  await api("/api/rooms/"+room.id+"/join",{token:memberToken,method:"POST",body:{}});
  await api("/api/rooms/"+room.id+"/join",{token:moderatorToken,method:"POST",body:{}});
  await pool.query("UPDATE room_members SET role='moderator' WHERE room_id=$1 AND user_id=$2",[room.id,moderator.id]);
  await pool.query("INSERT INTO room_bans(room_id,user_id,reason,banned_by) VALUES($1,$2,'runtime',$3) ON CONFLICT(room_id,user_id) DO UPDATE SET reason='runtime',banned_by=$3",[room.id,banned.id,owner.id]);
  await api("/api/rooms/"+room.id+"/voice/join",{token:bannedToken,method:"POST",body:{},status:403,error:"ROOM_BANNED"});

  await api("/api/rooms/"+room.id+"/voice/join",{token:ownerToken,method:"POST",body:{}});
  await api("/api/rooms/"+room.id+"/voice/join",{token:memberToken,method:"POST",body:{}});
  await api("/api/rooms/"+room.id+"/voice/join",{token:moderatorToken,method:"POST",body:{}});
  await api("/api/rooms/"+room.id+"/voice/role",{token:ownerToken,method:"POST",body:{role:"speaker",seatIndex:1}});
  await api("/api/rooms/"+room.id+"/voice/signals",{token:memberToken,method:"POST",body:{recipientId:moderator.id,kind:"ice",payload:{candidate:"listener-listener"}},status:403,error:"BAD_SIGNAL_ROLE"});
  await api("/api/rooms/"+room.id+"/voice/signals",{token:memberToken,method:"POST",body:{recipientId:owner.id,kind:"offer",payload:{type:"offer",sdp:"bad"}},status:403,error:"BAD_SIGNAL_ROLE"});
  await api("/api/rooms/"+room.id+"/voice/signals",{token:ownerToken,method:"POST",body:{recipientId:member.id,kind:"offer",payload:{type:"offer",sdp:"ok"}},status:201});
  let d=await api("/api/rooms/"+room.id+"/voice/signals?since=0",{token:memberToken});
  if(!(d.signals||[]).some(x=>Number(x.sender_id)===Number(owner.id)&&x.kind==="offer"))throw new Error("voice signal not isolated to active recipient");

  // Moderator hierarchy: moderator cannot demote owner by locking the occupied owner seat.
  await api("/api/rooms/"+room.id+"/voice/seats/1",{token:moderatorToken,method:"PUT",body:{locked:true},status:403,error:"ROOM_ROLE_PROTECTED"});
  await api("/api/rooms/"+room.id+"/voice/moderate",{token:moderatorToken,method:"POST",body:{userId:owner.id,action:"mute"},status:403,error:"ROOM_ROLE_PROTECTED"});

  // Owner force-mute survives a reconnect/join reset.
  await api("/api/rooms/"+room.id+"/voice/moderate",{token:ownerToken,method:"POST",body:{userId:member.id,action:"mute"}});
  d=await api("/api/rooms/"+room.id+"/voice/join",{token:memberToken,method:"POST",body:{}});
  if(d.forcedMuted!==true||d.muted!==true)throw new Error("voice reconnect cleared moderator force mute");

  // Voice join rate limit is Redis-backed and returns Retry-After.
  const rateUser=await makeUser("VoiceRate"),rateToken=await session(rateUser.id),rateRoom=await makeRoom(ownerToken,"G7 Rate "+crypto.randomBytes(2).toString("hex"),"public","open");
  for(let i=0;i<12;i++)await api("/api/rooms/"+rateRoom.id+"/voice/join",{token:rateToken,method:"POST",body:{}});
  const limited=await raw("/api/rooms/"+rateRoom.id+"/voice/join",{token:rateToken,method:"POST",body:{}});
  expect(limited,429,"VOICE_JOIN_RATE_LIMITED");
  if(!limited.r.headers.get("retry-after"))throw new Error("voice rate limit missing Retry-After");

  // Participant cap: fill active voice presence to policy max, then deny one more.
  const policy=Number((await api("/api/rooms/"+room.id+"/voice/state",{token:ownerToken})).maxParticipants||0);
  if(policy<4)throw new Error("invalid voice participant policy");
  let active=Number((await pool.query("SELECT COUNT(*)::int c FROM room_voice_presence WHERE room_id=$1 AND last_seen>NOW()-INTERVAL '20 seconds'",[room.id])).rows[0]?.c||0);
  while(active<policy){
    const filler=await makeUser("VF"+active);
    await pool.query("INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[room.id,filler.id]);
    await pool.query("INSERT INTO room_voice_presence(room_id,user_id,role,last_seen) VALUES($1,$2,'listener',NOW()) ON CONFLICT(room_id,user_id) DO UPDATE SET last_seen=NOW()",[room.id,filler.id]);
    active++;
  }
  const overflow=await makeUser("VoiceOverflow"),overflowToken=await session(overflow.id);
  await api("/api/rooms/"+room.id+"/voice/join",{token:overflowToken,method:"POST",body:{},status:409,error:"VOICE_ROOM_FULL"});

  // LIVE: host controls, signaling isolation, slow mode, moderation/report and cleanup.
  const host=await makeUser("LiveHost"),viewer=await makeUser("LiveViewer"),viewer2=await makeUser("LiveViewer2");
  const hostToken=await session(host.id),viewerToken=await session(viewer.id),viewer2Token=await session(viewer2.id);
  d=await api("/api/live",{token:hostToken,method:"POST",body:{title:"Group 7 live"},status:201});
  const liveId=Number(d.live?.id);if(!liveId)throw new Error("live create missing id");
  await api("/api/live/"+liveId+"/join",{token:viewerToken,method:"POST",body:{}});
  await api("/api/live/"+liveId+"/join",{token:viewer2Token,method:"POST",body:{}});
  await api("/api/live/"+liveId+"/settings",{token:viewerToken,method:"PUT",body:{chatEnabled:true,slowModeSeconds:5},status:403,error:"FORBIDDEN"});
  await api("/api/live/"+liveId+"/signals",{token:viewerToken,method:"POST",body:{recipientId:host.id,kind:"offer",payload:{type:"offer",sdp:"x"}},status:403,error:"BAD_SIGNAL_ROLE"});
  await api("/api/live/"+liveId+"/signals",{token:viewerToken,method:"POST",body:{recipientId:viewer2.id,kind:"answer",payload:{type:"answer",sdp:"x"}},status:403,error:"BAD_RECIPIENT"});
  await api("/api/live/"+liveId+"/signals",{token:hostToken,method:"POST",body:{recipientId:viewer.id,kind:"offer",payload:{type:"offer",sdp:"host"}},status:201});
  d=await api("/api/live/"+liveId+"/signals?since=0",{token:viewerToken});
  if(!(d.signals||[]).some(x=>Number(x.sender_id)===Number(host.id)&&x.kind==="offer"))throw new Error("live offer signal missing");

  await api("/api/live/"+liveId+"/settings",{token:hostToken,method:"PUT",body:{chatEnabled:true,slowModeSeconds:5}});
  await api("/api/live/"+liveId+"/messages",{token:viewerToken,method:"POST",body:{body:"first"},status:201});
  await api("/api/live/"+liveId+"/messages",{token:viewerToken,method:"POST",body:{body:"second"},status:429,error:"LIVE_SLOW_MODE"});
  await api("/api/live/"+liveId+"/reactions",{token:viewerToken,method:"POST",body:{reaction:"🔥"},status:201});
  await api("/api/live/"+liveId+"/report",{token:viewerToken,method:"POST",body:{reason:"spam",details:"runtime report"}});
  const reports=Number((await pool.query("SELECT COUNT(*)::int c FROM live_reports WHERE session_id=$1 AND reporter_id=$2",[liveId,viewer.id])).rows[0]?.c||0);
  if(reports!==1)throw new Error("live report lifecycle failed");
  await api("/api/live/"+liveId+"/restrictions/"+viewer.id,{token:hostToken,method:"PUT",body:{action:"mute"}});
  await api("/api/live/"+liveId+"/messages",{token:viewerToken,method:"POST",body:{body:"muted"},status:403,error:"LIVE_CHAT_MUTED"});
  await api("/api/live/"+liveId+"/restrictions/"+viewer.id,{token:hostToken,method:"PUT",body:{action:"block"}});
  await api("/api/live/"+liveId+"/join",{token:viewerToken,method:"POST",body:{},status:403,error:"LIVE_BLOCKED"});

  // Capacity is enforced at the serialized join owner.
  const capHost=await makeUser("LiveCapHost"),capHostToken=await session(capHost.id);
  d=await api("/api/live",{token:capHostToken,method:"POST",body:{title:"capacity"},status:201});
  const capLive=Number(d.live.id);
  for(let i=0;i<8;i++){
    const v=await makeUser("LC"+i);
    await pool.query("INSERT INTO live_viewers(session_id,user_id,last_seen_at) VALUES($1,$2,NOW())",[capLive,v.id]);
  }
  const ninth=await makeUser("LiveNinth"),ninthToken=await session(ninth.id);
  await api("/api/live/"+capLive+"/join",{token:ninthToken,method:"POST",body:{},status:409,error:"LIVE_FULL"});

  // Live create rate is distributed through Redis.
  const liveRate=await makeUser("LiveRate"),liveRateToken=await session(liveRate.id);
  for(let i=0;i<4;i++)await api("/api/live",{token:liveRateToken,method:"POST",body:{title:"rate "+i},status:201});
  const liveLimited=await raw("/api/live",{token:liveRateToken,method:"POST",body:{title:"rate limited"}});
  expect(liveLimited,429,"LIVE_CREATE_RATE_LIMITED");
  if(!liveLimited.r.headers.get("retry-after"))throw new Error("live rate limit missing Retry-After");

  // Ending live removes transient viewer/signal/chat/reaction state but preserves report/audit evidence.
  await api("/api/live/"+liveId+"/end",{token:hostToken,method:"POST",body:{}});
  const transient=await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM live_viewers WHERE session_id=$1) viewers,
    (SELECT COUNT(*)::int FROM live_signals WHERE session_id=$1) signals,
    (SELECT COUNT(*)::int FROM live_messages WHERE session_id=$1) messages,
    (SELECT COUNT(*)::int FROM live_reactions WHERE session_id=$1) reactions`,[liveId]);
  const t=transient.rows[0];
  if(Number(t.viewers)||Number(t.signals)||Number(t.messages)||Number(t.reactions))throw new Error("live end left transient rows");
  const reportAfter=Number((await pool.query("SELECT COUNT(*)::int c FROM live_reports WHERE session_id=$1",[liveId])).rows[0]?.c||0);
  if(reportAfter!==1)throw new Error("live end deleted report evidence");

  console.log("group7 calls TURN voice rooms and live runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
