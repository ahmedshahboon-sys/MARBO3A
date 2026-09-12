import http from "http";
import {pool,redis,ensureRedis,requireAuth,requireAdmin,realtimeServer,turnConfig} from "./runtime.mjs";
import {saveObject,deleteObject,storageInfo} from "./storage.mjs";

const prior=http.createServer.bind(http);
const mediaSql=`COALESCE((SELECT jsonb_agg(jsonb_build_object('url',pm.url,'type',pm.media_type,'position',pm.position) ORDER BY pm.position,pm.id) FROM post_media pm WHERE pm.post_id=p.id),CASE WHEN p.image_url IS NOT NULL AND p.image_url<>'' THEN jsonb_build_array(jsonb_build_object('url',p.image_url,'type','image','position',0)) ELSE '[]'::jsonb END)`;
const validEnv=name=>{const value=String(process.env[name]||"").trim();return Boolean(value&&value.length>20&&!/^(CHANGE_ME|YOUR_|REPLACE_ME)/i.test(value))};

async function hasMutualFriend(a,b){
  const row=(await pool.query(`SELECT 1 FROM (SELECT CASE WHEN requester_id=$1 THEN addressee_id ELSE requester_id END friend_id FROM friendships WHERE status='accepted' AND (requester_id=$1 OR addressee_id=$1)) mine JOIN (SELECT CASE WHEN requester_id=$2 THEN addressee_id ELSE requester_id END friend_id FROM friendships WHERE status='accepted' AND (requester_id=$2 OR addressee_id=$2)) theirs USING(friend_id) LIMIT 1`,[a,b])).rows[0];
  return Boolean(row);
}
async function existingRelation(a,b){return Boolean((await pool.query(`SELECT 1 FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1) LIMIT 1`,[a,b])).rows[0])}

