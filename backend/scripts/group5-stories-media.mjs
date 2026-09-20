import crypto from "crypto";
import fs from "fs/promises";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();

const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
const passwordHash=password=>{const salt=crypto.randomBytes(16),derived=crypto.scryptSync(password,salt,64);return "scrypt:"+salt.toString("hex")+":"+derived.toString("hex")};

async function makeUser(label){
  const suffix=("g5_"+label.replace(/[^a-z0-9]/gi,"").slice(0,5)+"_"+Date.now().toString(36).slice(-4)+"_"+crypto.randomBytes(3).toString("hex")).toLowerCase();
  return (await pool.query("INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male',$4,'active','user') RETURNING id,email,username,display_name",[suffix+"@example.invalid",suffix,label,passwordHash("Group5!Pass123")])).rows[0];
}
async function session(userId){
  const token=crypto.randomBytes(32).toString("hex");
  await redis.set("session:"+token,String(userId),{EX:1800});
  await pool.query("INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '30 minutes',NOW())",[tokenHash(token),userId]);
  return token;
}
async function raw(path,{token,method="GET",body,form}={}){
  const headers={};
  if(token)headers.authorization="Bearer "+token;
  let payload;
  if(form)payload=form;
  else if(body!==undefined){headers["content-type"]="application/json";payload=JSON.stringify(body)}
  const r=await fetch(base+path,{method,headers,body:payload});
  const data=await r.json().catch(()=>({}));
  return{r,data};
}
function expect(result,status,error){
  if(result.r.status!==status)throw new Error("expected "+status+", got "+result.r.status+": "+JSON.stringify(result.data));
  if(error&&result.data.error!==error)throw new Error("expected "+error+", got "+JSON.stringify(result.data));
  return result.data;
}
async function api(path,opts={}){const result=await raw(path,opts);return expect(result,opts.status||200,opts.error)}
async function setPrivacy(id,see="everyone",reply="friends"){
  await pool.query("INSERT INTO profile_privacy(user_id,who_can_see_story,who_can_reply_story) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET who_can_see_story=EXCLUDED.who_can_see_story,who_can_reply_story=EXCLUDED.who_can_reply_story,updated_at=NOW()",[id,see,reply]);
}
async function befriend(a,b){
  await pool.query("DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)",[a,b]);
  await pool.query("INSERT INTO friendships(requester_id,addressee_id,status) VALUES($1,$2,'accepted')",[a,b]);
}
function localMediaPath(url){
 const raw=String(url||"").split("?")[0],root=process.env.STORAGE_LOCAL_DIR||process.env.UPLOAD_DIR||"/tmp/marbo3a-uploads";
 let key=raw.startsWith("/api/uploads/files/")?raw.slice("/api/uploads/files/".length):raw.startsWith("/api/uploads/")?raw.slice("/api/uploads/".length):raw.startsWith("/uploads/")?raw.slice("/uploads/".length):"";
 return key?root.replace(/\/$/,"")+"/"+key:null;
}
async function exists(path){if(!path)return false;try{await fs.stat(path);return true}catch{return false}}
async function storyIds(token){
  const d=await api("/api/stories",{token});
  return{data:d,ids:new Set((d.stories||[]).map(x=>Number(x.id)))};
}

