import http from "http";
import {pool,requireAuth,isAdmin,clean,emitRoom} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const USERNAME_RE=/^[a-z0-9._]{3,24}$/;

async function roomAccess(roomId,user){
  const room=(await pool.query(`SELECT id,owner_id FROM rooms WHERE id=$1`,[roomId])).rows[0];
  if(!room)return null;
  const member=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,user.id])).rows[0];
  return {room,member,manager:isAdmin(user)||Number(room.owner_id)===Number(user.id)||["owner","moderator"].includes(member?.role)};
}


http.createServer=function socialExperienceServer(app,...args){
 if(typeof app==="function"&&app?.use){
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
