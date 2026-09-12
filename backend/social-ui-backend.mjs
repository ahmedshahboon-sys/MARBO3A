import http from "http";
import {pool,clean} from "./runtime.mjs";

const prior=http.createServer.bind(http);
http.createServer=function(app,...args){if(typeof app==="function"&&app?.use){
  // Public share/deep-link profile. Authenticated social profiles are served by feed-extensions.mjs.
  app.get("/api/public/profile/:username",async(req,res)=>{try{const uname=clean(req.params.username,24).toLowerCase();const p=(await pool.query(`SELECT u.id,u.username,u.display_name,u.bio,u.avatar_url,u.cover_url,u.created_at,l.city,COALESCE(pp.show_city,TRUE) show_city,(SELECT COUNT(*)::int FROM friendships f WHERE f.status='accepted' AND (f.requester_id=u.id OR f.addressee_id=u.id)) friends_count,(SELECT COUNT(*)::int FROM posts po WHERE po.user_id=u.id AND po.deleted_at IS NULL) posts_count,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.user_id=u.id) rooms_count FROM users u LEFT JOIN user_locations l ON l.user_id=u.id LEFT JOIN profile_privacy pp ON pp.user_id=u.id WHERE LOWER(u.username)=$1 AND u.account_status='active'`,[uname])).rows[0];if(!p)return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});res.json({ok:true,user:{...p,city:p.show_city?p.city:null}})}catch(e){console.error("public profile",e);res.status(500).json({ok:false,error:"PROFILE_LOAD_FAILED"})}});
}
return prior(app,...args)};