http.createServer=function closureRoutesCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.use(async(req,res,next)=>{
      if(req.method!=="POST"||req.path!=="/api/friends/request")return next();
      try{
        const user=await requireAuth(req,res);if(!user)return;
        const target=Number(req.body?.userId);if(!Number.isSafeInteger(target)||target<=0||target===Number(user.id))return next();
        if(await existingRelation(user.id,target))return next();
        const rule=(await pool.query(`SELECT who_can_add FROM profile_privacy WHERE user_id=$1`,[target])).rows[0]?.who_can_add||"everyone";
        if(rule==="friends"&&!await hasMutualFriend(user.id,target))return res.status(403).json({ok:false,error:"MUTUAL_FRIENDS_ONLY"});
        return next();
      }catch(error){console.error("friend add privacy",error);return res.status(500).json({ok:false,error:"PRIVACY_CHECK_FAILED"})}
    });

    app.get("/api/saved/ids",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const rows=(await pool.query(`SELECT s.post_id FROM post_saves s JOIN posts p ON p.id=s.post_id WHERE s.user_id=$1 AND p.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 2000`,[user.id])).rows;res.json({ok:true,ids:rows.map(x=>x.post_id)})}catch(error){console.error("saved ids",error);res.status(500).json({ok:false,error:"SAVED_LOAD_FAILED"})}});
    app.get("/api/saved",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const rows=(await pool.query(`SELECT p.id,p.body,p.image_url,p.location_label,p.created_at,p.updated_at,u.id user_id,u.username,u.display_name,u.avatar_url,(SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id=p.id) likes_count,(SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) comments_count,EXISTS(SELECT 1 FROM post_likes ml WHERE ml.post_id=p.id AND ml.user_id=$1) liked,TRUE saved,s.created_at saved_at,${mediaSql} media FROM post_saves s JOIN posts p ON p.id=s.post_id JOIN users u ON u.id=p.user_id WHERE s.user_id=$1 AND p.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 100`,[user.id])).rows;res.json({ok:true,posts:rows})}catch(error){console.error("saved posts",error);res.status(500).json({ok:false,error:"SAVED_LOAD_FAILED"})}});
    app.post("/api/feed/:id/save",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const postId=Number(req.params.id);if(!Number.isSafeInteger(postId)||postId<=0)return res.status(400).json({ok:false,error:"INVALID_POST"});if(!(await pool.query(`SELECT 1 FROM posts WHERE id=$1 AND deleted_at IS NULL`,[postId])).rows[0])return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});await pool.query(`INSERT INTO post_saves(user_id,post_id) VALUES($1,$2) ON CONFLICT(user_id,post_id) DO NOTHING`,[user.id,postId]);res.json({ok:true,saved:true})}catch(error){console.error("save post",error);res.status(500).json({ok:false,error:"SAVE_FAILED"})}});
    app.delete("/api/feed/:id/save",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const postId=Number(req.params.id);if(!Number.isSafeInteger(postId)||postId<=0)return res.status(400).json({ok:false,error:"INVALID_POST"});await pool.query(`DELETE FROM post_saves WHERE user_id=$1 AND post_id=$2`,[user.id,postId]);res.json({ok:true,saved:false})}catch(error){console.error("unsave post",error);res.status(500).json({ok:false,error:"SAVE_FAILED"})}});

    app.get("/api/me/room-memberships",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const[joined,pending,banned]=await Promise.all([pool.query(`SELECT room_id FROM room_members WHERE user_id=$1`,[user.id]),pool.query(`SELECT room_id FROM room_join_requests WHERE user_id=$1 AND status='pending'`,[user.id]),pool.query(`SELECT room_id FROM room_bans WHERE user_id=$1`,[user.id])]);const states={};for(const row of joined.rows)states[String(row.room_id)]="joined";for(const row of pending.rows)if(!states[String(row.room_id)])states[String(row.room_id)]="pending";for(const row of banned.rows)states[String(row.room_id)]="banned";res.json({ok:true,states})}catch(error){console.error("room membership states",error);res.status(500).json({ok:false,error:"ROOM_MEMBERSHIP_LOAD_FAILED"})}});

    app.get("/api/admin/readiness",async(req,res)=>{try{const user=await requireAdmin(req,res);if(!user)return;const checks={database:false,redis:false,uploads:false,sessions:false,feed:false,realtime:false,turn:false,email:false,push:false};
      try{await pool.query(`SELECT 1`);checks.database=true}catch{}
      try{await ensureRedis();checks.redis=(await redis.ping())==="PONG"}catch{}
      try{const saved=await saveObject({buffer:Buffer.from("marbo3a-readiness"),extension:"txt",contentType:"text/plain"});await deleteObject(saved.key);checks.uploads=true}catch{}
      try{await pool.query(`SELECT 1 FROM durable_sessions LIMIT 1`);checks.sessions=true}catch{}
      try{await pool.query(`SELECT 1 FROM posts LIMIT 1`);checks.feed=true}catch{}
      checks.realtime=Boolean(realtimeServer());
      checks.turn=Boolean(turnConfig(user.id).turnConfigured);
      checks.email=validEnv("BREVO_API_KEY");
      checks.push=validEnv("VAPID_PUBLIC_KEY")&&validEnv("VAPID_PRIVATE_KEY");
      const[users,posts,rooms,errors,savedCount]=await Promise.all([pool.query(`SELECT COUNT(*)::int c FROM users`),pool.query(`SELECT COUNT(*)::int c FROM posts WHERE deleted_at IS NULL`),pool.query(`SELECT COUNT(*)::int c FROM rooms`),pool.query(`SELECT COUNT(*)::int c FROM audit_logs WHERE level='ERROR' AND created_at>NOW()-INTERVAL '24 hours'`),pool.query(`SELECT COUNT(*)::int c FROM post_saves`)]);
      res.json({ok:true,checks,counts:{users:users.rows[0].c,posts:posts.rows[0].c,rooms:rooms.rows[0].c,saved:savedCount.rows[0].c,errors24h:errors.rows[0].c},storage:storageInfo(),version:process.env.npm_package_version||"0.7.0",time:new Date().toISOString()});
    }catch(error){console.error("readiness",error);res.status(500).json({ok:false,error:"READINESS_FAILED"})}});
  }
  return prior(app,...args);
};
