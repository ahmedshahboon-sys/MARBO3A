import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();
const tokenHash=t=>crypto.createHash("sha256").update(t).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`};

async function makeUser(label,role="user"){
  const suffix=`${label}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,email=`${suffix}@example.invalid`,password="Group1!Pass123";
  const row=(await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male',$4,'active',$5) RETURNING id,username`,[email,suffix,label,passwordHash(password),role])).rows[0];
  const token=crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${token}`,String(row.id),{EX:900});
  await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+make_interval(secs=>900),NOW())`,[tokenHash(token),row.id]);
  return{...row,email,password,token};
}
async function api(path,{token,method="GET",body,status,error}={}){
  const headers={};
  if(token)headers.authorization=`Bearer ${token}`;
  if(body!==undefined)headers["content-type"]="application/json";
  const r=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  const expected=Array.isArray(status)?status:[status??200];
  if(!expected.includes(r.status))throw new Error(`${method} ${path}: expected ${expected.join("/")}, got ${r.status}: ${JSON.stringify(data)}`);
  if(error&&data.error!==error)throw new Error(`${method} ${path}: expected error ${error}, got ${JSON.stringify(data)}`);
  return{status:r.status,data};
}

try{
  const A=await makeUser("Group1A"),B=await makeUser("Group1B"),C=await makeUser("Group1C"),admin=await makeUser("Group1Admin","admin");

  const ab=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES(LEAST($1,$2),GREATEST($1,$2)) RETURNING id`,[A.id,B.id])).rows[0];
  const bc=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES(LEAST($1,$2),GREATEST($1,$2)) RETURNING id`,[B.id,C.id])).rows[0];
  const foreignDm=(await pool.query(`INSERT INTO direct_messages(conversation_id,sender_id,body) VALUES($1,$2,'foreign secret') RETURNING id`,[bc.id,B.id])).rows[0];

  await api(`/api/direct-messages/${foreignDm.id}/forward`,{token:A.token,method:"POST",body:{conversationId:ab.id},status:404,error:"MESSAGE_NOT_FOUND"});

  const foreignRoom=(await pool.query(`INSERT INTO rooms(name,slug,description,is_public,owner_id) VALUES($1,$2,'',TRUE,$3) RETURNING id`,["Foreign Room "+Date.now(),`group1-foreign-${Date.now()}`,B.id])).rows[0];
  await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'member')`,[foreignRoom.id,B.id,C.id]);
  const foreignRoomMsg=(await pool.query(`INSERT INTO messages(room_id,user_id,body) VALUES($1,$2,'foreign room secret') RETURNING id`,[foreignRoom.id,B.id])).rows[0];
  const ownRoom=(await pool.query(`INSERT INTO rooms(name,slug,description,is_public,owner_id) VALUES($1,$2,'',TRUE,$3) RETURNING id`,["Own Room "+Date.now(),`group1-own-${Date.now()}`,A.id])).rows[0];
  await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'owner')`,[ownRoom.id,A.id]);
  await api(`/api/messages/${foreignRoomMsg.id}/forward`,{token:A.token,method:"POST",body:{roomId:ownRoom.id},status:404,error:"MESSAGE_NOT_FOUND"});

  await pool.query(`INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[B.id,A.id]);
  await api(`/api/chats/with/${B.id}`,{token:A.token,method:"POST",body:{},status:403,error:"USER_BLOCKED"});
  await pool.query(`DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`,[B.id,A.id]);

  await pool.query(`INSERT INTO profile_privacy(user_id,who_can_message,message_requests_enabled) VALUES($1,'nobody',TRUE) ON CONFLICT(user_id) DO UPDATE SET who_can_message='nobody',message_requests_enabled=TRUE`,[B.id]);
  await api(`/api/chats/with/${B.id}`,{token:A.token,method:"POST",body:{},status:403});

  await pool.query(`UPDATE profile_privacy SET who_can_message='friends' WHERE user_id=$1`,[B.id]);
  await api(`/api/chats/with/${B.id}`,{token:A.token,method:"POST",body:{},status:403});
  await pool.query(`INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'accepted') ON CONFLICT DO NOTHING`,[A.id,B.id]);
  const starts=await Promise.all(Array.from({length:4},()=>api(`/api/chats/with/${B.id}`,{token:A.token,method:"POST",body:{},status:[200,201]})));
  const ids=new Set(starts.map(x=>String(x.data.conversation?.id)));
  if(ids.size!==1)throw new Error("Atomic chat creation returned multiple conversations");

  await api("/api/privacy/v2",{token:A.token,method:"PATCH",body:{whoCanMessage:"everyone",whoCanCall:"nobody",showCity:true}});
  await api("/api/privacy",{token:A.token,method:"PATCH",body:{showCity:false}});
  const p=(await api("/api/privacy/v2",{token:A.token})).data.privacy;
  if(p.who_can_message!=="everyone"||p.who_can_call!=="nobody"||p.show_city!==false)throw new Error(`Legacy privacy alias overwrote v2 fields: ${JSON.stringify(p)}`);

  const extraToken=crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${extraToken}`,String(A.id),{EX:900});
  await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+make_interval(secs=>900),NOW())`,[tokenHash(extraToken),A.id]);
  const sessions=(await api("/api/account/sessions",{token:A.token})).data.sessions;
  const extra=sessions.find(x=>x.id===tokenHash(extraToken).slice(0,16));
  if(!extra)throw new Error("Durable secondary session missing from canonical sessions endpoint");
  await api(`/api/account/sessions/${extra.id}`,{token:A.token,method:"DELETE"});
  await api("/api/auth/me",{token:extraToken,status:401});

  await api("/api/admin/readiness",{token:A.token,status:403,error:"ADMIN_ONLY"});
  const readiness=(await api("/api/admin/readiness",{token:admin.token})).data;
  if(!readiness.checks||typeof readiness.checks.database!=="boolean")throw new Error("Canonical admin readiness contract missing checks");

  await api("/api/admin/system",{token:A.token,status:403,error:"ADMIN_ONLY"});
  const system=(await api("/api/admin/system",{token:admin.token})).data.system;
  if(!system||typeof system.uptimeSeconds!=="number")throw new Error("Canonical admin system contract missing");

  await api(`/api/admin/users/${C.id}/status`,{token:A.token,method:"PATCH",body:{status:"frozen",reason:"group1 unauthorized check"},status:403,error:"ADMIN_ONLY"});
  await api(`/api/admin/users/${C.id}/status`,{token:admin.token,method:"PATCH",body:{status:"frozen",reason:"group1 authorization matrix"}});
  await api("/api/auth/me",{token:C.token,status:401});
  const statusAudit=Number((await pool.query(`SELECT COUNT(*)::int c FROM admin_change_audit WHERE action='user_status_change' AND entity_id=$1`,[String(C.id)])).rows[0]?.c||0);
  if(statusAudit<1)throw new Error("Admin status change missing change-audit row");

  const report=(await pool.query(`INSERT INTO reports(reporter_id,target_type,target_id,reason,details) VALUES($1,'user',$2,'group1-test','runtime authorization matrix') RETURNING id`,[A.id,B.id])).rows[0];
  await api(`/api/admin/reports/${report.id}/action`,{token:A.token,method:"POST",body:{action:"dismiss",reason:"not authorized"},status:403,error:"ADMIN_ONLY"});
  await api(`/api/admin/reports/${report.id}/action`,{token:admin.token,method:"POST",body:{action:"dismiss",reason:"group1 dismissal"}});
  const moderationAudit=Number((await pool.query(`SELECT COUNT(*)::int c FROM moderation_actions WHERE report_id=$1 AND action='dismiss'`,[report.id])).rows[0]?.c||0);
  if(moderationAudit<1)throw new Error("Canonical report action missing moderation audit");

  const changeToken=crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${changeToken}`,String(A.id),{EX:900});
  await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+make_interval(secs=>900),NOW())`,[tokenHash(changeToken),A.id]);
  await api("/api/account/change-password",{token:A.token,method:"POST",body:{currentPassword:A.password,newPassword:"Group1!Changed456"}});
  await api("/api/auth/me",{token:changeToken,status:401});
  await api("/api/auth/me",{token:A.token});

  const resetUser=await makeUser("Group1Reset");
  const resetCode="654321",resetKey=crypto.createHash("sha256").update(`${resetUser.id}:${resetCode}`).digest("hex");
  await redis.set(`pwdreset:${resetUser.id}`,resetKey,{EX:600});
  await api("/api/auth/reset-password",{method:"POST",body:{email:resetUser.email,code:resetCode,password:"Group1!Reset789"}});
  await api("/api/auth/me",{token:resetUser.token,status:401});

  console.log("group1 runtime authorization ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
