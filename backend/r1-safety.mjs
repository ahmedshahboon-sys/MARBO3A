import http from "http";
import {pool,requireAuth} from "./runtime.mjs";
const prior=http.createServer.bind(http);

http.createServer=function r1SafetyServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.use(async(req,res,next)=>{try{
      if(req.method!=="GET"||req.path!=="/api/feed")return next();
      const u=await requireAuth(req,res);if(!u)return;
      const blocked=(await pool.query(`SELECT CASE WHEN blocker_id=$1 THEN blocked_id ELSE blocker_id END id FROM user_blocks WHERE blocker_id=$1 OR blocked_id=$1`,[u.id])).rows.map(x=>String(x.id));
      if(!blocked.length)return next();
      const blockedSet=new Set(blocked),json=res.json.bind(res);
      res.json=body=>{if(body?.ok&&Array.isArray(body.posts))body={...body,posts:body.posts.filter(p=>!blockedSet.has(String(p.user_id)))};return json(body)};
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
