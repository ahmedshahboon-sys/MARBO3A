import http from "http";
import {pool,redis,ensureRedis,requireAuth,requireAdmin,isAdmin} from "./runtime.mjs";
const previous=http.createServer.bind(http);
async function auth(req,res){return requireAuth(req,res)}
const mediaSql=`COALESCE((SELECT jsonb_agg(jsonb_build_object('url',pm.url,'type',pm.media_type,'position',pm.position) ORDER BY pm.position,pm.id) FROM post_media pm WHERE pm.post_id=p.id),CASE WHEN p.image_url IS NOT NULL AND p.image_url<>'' THEN jsonb_build_array(jsonb_build_object('url',p.image_url,'type','image','position',0)) ELSE '[]'::jsonb END)`;
function friendsPostSelect(where="",extra=""){return `SELECT p.id,p.body,p.image_url,p.location_label,p.created_at,p.updated_at,u.id user_id,u.username,u.display_name,u.avatar_url,(SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id=p.id) likes_count,(SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) comments_count,EXISTS(SELECT 1 FROM post_likes ml WHERE ml.post_id=p.id AND ml.user_id=$1) liked,${mediaSql} media FROM posts p JOIN users u ON u.id=p.user_id WHERE p.deleted_at IS NULL AND (p.user_id=$1 OR EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester_id=$1 AND f.addressee_id=p.user_id) OR (f.addressee_id=$1 AND f.requester_id=p.user_id)))) ${where} ${extra}`}

http.createServer=function v1SocialCreateServer(app,...args){if(typeof app==="function"&&app?.use){ensureRedis().catch(()=>{});
 app.get("/api/feed/friends",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const cursor=Math.max(0,Number(req.query.cursor)||0),limit=Math.min(30,Math.max(5,Number(req.query.limit)||15));const params=[u.id];let where="";if(cursor){params.push(cursor);where=`AND p.id<$${params.length}`}params.push(limit);const rows=(await pool.query(friendsPostSelect(where,`ORDER BY p.id DESC LIMIT $${params.length}`),params)).rows;res.json({ok:true,posts:rows,nextCursor:rows.length===limit?rows.at(-1).id:null})}catch(e){console.error("friends feed",e);res.status(500).json({ok:false,error:"FEED_LOAD_FAILED"})}});


app.get("/api/rooms/:id/bans",async(req,res)=>{try{const u=await auth(req,res);if(!u)return;const roomId=Number(req.params.id),role=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0]?.role;if(!isAdmin(u)&&!["owner","moderator"].includes(role))return res.status(403).json({ok:false,error:"FORBIDDEN"});const rows=(await pool.query(`SELECT b.user_id,b.reason,b.created_at,x.username,x.display_name,x.avatar_url FROM room_bans b JOIN users x ON x.id=b.user_id WHERE b.room_id=$1 ORDER BY b.created_at DESC`,[roomId])).rows;res.json({ok:true,bans:rows})}catch{res.status(500).json({ok:false,error:"ROOM_BANS_FAILED"})}});

 }return previous(app,...args)};
