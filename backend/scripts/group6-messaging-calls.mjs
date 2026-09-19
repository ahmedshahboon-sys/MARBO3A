import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();

const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return "scrypt:"+salt.toString("hex")+":"+derived.toString("hex")};

async function makeUser(label){
  const suffix=("g6_"+label.replace(/[^a-z0-9]/gi,"").slice(0,5)+"_"+Date.now().toString(36).slice(-4)+"_"+crypto.randomBytes(3).toString("hex")).toLowerCase();
  return (await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male',$4,'active','user') RETURNING id,email,username,display_name",[suffix+"@example.invalid",suffix,label,passwordHash("Group6!Pass123")])).rows[0];
}
async function session(userId){
  const token=crypto.randomBytes(32).toString("hex");
  await redis.set("session:"+token,String(userId),{EX:1800});
  await pool.query("INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '30 minutes',NOW())",[tokenHash(token),userId]);
  return token;
}
async function raw(path,{token,method="GET",body,form}={}){
  const headers={}; if(token)headers.authorization="Bearer "+token;
  let payload;
  if(form)payload=form; else if(body!==undefined){headers["content-type"]="application/json";payload=JSON.stringify(body)}
  const r=await fetch(base+path,{method,headers,body:payload});
  const data=await r.json().catch(()=>({}));
  return{r,data};
}
function expect(result,status,error){
  if(result.r.status!==status)throw new Error("expected "+status+", got "+result.r.status+": "+JSON.stringify(result.data));
  if(error&&result.data.error!==error)throw new Error("expected "+error+", got "+JSON.stringify(result.data));
  return result.data;
}
async function api(path,opts={}){return expect(await raw(path,opts),opts.status||200,opts.error)}
async function setPrivacy(id,{message="friends",call="friends"}={}){
  await pool.query("INSERT INTO profile_privacy(user_id,who_can_message,who_can_call) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET who_can_message=EXCLUDED.who_can_message,who_can_call=EXCLUDED.who_can_call,updated_at=NOW()",[id,message,call]);
}
async function befriend(a,b){
  await pool.query("DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)",[a,b]);
  await pool.query("INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'accepted')",[a,b]);
}
async function conversation(a,b){
  const low=Math.min(Number(a),Number(b)),high=Math.max(Number(a),Number(b));
  await pool.query("INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[low,high]);
  return (await pool.query("SELECT * FROM direct_conversations WHERE LEAST(user1_id,user2_id)=$1 AND GREATEST(user1_id,user2_id)=$2",[low,high])).rows[0];
}

try{
  const alice=await makeUser("Alice"),bob=await makeUser("Bob"),carol=await makeUser("Carol");
  const aliceToken=await session(alice.id),bobToken=await session(bob.id),carolToken=await session(carol.id);
  await setPrivacy(alice.id,{message:"friends",call:"friends"});
  await setPrivacy(bob.id,{message:"friends",call:"friends"});
  await setPrivacy(carol.id,{message:"everyone",call:"everyone"});
  await befriend(alice.id,bob.id);
  const ab=await conversation(alice.id,bob.id),ac=await conversation(alice.id,carol.id),bc=await conversation(bob.id,carol.id);

  // Canonical text + rich/voice message lifecycle.
  let d=await api("/api/chats/"+ab.id+"/messages",{token:aliceToken,method:"POST",body:{body:"hello group6"},status:201});
  const rootId=Number(d.message?.id); if(!rootId)throw new Error("direct text message missing id");

  // Real audio/webm upload through content signature detection.
  const webm=Buffer.from([0x1a,0x45,0xdf,0xa3,0x42,0x86,0x81,0x01]);
  let form=new FormData(); form.append("file",new Blob([webm],{type:"audio/webm"}),"voice.webm");
  d=await api("/api/uploads",{token:aliceToken,method:"POST",form,status:201});
  if(!d.file?.url||d.file.type!=="audio/webm")throw new Error("voice upload contract failed");
  const voice=d.file;
  d=await api("/api/chats/"+ab.id+"/messages",{token:aliceToken,method:"POST",body:{attachmentUrl:voice.url,attachmentType:voice.type,replyToId:rootId},status:201});
  if(d.message?.attachment_type!=="audio/webm"||Number(d.message?.reply_to_id)!==rootId)throw new Error("voice/reply message contract failed");

  // Reply targets must stay inside their conversation.
  d=await api("/api/chats/"+ac.id+"/messages",{token:aliceToken,method:"POST",body:{body:"other conv"},status:201});
  const otherId=Number(d.message?.id);
  await api("/api/chats/"+ab.id+"/messages",{token:aliceToken,method:"POST",body:{body:"bad reply",replyToId:otherId},status:400,error:"INVALID_REPLY_TARGET"});

  // Block after an existing conversation must immediately stop both plain and rich sends.
  await pool.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[bob.id,alice.id]);
  await api("/api/chats/"+ab.id+"/messages",{token:aliceToken,method:"POST",body:{body:"blocked plain"},status:403,error:"USER_BLOCKED"});
  await api("/api/chats/"+ab.id+"/messages",{token:aliceToken,method:"POST",body:{attachmentUrl:voice.url,attachmentType:voice.type},status:403,error:"USER_BLOCKED"});
  await pool.query("DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2",[bob.id,alice.id]);

  // Pending incoming request cannot be used to bypass acceptance.
  await pool.query("INSERT INTO message_requests(requester_id,recipient_id,status) VALUES($1,$2,'pending') ON CONFLICT(requester_id,recipient_id) DO UPDATE SET status='pending',updated_at=NOW()",[carol.id,alice.id]);
  await api("/api/chats/"+ac.id+"/messages",{token:aliceToken,method:"POST",body:{body:"recipient cannot answer pending"},status:409,error:"MESSAGE_REQUEST_PENDING"});
  await pool.query("UPDATE message_requests SET status='accepted' WHERE requester_id=$1 AND recipient_id=$2",[carol.id,alice.id]);

  // Forwarding requires source scope and destination authorization.
  d=await api("/api/chats/"+bc.id+"/messages",{token:bobToken,method:"POST",body:{body:"bc source"},status:201});
  const bcSource=Number(d.message?.id);
  await api("/api/direct-messages/"+bcSource+"/forward",{token:aliceToken,method:"POST",body:{conversationId:ab.id},status:404,error:"MESSAGE_NOT_FOUND"});
  await pool.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[bob.id,alice.id]);
  await api("/api/direct-messages/"+rootId+"/forward",{token:aliceToken,method:"POST",body:{conversationId:ab.id},status:403,error:"USER_BLOCKED"});
  await pool.query("DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2",[bob.id,alice.id]);

  // Message privacy changes apply to already-created conversations.
  await setPrivacy(bob.id,{message:"nobody",call:"friends"});
  await api("/api/chats/"+ab.id+"/messages",{token:aliceToken,method:"POST",body:{body:"privacy closed"},status:403,error:"PRIVACY_RESTRICTED"});
  await setPrivacy(bob.id,{message:"friends",call:"friends"});

  // TURN config must expose ephemeral relay credentials and external-IP UDP/TCP fallbacks.
  d=await api("/api/calls/config",{token:aliceToken});
  const allUrls=(d.iceServers||[]).flatMap(x=>Array.isArray(x.urls)?x.urls:[x.urls]).filter(Boolean);
  if(!d.turnConfigured)throw new Error("TURN is not configured in CI");
  if(!allUrls.some(x=>String(x).includes("turn:127.0.0.2:3478?transport=udp")))throw new Error("TURN external UDP fallback missing");
  if(!allUrls.some(x=>String(x).includes("turn:127.0.0.2:3478?transport=tcp")))throw new Error("TURN external TCP fallback missing");
  if(JSON.stringify(d).includes(process.env.TURN_SECRET||"__never__"))throw new Error("TURN secret leaked to client");

  // Calls honor who_can_call and signaling roles.
  d=await api("/api/calls",{token:aliceToken,method:"POST",body:{conversationId:ab.id,kind:"audio"},status:201});
  const callId=d.call?.id; if(!callId)throw new Error("call creation missing id");
  await api("/api/calls/"+callId+"/signals",{token:bobToken,method:"POST",body:{kind:"offer",payload:{type:"offer",sdp:"x"}},status:403,error:"BAD_SIGNAL_ROLE"});
  await api("/api/calls/"+callId+"/signals",{token:aliceToken,method:"POST",body:{kind:"offer",payload:{type:"offer",sdp:"x"}},status:201});
  await api("/api/calls/"+callId+"/signals",{token:aliceToken,method:"POST",body:{kind:"answer",payload:{type:"answer",sdp:"x"}},status:403,error:"BAD_SIGNAL_ROLE"});
  await api("/api/calls/"+callId+"/answer",{token:bobToken,method:"POST"});
  await api("/api/calls/"+callId+"/signals",{token:bobToken,method:"POST",body:{kind:"answer",payload:{type:"answer",sdp:"x"}},status:201});
  d=await api("/api/calls/"+callId+"/signals?since=0",{token:aliceToken});
  if(!(d.signals||[]).some(x=>x.kind==="answer"))throw new Error("answer signal was not delivered to caller");
  await api("/api/calls/"+callId+"/end",{token:aliceToken,method:"POST"});
  await api("/api/calls/"+callId+"/signals?since=0",{token:aliceToken,status:409,error:"CALL_NOT_ACTIVE"});

  // Privacy/block changes mid-ring must stop further SDP/ICE exchange.
  d=await api("/api/calls",{token:aliceToken,method:"POST",body:{conversationId:ab.id,kind:"video"},status:201});
  const privacyCall=d.call?.id;
  await setPrivacy(bob.id,{message:"friends",call:"nobody"});
  await api("/api/calls/"+privacyCall+"/signals",{token:aliceToken,method:"POST",body:{kind:"offer",payload:{type:"offer",sdp:"x"}},status:403,error:"CALL_PRIVACY_RESTRICTED"});
  d=await api("/api/calls/incoming",{token:bobToken});
  if(d.call!==null)throw new Error("privacy-restricted ringing call remained incoming");
  const privacyStatus=(await pool.query("SELECT status FROM rtc_calls WHERE id=$1",[privacyCall])).rows[0]?.status;
  if(privacyStatus!=="cancelled")throw new Error("privacy-restricted ringing call was not cancelled");
  await setPrivacy(bob.id,{message:"friends",call:"friends"});

  d=await api("/api/calls",{token:aliceToken,method:"POST",body:{conversationId:ab.id,kind:"audio"},status:201});
  const blockedCall=d.call?.id;
  await pool.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[bob.id,alice.id]);
  await api("/api/calls/"+blockedCall+"/signals",{token:aliceToken,method:"POST",body:{kind:"ice",payload:{candidate:"x"}},status:403,error:"CALL_PRIVACY_RESTRICTED"});
  await pool.query("DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2",[bob.id,alice.id]);

  console.log("group6 messaging and calls runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
