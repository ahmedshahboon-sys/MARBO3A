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
const savedVisibilitySql=`
  AND (p.user_id=$1 OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocked_id=$1 AND b.blocker_id=p.user_id)))
  AND (
    p.user_id=$1
    OR COALESCE(pp.who_can_see_posts,'everyone')='everyone'
    OR (COALESCE(pp.who_can_see_posts,'everyone') IN ('friends','friends_of_friends') AND EXISTS(
      SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester_id=$1 AND f.addressee_id=p.user_id) OR (f.addressee_id=$1 AND f.requester_id=p.user_id))
    ))
    OR (COALESCE(pp.who_can_see_posts,'everyone')='friends_of_friends' AND EXISTS(
      SELECT 1
      FROM friendships mine
      JOIN friendships theirs ON
        (CASE WHEN mine.requester_id=$1 THEN mine.addressee_id ELSE mine.requester_id END)=
        (CASE WHEN theirs.requester_id=p.user_id THEN theirs.addressee_id ELSE theirs.requester_id END)
      WHERE mine.status='accepted' AND theirs.status='accepted'
        AND (mine.requester_id=$1 OR mine.addressee_id=$1)
        AND (theirs.requester_id=p.user_id OR theirs.addressee_id=p.user_id)
      LIMIT 1
    ))
  )`;

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


    app.get("/api/saved/ids",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const rows=(await pool.query(`SELECT s.post_id FROM post_saves s JOIN posts p ON p.id=s.post_id LEFT JOIN profile_privacy pp ON pp.user_id=p.user_id WHERE s.user_id=$1 AND p.deleted_at IS NULL ${savedVisibilitySql} ORDER BY s.created_at DESC LIMIT 2000`,[user.id])).rows;res.json({ok:true,ids:rows.map(x=>x.post_id)})}catch(error){console.error("saved ids",error);res.status(500).json({ok:false,error:"SAVED_LOAD_FAILED"})}});
    app.get("/api/saved",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const rows=(await pool.query(`SELECT p.id,p.body,p.image_url,p.location_label,p.created_at,p.updated_at,u.id user_id,u.username,u.display_name,u.avatar_url,(SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id=p.id) likes_count,(SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) comments_count,EXISTS(SELECT 1 FROM post_likes ml WHERE ml.post_id=p.id AND ml.user_id=$1) liked,TRUE saved,s.created_at saved_at,${mediaSql} media FROM post_saves s JOIN posts p ON p.id=s.post_id JOIN users u ON u.id=p.user_id LEFT JOIN profile_privacy pp ON pp.user_id=p.user_id WHERE s.user_id=$1 AND p.deleted_at IS NULL ${savedVisibilitySql} ORDER BY s.created_at DESC LIMIT 100`,[user.id])).rows;res.json({ok:true,posts:rows})}catch(error){console.error("saved posts",error);res.status(500).json({ok:false,error:"SAVED_LOAD_FAILED"})}});
    app.post("/api/feed/:id/save",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const postId=Number(req.params.id);if(!Number.isSafeInteger(postId)||postId<=0)return res.status(400).json({ok:false,error:"INVALID_POST"});if(!(await pool.query(`SELECT 1 FROM posts WHERE id=$1 AND deleted_at IS NULL`,[postId])).rows[0])return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});await pool.query(`INSERT INTO post_saves(user_id,post_id) VALUES($1,$2) ON CONFLICT(user_id,post_id) DO NOTHING`,[user.id,postId]);res.json({ok:true,saved:true})}catch(error){console.error("save post",error);res.status(500).json({ok:false,error:"SAVE_FAILED"})}});
    app.delete("/api/feed/:id/save",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const postId=Number(req.params.id);if(!Number.isSafeInteger(postId)||postId<=0)return res.status(400).json({ok:false,error:"INVALID_POST"});await pool.query(`DELETE FROM post_saves WHERE user_id=$1 AND post_id=$2`,[user.id,postId]);res.json({ok:true,saved:false})}catch(error){console.error("unsave post",error);res.status(500).json({ok:false,error:"SAVE_FAILED"})}});

    app.get("/api/me/room-memberships",async(req,res)=>{try{const user=await requireAuth(req,res);if(!user)return;const[joined,pending,banned]=await Promise.all([pool.query(`SELECT room_id FROM room_members WHERE user_id=$1`,[user.id]),pool.query(`SELECT room_id FROM room_join_requests WHERE user_id=$1 AND status='pending'`,[user.id]),pool.query(`SELECT room_id FROM room_bans WHERE user_id=$1`,[user.id])]);const states={};for(const row of joined.rows)states[String(row.room_id)]="joined";for(const row of pending.rows)if(!states[String(row.room_id)])states[String(row.room_id)]="pending";for(const row of banned.rows)states[String(row.room_id)]="banned";res.json({ok:true,states})}catch(error){console.error("room membership states",error);res.status(500).json({ok:false,error:"ROOM_MEMBERSHIP_LOAD_FAILED"})}});

  }
  return prior(app,...args);
};
