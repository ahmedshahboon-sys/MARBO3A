import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();

const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return "scrypt:"+salt.toString("hex")+":"+derived.toString("hex")};

async function makeUser(label,status="active"){
  const suffix=("g4_"+label.replace(/[^a-z0-9]/gi,"").slice(0,5)+"_"+Date.now().toString(36).slice(-4)+"_"+crypto.randomBytes(3).toString("hex")).toLowerCase();
  const row=(await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male',$4,$5,'user') RETURNING id,email,username,display_name",[suffix+"@example.invalid",suffix,label,passwordHash("Group4!Pass123"),status])).rows[0];
  return row;
}
async function session(userId){
  const token=crypto.randomBytes(32).toString("hex");
  await redis.set("session:"+token,String(userId),{EX:1800});
  await pool.query("INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '30 minutes',NOW())",[tokenHash(token),userId]);
  return token;
}
async function raw(path,{token,method="GET",body}={}){
  const headers={};
  if(token)headers.authorization="Bearer "+token;
  if(body!==undefined)headers["content-type"]="application/json";
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  return{r,data};
}
function expect(result,status,error){
  if(result.r.status!==status)throw new Error("expected "+status+", got "+result.r.status+": "+JSON.stringify(result.data));
  if(error&&result.data.error!==error)throw new Error("expected "+error+", got "+JSON.stringify(result.data));
  return result.data;
}
async function api(path,opts={}){const result=await raw(path,opts);return expect(result,opts.status||200,opts.error)}
async function setPrivacy(id,posts="everyone",friends="friends"){
  await pool.query("INSERT INTO profile_privacy(user_id,who_can_see_posts,who_can_see_friends) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET who_can_see_posts=EXCLUDED.who_can_see_posts,who_can_see_friends=EXCLUDED.who_can_see_friends,updated_at=NOW()",[id,posts,friends]);
}
async function befriend(a,b){
  await pool.query("DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)",[a,b]);
  await pool.query("INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'accepted')",[a,b]);
}

try{
  const owner=await makeUser("Group4Owner"),viewer=await makeUser("Group4Viewer"),blockedAuthor=await makeUser("Group4Blocked"),disabledAuthor=await makeUser("Group4Disabled","disabled");
  const ownerToken=await session(owner.id),viewerToken=await session(viewer.id);
  await setPrivacy(owner.id,"everyone","friends");
  await setPrivacy(blockedAuthor.id,"everyone","everyone");

  let d=await api("/api/feed",{token:ownerToken,method:"POST",body:{body:"Group 4 canonical lifecycle post"},status:201});
  const postId=Number(d.post?.id);
  if(!Number.isSafeInteger(postId)||postId<=0)throw new Error("post did not expose a stable public id");

  const blockedPost=Number((await pool.query("INSERT INTO posts(user_id,body) VALUES($1,$2) RETURNING id",[blockedAuthor.id,"blocked author post"])).rows[0].id);
  const disabledPost=Number((await pool.query("INSERT INTO posts(user_id,body) VALUES($1,$2) RETURNING id",[disabledAuthor.id,"disabled author post"])).rows[0].id);
  await pool.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[viewer.id,blockedAuthor.id]);

  d=await api("/api/feed?limit=30&seed=404",{token:viewerToken});
  const feedIds=new Set((d.posts||[]).map(x=>Number(x.id)));
  if(feedIds.has(blockedPost))throw new Error("authenticated feed leaked blocked author");
  if(feedIds.has(disabledPost))throw new Error("authenticated feed leaked disabled account");
  if(!feedIds.has(postId))throw new Error("authenticated feed lost visible owner post");

  d=await api("/api/public/feed?limit=30&seed=404");
  const publicIds=new Set((d.posts||[]).map(x=>Number(x.id)));
  if(publicIds.has(disabledPost))throw new Error("public feed leaked disabled account");
  if(!publicIds.has(postId))throw new Error("public feed lost public owner post");

  d=await api("/api/feed/"+postId,{token:viewerToken});
  if(Number(d.post?.id)!==postId)throw new Error("deep-link post target returned wrong id");

  d=await api("/api/public/profile/"+encodeURIComponent(owner.username));
  if(Number(d.user?.id)!==Number(owner.id))throw new Error("public profile id is not stable");

  await setPrivacy(owner.id,"nobody","nobody");
  await api("/api/feed/"+postId,{token:viewerToken,status:404,error:"POST_NOT_FOUND"});
  await api("/api/feed/"+postId+"/reaction",{token:viewerToken,method:"PUT",body:{reaction:"love"},status:404,error:"POST_NOT_FOUND"});
  await api("/api/feed/"+postId+"/comments",{token:viewerToken,method:"POST",body:{body:"must not leak"},status:404,error:"POST_NOT_FOUND"});
  await api("/api/feed/"+postId+"/save",{token:viewerToken,method:"POST",body:{},status:404,error:"POST_NOT_FOUND"});
  d=await api("/api/social/profile/"+encodeURIComponent(owner.username),{token:viewerToken});
  if(Number(d.profile?.posts_count)!==0||(d.posts||[]).length!==0)throw new Error("private profile leaked post inventory");

  await pool.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[owner.id,viewer.id]);
  await api("/api/social/profile/"+encodeURIComponent(owner.username),{token:viewerToken,status:404,error:"USER_NOT_FOUND"});
  await api("/api/users/"+owner.id+"/social",{token:viewerToken,status:404,error:"USER_NOT_FOUND"});
  await api("/api/users/"+owner.id+"/mutual-friends",{token:viewerToken,status:404,error:"USER_NOT_FOUND"});
  await pool.query("DELETE FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",[owner.id,viewer.id]);

  await befriend(owner.id,viewer.id);
  await setPrivacy(owner.id,"friends","nobody");
  await api("/api/users/"+owner.id+"/mutual-friends",{token:viewerToken,status:403,error:"PRIVACY_RESTRICTED"});
  await setPrivacy(owner.id,"friends","friends");
  await api("/api/users/"+owner.id+"/mutual-friends",{token:viewerToken});

  d=await api("/api/feed/"+postId+"/reaction",{token:viewerToken,method:"PUT",body:{reaction:"love"}});
  if(d.reaction!=="love"||Number(d.total)<1)throw new Error("post reaction contract failed");
  const reactionNotif=Number((await pool.query("SELECT COUNT(*)::int c FROM notifications WHERE user_id=$1 AND actor_id=$2 AND type='post_reaction' AND ref_id=$3",[owner.id,viewer.id,postId])).rows[0]?.c||0);
  if(reactionNotif<1)throw new Error("post reaction notification missing");

  d=await api("/api/feed/"+postId+"/comments",{token:viewerToken,method:"POST",body:{body:"viewer root"} ,status:201});
  const rootId=Number(d.comment?.id);if(!rootId)throw new Error("root comment missing id");
  d=await api("/api/feed/"+postId+"/comments",{token:ownerToken,method:"POST",body:{body:"owner reply",parentCommentId:rootId},status:201});
  const replyId=Number(d.comment?.id);if(!replyId)throw new Error("reply missing id");
  await api("/api/feed/"+postId+"/comments",{token:viewerToken,method:"POST",body:{body:"too deep",parentCommentId:replyId},status:400,error:"REPLY_DEPTH_LIMIT"});
  d=await api("/api/feed/"+postId+"/comments",{token:viewerToken});
  const root=(d.comments||[]).find(x=>Number(x.id)===rootId);
  if(!root||(root.replies||[]).every(x=>Number(x.id)!==replyId))throw new Error("threaded comment hierarchy failed");

  d=await api("/api/feed/"+postId+"/save",{token:viewerToken,method:"POST",body:{}});
  if(d.saved!==true)throw new Error("save contract failed");
  d=await api("/api/saved",{token:viewerToken});
  if(!(d.posts||[]).some(x=>Number(x.id)===postId))throw new Error("visible saved post missing");
  await setPrivacy(owner.id,"nobody","friends");
  d=await api("/api/saved",{token:viewerToken});
  if((d.posts||[]).some(x=>Number(x.id)===postId))throw new Error("saved posts leaked after privacy tightened");
  await setPrivacy(owner.id,"friends","friends");

  d=await api("/api/profile/pin-post/"+postId,{token:ownerToken,method:"POST",body:{}});
  if(Number(d.pinnedPostId)!==postId)throw new Error("pin post failed");

  d=await api("/api/feed/"+postId+"/comments/"+rootId,{token:viewerToken,method:"DELETE"});
  if(Number(d.deletedCount)<2||!(d.deletedIds||[]).map(Number).includes(replyId))throw new Error("root comment delete did not cascade to replies");

  await api("/api/feed/"+postId,{token:ownerToken,method:"DELETE"});
  const pinned=(await pool.query("SELECT pinned_post_id FROM users WHERE id=$1",[owner.id])).rows[0]?.pinned_post_id;
  if(pinned!==null)throw new Error("post delete left stale profile pin");
  await api("/api/profile/pin-post/"+postId,{token:ownerToken,method:"POST",body:{},status:404,error:"POST_NOT_FOUND"});

  await befriend(owner.id,viewer.id);
  d=await api("/api/friends/"+owner.id,{token:viewerToken,method:"DELETE"});
  if(d.removed!==true||Number(d.userId)!==Number(owner.id))throw new Error("friend removal contract incomplete");
  await api("/api/friends/"+owner.id,{token:viewerToken,method:"DELETE",status:404,error:"FRIENDSHIP_NOT_FOUND"});
  const audit=Number((await pool.query("SELECT COUNT(*)::int c FROM audit_logs WHERE user_id=$1 AND category='SOCIAL' AND action='FRIEND_REMOVED'",[viewer.id])).rows[0]?.c||0);
  if(audit<1)throw new Error("friend removal audit missing");

  d=await api("/api/users/search?q="+encodeURIComponent(blockedAuthor.username.slice(0,12)),{token:viewerToken});
  if((d.users||[]).some(x=>Number(x.id)===Number(blockedAuthor.id)))throw new Error("user search leaked blocked account");
  d=await api("/api/friends",{token:viewerToken});
  if((d.suggestions||[]).some(x=>Number(x.id)===Number(blockedAuthor.id)))throw new Error("friend suggestions leaked blocked account");

  console.log("group4 social lifecycle runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