try{
  const owner=await makeUser("StoryOwner"),viewer=await makeUser("StoryViewer"),other=await makeUser("StoryOther");
  const ownerToken=await session(owner.id),viewerToken=await session(viewer.id),otherToken=await session(other.id);
  await setPrivacy(owner.id,"everyone","friends");

  // Real image upload through the canonical storage path must produce an owned nested URL.
  const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  let form=new FormData();form.append("file",new Blob([png],{type:"image/png"}),"story.png");
  let d=await api("/api/uploads",{token:ownerToken,method:"POST",form,status:201});
  const image=d.file;
  if(!image?.url||!/^\/api\/uploads\/\d{4}-\d{2}-\d{2}\//.test(image.url))throw new Error("canonical image upload did not expose nested owned storage path");

  // Group 15 upload negatives + metadata stripping.
  form=new FormData();form.append("file",new Blob([Buffer.from("not really a png")],{type:"image/png"}),"fake.png");
  await api("/api/uploads",{token:ownerToken,method:"POST",form,status:415,error:"UNSUPPORTED_FILE"});

  const oversized=Buffer.alloc(8*1024*1024+1024);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(oversized,0);
  form=new FormData();form.append("file",new Blob([oversized],{type:"image/png"}),"too-large.png");
  await api("/api/uploads",{token:ownerToken,method:"POST",form,status:413,error:"FILE_TOO_LARGE"});

  const exifPayload=Buffer.from("Exif\0\0GPSLatitude=32.8872;GPSLongitude=13.1913","utf8"),exifLen=Buffer.alloc(2);
  exifLen.writeUInt16BE(exifPayload.length+2,0);
  const jpegWithExif=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe1]),exifLen,exifPayload,Buffer.from([0xff,0xd9])]);
  form=new FormData();form.append("file",new Blob([jpegWithExif],{type:"image/jpeg"}),"gps.jpg");
  d=await api("/api/uploads",{token:ownerToken,method:"POST",form,status:201});
  if(d.file?.metadataStripped!==true)throw new Error("image upload did not report metadata stripping");
  const sanitizedPath=localMediaPath(d.file?.url),sanitized=await fs.readFile(sanitizedPath);
  if(sanitized.includes(Buffer.from("Exif"))||sanitized.includes(Buffer.from("GPSLatitude"))||sanitized.includes(Buffer.from("GPSLongitude")))throw new Error("EXIF/GPS metadata remained in stored image");

  d=await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"image",text:"nested owned image",mediaUrl:image.url,mediaType:image.type,privacy:"everyone"},status:201});
  const imageStory=Number(d.story?.id);if(!imageStory)throw new Error("image story missing id");

  await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"video",text:"spoof",mediaUrl:image.url,mediaType:"video/mp4",privacy:"everyone"},status:400,error:"INVALID_STORY_MEDIA_TYPE"});
  await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"image",mediaUrl:"https://evil.invalid/a.png",mediaType:"image/png",privacy:"everyone"},status:400,error:"INVALID_STORY_MEDIA"});

  d=await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"text",text:"text story",mediaUrl:"https://evil.invalid/ignored.png",mediaType:"image/png",privacy:"everyone"},status:201});
  const textStory=Number(d.story?.id);if(!textStory||d.story.media_url!==null||d.story.media_type!==null)throw new Error("text story retained media fields");

  // Fake video content must be discarded, real container signature accepted.
  const uploadDir=process.env.UPLOAD_DIR||"/tmp/marbo3a-uploads";
  await fs.mkdir(uploadDir,{recursive:true});
  const beforeInvalid=new Set(await fs.readdir(uploadDir).catch(()=>[]));
  form=new FormData();form.append("file",new Blob([Buffer.from("not-a-video-container")],{type:"video/mp4"}),"fake.mp4");
  await api("/api/uploads/video",{token:ownerToken,method:"POST",form,status:400,error:"UNSUPPORTED_FILE"});
  const afterInvalid=await fs.readdir(uploadDir).catch(()=>[]);
  if(afterInvalid.some(x=>!beforeInvalid.has(x)))throw new Error("invalid video upload left a file behind");

  const mp4=Buffer.alloc(16);mp4.write("ftyp",4,"ascii");
  form=new FormData();form.append("file",new Blob([mp4],{type:"video/mp4"}),"real.mp4");
  d=await api("/api/uploads/video",{token:ownerToken,method:"POST",form,status:201});
  const video=d.file;if(!video?.url||video.type!=="video/mp4")throw new Error("valid video upload contract failed");
  d=await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"video",text:"video story",mediaUrl:video.url,mediaType:video.type,privacy:"everyone"},status:201});
  const videoStory=Number(d.story?.id);if(!videoStory)throw new Error("video story missing id");
  // Expired, non-highlighted story media must be cleaned instead of remaining public forever.
  form=new FormData();form.append("file",new Blob([png],{type:"image/png"}),"expiry.png");
  d=await api("/api/uploads",{token:ownerToken,method:"POST",form,status:201});
  const expiryFile=d.file,expiryPath=localMediaPath(expiryFile.url);
  if(!await exists(expiryPath))throw new Error("expiry test media was not stored");
  const expiryStory=Number((await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"image",mediaUrl:expiryFile.url,mediaType:expiryFile.type,privacy:"everyone"},status:201})).story?.id);
  await pool.query("UPDATE stories SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[expiryStory]);
  await storyIds(viewerToken);
  const expiryRow=(await pool.query("SELECT deleted_at FROM stories WHERE id=$1",[expiryStory])).rows[0];
  if(!expiryRow?.deleted_at)throw new Error("expired non-highlighted story was not cleaned");
  if(await exists(expiryPath))throw new Error("expired story media remained public after cleanup");


  // Mute removes owner from the rail without changing the story.
  let list=await storyIds(viewerToken);
  if(!list.ids.has(imageStory)||!list.ids.has(textStory)||!list.ids.has(videoStory))throw new Error("visible stories missing from viewer rail");
  await api("/api/stories/mutes/"+owner.id,{token:viewerToken,method:"PUT",body:{}});
  list=await storyIds(viewerToken);
  if(list.ids.has(imageStory)||list.ids.has(textStory)||list.ids.has(videoStory))throw new Error("muted owner still visible in story rail");
  await api("/api/stories/mutes/"+owner.id,{token:viewerToken,method:"DELETE"});
  list=await storyIds(viewerToken);
  if(!list.ids.has(imageStory))throw new Error("unmuted owner did not return to story rail");
  await api("/api/stories/mutes/999999999",{token:viewerToken,method:"PUT",body:{},status:404,error:"USER_NOT_FOUND"});

  // Account privacy closes list, direct view, reaction and reply.
  await setPrivacy(owner.id,"nobody","nobody");
  list=await storyIds(viewerToken);
  if(list.ids.has(imageStory))throw new Error("story privacy nobody leaked into rail");
  await api("/api/stories/"+imageStory+"/view",{token:viewerToken,method:"POST",body:{},status:403,error:"STORY_FORBIDDEN"});
  await api("/api/stories/"+imageStory+"/reaction",{token:viewerToken,method:"PUT",body:{emoji:"❤️"},status:403,error:"STORY_FORBIDDEN"});
  await api("/api/stories/"+imageStory+"/reply",{token:viewerToken,method:"POST",body:{body:"blocked by story privacy"},status:403,error:"STORY_FORBIDDEN"});

  // Friend-only story and reply policy.
  await befriend(owner.id,viewer.id);
  await setPrivacy(owner.id,"friends","friends");
  const friendStory=Number((await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"text",text:"friends only",privacy:"friends"},status:201})).story?.id);
  if(!friendStory)throw new Error("friend story missing id");
  list=await storyIds(viewerToken);if(!list.ids.has(friendStory))throw new Error("friend story invisible to accepted friend");

  await api("/api/stories/"+friendStory+"/view",{token:viewerToken,method:"POST",body:{}});
  d=await api("/api/stories/"+friendStory+"/viewers",{token:ownerToken});
  if(!(d.viewers||[]).some(x=>Number(x.viewer_id)===Number(viewer.id)))throw new Error("story viewer was not recorded");
  await api("/api/stories/"+friendStory+"/viewers",{token:otherToken,status:403,error:"FORBIDDEN"});

  await api("/api/stories/"+friendStory+"/reaction",{token:viewerToken,method:"PUT",body:{emoji:"❤️"}});
  await api("/api/stories/"+friendStory+"/reaction",{token:viewerToken,method:"PUT",body:{emoji:"🔥"}});
  let reactionNotif=Number((await pool.query("SELECT COUNT(*)::int c FROM notifications WHERE user_id=$1 AND actor_id=$2 AND type='story_reaction' AND ref_id=$3",[owner.id,viewer.id,friendStory])).rows[0]?.c||0);
  if(reactionNotif!==1)throw new Error("story reaction notification stacked instead of replacing");
  await api("/api/stories/"+friendStory+"/reaction",{token:viewerToken,method:"DELETE"});
  reactionNotif=Number((await pool.query("SELECT COUNT(*)::int c FROM notifications WHERE user_id=$1 AND actor_id=$2 AND type='story_reaction' AND ref_id=$3",[owner.id,viewer.id,friendStory])).rows[0]?.c||0);
  if(reactionNotif!==0)throw new Error("story reaction delete left stale notification");

  await setPrivacy(owner.id,"friends","nobody");
  await api("/api/stories/"+friendStory+"/reply",{token:viewerToken,method:"POST",body:{body:"must be denied"},status:403,error:"STORY_REPLY_RESTRICTED"});
  await setPrivacy(owner.id,"friends","friends");
  d=await api("/api/stories/"+friendStory+"/reply",{token:viewerToken,method:"POST",body:{body:"runtime reply"},status:201});
  if(!Number(d.conversationId)||!Number(d.message?.id))throw new Error("story reply did not create a direct message");
  const replyNotif=Number((await pool.query("SELECT COUNT(*)::int c FROM notifications WHERE user_id=$1 AND actor_id=$2 AND type='story_reply' AND ref_id=$3",[owner.id,viewer.id,friendStory])).rows[0]?.c||0);
  if(replyNotif<1)throw new Error("story reply notification missing");

  // Highlight survives expiry but disappears from the 24-hour rail.
  await api("/api/stories/"+friendStory+"/highlight",{token:ownerToken,method:"POST",body:{title:"runtime"}});
  await pool.query("UPDATE stories SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[friendStory]);
  list=await storyIds(viewerToken);if(list.ids.has(friendStory))throw new Error("expired story remained in active rail");
  d=await api("/api/users/"+owner.id+"/story-highlights",{token:viewerToken});
  if(!(d.highlights||[]).some(x=>Number(x.id)===friendStory))throw new Error("highlight did not preserve expired story");

  // Bidirectional block denies active story visibility and interaction.
  const blockStory=Number((await api("/api/stories",{token:ownerToken,method:"POST",body:{kind:"text",text:"block test",privacy:"everyone"},status:201})).story?.id);
  await pool.query("INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[viewer.id,owner.id]);
  list=await storyIds(viewerToken);if(list.ids.has(blockStory))throw new Error("blocked story leaked into rail");
  await api("/api/stories/"+blockStory+"/view",{token:viewerToken,method:"POST",body:{},status:403,error:"STORY_FORBIDDEN"});
  await api("/api/stories/"+blockStory+"/reaction",{token:viewerToken,method:"PUT",body:{emoji:"❤️"},status:403,error:"STORY_FORBIDDEN"});
  await api("/api/stories/"+blockStory+"/reply",{token:viewerToken,method:"POST",body:{body:"blocked"},status:403,error:"STORY_FORBIDDEN"});
  await pool.query("DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2",[viewer.id,owner.id]);

  // Deletion is transactional and cleans highlight + reaction/reply notifications.
  await api("/api/stories/"+blockStory+"/highlight",{token:ownerToken,method:"POST",body:{title:"delete me"}});
  await api("/api/stories/"+blockStory+"/reaction",{token:viewerToken,method:"PUT",body:{emoji:"😍"}});
  await api("/api/stories/"+blockStory+"/reply",{token:viewerToken,method:"POST",body:{body:"delete cleanup"},status:201});
  await api("/api/stories/"+blockStory,{token:ownerToken,method:"DELETE"});
  const row=(await pool.query("SELECT deleted_at FROM stories WHERE id=$1",[blockStory])).rows[0];
  if(!row?.deleted_at)throw new Error("story delete did not soft-delete");
  const highlights=Number((await pool.query("SELECT COUNT(*)::int c FROM story_highlights WHERE story_id=$1",[blockStory])).rows[0]?.c||0);
  const notices=Number((await pool.query("SELECT COUNT(*)::int c FROM notifications WHERE ref_id=$1 AND type IN('story_reaction','story_reply')",[blockStory])).rows[0]?.c||0);
  if(highlights!==0||notices!==0)throw new Error("story delete left stale highlight or notifications");
  // Manual media-story deletion also removes its orphaned owned object.
  const imagePath=localMediaPath(image.url);
  if(!await exists(imagePath))throw new Error("image story media missing before manual delete");
  await api("/api/stories/"+imageStory,{token:ownerToken,method:"DELETE"});
  if(await exists(imagePath))throw new Error("manual story delete left orphaned media");


  console.log("group5 stories and media runtime ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
