import http from "http";
import {pool,requireAuth,isAdmin,clean,emitUser,emitRoom} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const REACTIONS=new Set(["like","laugh","angry","sad"]);
const USERNAME_RE=/^[a-z0-9._]{3,24}$/;
const REACTION_EMOJI={like:"❤️",laugh:"😂",angry:"😡",sad:"😢"};

async function roomAccess(roomId,user){
  const room=(await pool.query(`SELECT id,owner_id FROM rooms WHERE id=$1`,[roomId])).rows[0];
  if(!room)return null;
  const member=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,user.id])).rows[0];
  return {room,member,manager:isAdmin(user)||Number(room.owner_id)===Number(user.id)||["owner","moderator"].includes(member?.role)};
}
async function notify(userId,actor,type,title,body,refId){
  if(!userId||Number(userId)===Number(actor?.id))return;
  const row=(await pool.query(`INSERT INTO notifications(user_id,actor_id,type,title,body,ref_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,user_id,actor_id,type,title,body,ref_id,read_at,created_at`,[userId,actor?.id||null,type,title,body||"",refId||null])).rows[0];
  emitUser(userId,"notification:new",{...row,actor_username:actor?.username||null,actor_name:actor?.display_name||null,actor_avatar:actor?.avatar_url||null});
}

http.createServer=function socialExperienceServer(app,...args){
 if(typeof app==="function"&&app?.use){
  app.get("/api/feed/:id/reactions",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const postId=Number(req.params.id);if(!Number.isSafeInteger(postId)||postId<=0)return res.status(400).json({ok:false,error:"INVALID_POST"});
    const rows=(await pool.query(`SELECT r.user_id,r.reaction,r.updated_at,x.username,x.display_name,x.avatar_url FROM post_reactions r JOIN users x ON x.id=r.user_id WHERE r.post_id=$1 ORDER BY r.updated_at DESC LIMIT 500`,[postId])).rows;
    const summary={like:0,laugh:0,angry:0,sad:0};for(const r of rows)if(summary[r.reaction]!==undefined)summary[r.reaction]++;
    res.json({ok:true,total:rows.length,summary,myReaction:rows.find(x=>Number(x.user_id)===Number(u.id))?.reaction||null,reactions:rows});
  }catch(e){console.error("post reactions load",e);res.status(500).json({ok:false,error:"REACTIONS_LOAD_FAILED"})}});

  app.put("/api/feed/:id/reaction",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const postId=Number(req.params.id),reaction=req.body?.reaction==null?null:String(req.body.reaction);
    if(!Number.isSafeInteger(postId)||postId<=0)return res.status(400).json({ok:false,error:"INVALID_POST"});if(reaction&&!REACTIONS.has(reaction))return res.status(400).json({ok:false,error:"INVALID_REACTION"});
    const post=(await pool.query(`SELECT p.id,p.user_id FROM posts p WHERE p.id=$1 AND p.deleted_at IS NULL`,[postId])).rows[0];if(!post)return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});
    if(reaction){await pool.query(`INSERT INTO post_reactions(post_id,user_id,reaction) VALUES($1,$2,$3) ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=NOW()`,[postId,u.id,reaction]);await pool.query(`INSERT INTO post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[postId,u.id]);await pool.query(`DELETE FROM notifications WHERE user_id=$1 AND actor_id=$2 AND type='post_reaction' AND ref_id=$3`,[post.user_id,u.id,postId]).catch(()=>{});await notify(post.user_id,u,"post_reaction",`${u.display_name||u.username} تفاعل مع منشورك`,REACTION_EMOJI[reaction],postId)}else{await pool.query(`DELETE FROM post_reactions WHERE post_id=$1 AND user_id=$2`,[postId,u.id]);await pool.query(`DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2`,[postId,u.id]);await pool.query(`DELETE FROM notifications WHERE user_id=$1 AND actor_id=$2 AND type='post_reaction' AND ref_id=$3`,[post.user_id,u.id,postId]).catch(()=>{})}
    const rows=(await pool.query(`SELECT reaction,COUNT(*)::int count FROM post_reactions WHERE post_id=$1 GROUP BY reaction`,[postId])).rows,summary={like:0,laugh:0,angry:0,sad:0};for(const r of rows)summary[r.reaction]=Number(r.count);res.json({ok:true,reaction,total:Object.values(summary).reduce((a,b)=>a+b,0),summary});
  }catch(e){console.error("post reaction",e);res.status(500).json({ok:false,error:"REACTION_FAILED"})}});

  app.get("/api/feed/:id/comments/preview",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const postId=Number(req.params.id);if(!Number.isSafeInteger(postId)||postId<=0)return res.status(400).json({ok:false,error:"INVALID_POST"});
    const rows=(await pool.query(`SELECT c.id,c.post_id,c.user_id,c.body,c.created_at,c.edited_at,c.edited_at AS updated_at,x.username,x.display_name,x.avatar_url FROM post_comments c JOIN users x ON x.id=c.user_id WHERE c.post_id=$1 AND c.deleted_at IS NULL ORDER BY c.id DESC LIMIT 2`,[postId])).rows.reverse();res.json({ok:true,comments:rows});
  }catch(e){console.error("comment preview",e);res.status(500).json({ok:false,error:"COMMENTS_LOAD_FAILED"})}});

  app.get("/api/profile/identity",async(req,res)=>{try{const u=await requireAuth(req,res);if(!u)return;const row=(await pool.query(`SELECT id,username,display_name,username_changed_at FROM users WHERE id=$1`,[u.id])).rows[0];const next=row.username_changed_at?new Date(new Date(row.username_changed_at).getTime()+7*86400000):null;res.json({ok:true,user:row,usernameNextChangeAt:next?.toISOString()||null,canChangeUsername:!next||next<=new Date()})}catch(e){res.status(500).json({ok:false,error:"IDENTITY_LOAD_FAILED"})}});

  app.patch("/api/profile/identity",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const displayName=clean(req.body?.displayName,50),username=clean(req.body?.username,24).toLowerCase();if(displayName.length<2)return res.status(400).json({ok:false,error:"INVALID_DISPLAY_NAME"});if(!USERNAME_RE.test(username))return res.status(400).json({ok:false,error:"INVALID_USERNAME"});
    const current=(await pool.query(`SELECT username,display_name,username_changed_at FROM users WHERE id=$1`,[u.id])).rows[0];const usernameChanged=username!==String(current.username).toLowerCase();
    if(usernameChanged&&current.username_changed_at){const next=new Date(new Date(current.username_changed_at).getTime()+7*86400000);if(next>new Date())return res.status(429).json({ok:false,error:"USERNAME_COOLDOWN",nextChangeAt:next.toISOString()})}
    if(usernameChanged){const exists=(await pool.query(`SELECT 1 FROM users WHERE LOWER(username)=LOWER($1) AND id<>$2 LIMIT 1`,[username,u.id])).rows[0];if(exists)return res.status(409).json({ok:false,error:"USERNAME_TAKEN"})}
    const row=(await pool.query(`UPDATE users SET display_name=$2,username=$3,username_changed_at=CASE WHEN LOWER(username)<>LOWER($3) THEN NOW() ELSE username_changed_at END,updated_at=NOW() WHERE id=$1 RETURNING id,username,display_name,username_changed_at`,[u.id,displayName,username])).rows[0];res.json({ok:true,user:row});
  }catch(e){console.error("profile identity",e);res.status(500).json({ok:false,error:"IDENTITY_UPDATE_FAILED"})}});

  app.patch("/api/rooms/:roomId/messages/:messageId",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.roomId),messageId=Number(req.params.messageId),body=clean(req.body?.body,4000);if(!body)return res.status(400).json({ok:false,error:"MESSAGE_EMPTY"});const a=await roomAccess(roomId,u);if(!a)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
    const m=(await pool.query(`SELECT id,user_id,deleted_at FROM messages WHERE id=$1 AND room_id=$2`,[messageId,roomId])).rows[0];if(!m)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});if(m.deleted_at)return res.status(409).json({ok:false,error:"MESSAGE_DELETED"});if(Number(m.user_id)!==Number(u.id)&&!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});
    const row=(await pool.query(`UPDATE messages SET body=$3,edited_at=NOW() WHERE id=$1 AND room_id=$2 RETURNING id,room_id,user_id,body,edited_at`,[messageId,roomId,body])).rows[0];emitRoom(roomId,"message:updated",row);res.json({ok:true,message:row});
  }catch(e){console.error("room message edit",e);res.status(500).json({ok:false,error:"MESSAGE_EDIT_FAILED"})}});

  app.delete("/api/rooms/:roomId/messages/:messageId",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;const roomId=Number(req.params.roomId),messageId=Number(req.params.messageId),a=await roomAccess(roomId,u);if(!a)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});const m=(await pool.query(`SELECT id,user_id FROM messages WHERE id=$1 AND room_id=$2`,[messageId,roomId])).rows[0];if(!m)return res.status(404).json({ok:false,error:"MESSAGE_NOT_FOUND"});if(Number(m.user_id)!==Number(u.id)&&!a.manager)return res.status(403).json({ok:false,error:"FORBIDDEN"});const row=(await pool.query(`UPDATE messages SET deleted_at=COALESCE(deleted_at,NOW()),body='' WHERE id=$1 AND room_id=$2 RETURNING id,room_id,user_id,deleted_at`,[messageId,roomId])).rows[0];emitRoom(roomId,"message:deleted",row);res.json({ok:true,message:row});
  }catch(e){console.error("room message delete",e);res.status(500).json({ok:false,error:"MESSAGE_DELETE_FAILED"})}});
 }
 return prior(app,...args);
};
