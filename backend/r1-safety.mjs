import http from "http";
import {pool,requireAuth,isAdmin} from "./runtime.mjs";
const prior=http.createServer.bind(http);

async function friends(a,b){return Boolean((await pool.query(`SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2)OR(requester_id=$2 AND addressee_id=$1)) LIMIT 1`,[a,b])).rows[0])}
async function mutual(a,b){return Number((await pool.query(`WITH a1 AS(SELECT CASE WHEN requester_id=$1 THEN addressee_id ELSE requester_id END id FROM friendships WHERE status='accepted' AND(requester_id=$1 OR addressee_id=$1)),b1 AS(SELECT CASE WHEN requester_id=$2 THEN addressee_id ELSE requester_id END id FROM friendships WHERE status='accepted' AND(requester_id=$2 OR addressee_id=$2))SELECT COUNT(*)::int n FROM a1 JOIN b1 USING(id)`,[a,b])).rows[0]?.n||0)}
async function blocked(a,b){return Boolean((await pool.query(`SELECT 1 FROM user_blocks WHERE(blocker_id=$1 AND blocked_id=$2)OR(blocker_id=$2 AND blocked_id=$1) LIMIT 1`,[a,b])).rows[0])}
async function canAccessPost(postId,u){
  const post=(await pool.query(`SELECT p.id,p.user_id,COALESCE(pp.who_can_see_posts,'everyone') privacy_rule FROM posts p LEFT JOIN profile_privacy pp ON pp.user_id=p.user_id WHERE p.id=$1 AND p.deleted_at IS NULL`,[postId])).rows[0];
  if(!post)return{ok:false,missing:true};
  if(isAdmin(u)||String(post.user_id)===String(u.id))return{ok:true,post};
  if(await blocked(u.id,post.user_id))return{ok:false,post};
  if(post.privacy_rule==='everyone')return{ok:true,post};
  if(post.privacy_rule==='nobody')return{ok:false,post};
  if(await friends(u.id,post.user_id))return{ok:true,post};
  if(post.privacy_rule==='friends_of_friends'&&(await mutual(u.id,post.user_id))>0)return{ok:true,post};
  return{ok:false,post};
}

http.createServer=function r1SafetyServer(app,...args){
  if(typeof app==="function"&&app?.use){
    // Public/guest surfaces must never leak disabled accounts or soft-deleted room-message payloads.
    app.use((req,res,next)=>{
      if(req.method!=="GET"||req.path!=="/api/public/feed")return next();
      const json=res.json.bind(res);
      res.json=async body=>{try{if(body?.ok&&Array.isArray(body.posts)&&body.posts.length){const ids=[...new Set(body.posts.map(p=>Number(p.user_id)).filter(Number.isSafeInteger))];if(ids.length){const active=new Set((await pool.query(`SELECT id FROM users WHERE id=ANY($1::bigint[]) AND account_status='active'`,[ids])).rows.map(x=>String(x.id)));body={...body,posts:body.posts.filter(p=>active.has(String(p.user_id)))}}}}catch{return json({ok:false,error:"PUBLIC_FEED_FAILED"})}return json(body)};
      next();
    });
    app.use(async(req,res,next)=>{try{
      const match=req.path.match(/^\/api\/public\/rooms-v2\/(\d+)\/presence\/heartbeat$/);if(req.method!=="POST"||!match)return next();
      const room=(await pool.query(`SELECT 1 FROM rooms WHERE id=$1 AND visibility='public'`,[Number(match[1])])).rows[0];if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});next();
    }catch(e){next(e)}});
    app.use((req,res,next)=>{
      if(req.method!=="GET"||!/^\/api\/public\/rooms-v2\/\d+\/messages$/.test(req.path))return next();
      const json=res.json.bind(res);res.json=body=>{if(body?.ok&&Array.isArray(body.messages))body={...body,messages:body.messages.map(m=>m?.deleted_at?{...m,body:null,attachment_url:null,attachment_type:null}:m)};return json(body)};next();
    });

    app.use(async(req,res,next)=>{try{
      if(req.method!=="GET"||req.path!=="/api/feed")return next();
      const u=await requireAuth(req,res);if(!u)return;
      const blocked=(await pool.query(`SELECT CASE WHEN blocker_id=$1 THEN blocked_id ELSE blocker_id END id FROM user_blocks WHERE blocker_id=$1 OR blocked_id=$1`,[u.id])).rows.map(x=>String(x.id));
      if(!blocked.length)return next();
      const blockedSet=new Set(blocked),json=res.json.bind(res);
      res.json=body=>{if(body?.ok&&Array.isArray(body.posts))body={...body,posts:body.posts.filter(p=>!blockedSet.has(String(p.user_id)))};return json(body)};
      next();
    }catch(e){next(e)}});

    // Direct post/deep-link interactions must obey the same visibility contract as the smart feed.
    // This covers post detail, reactions, legacy likes, saves and all comment/reply operations.
    app.use(async(req,res,next)=>{try{
      const match=req.path.match(/^\/api\/feed\/(\d+)(?:$|\/(?:reactions?|like|save|comments(?:\/preview|\/\d+(?:\/reactions?)?)?))$/);
      if(!match||!["GET","POST","PUT","PATCH","DELETE"].includes(req.method))return next();
      const u=await requireAuth(req,res);if(!u)return;
      const access=await canAccessPost(Number(match[1]),u);
      if(!access.ok)return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});
      next();
    }catch(e){next(e)}});

    app.use((req,res,next)=>{
      if(req.method!=="GET"||!/^\/api\/feed\/\d+\/comments(?:\/preview)?$/.test(req.path))return next();
      const json=res.json.bind(res);
      // Never surface replies whose root comment is absent/soft-deleted. This applies to both
      // the full thread and the two-comment feed preview so an orphan reply cannot appear as a root.
      res.json=body=>{if(body?.ok&&Array.isArray(body.comments))body={...body,comments:body.comments.filter(c=>!c.parent_comment_id)};return json(body)};
      next();
    });
  }
  return prior(app,...args);
};
