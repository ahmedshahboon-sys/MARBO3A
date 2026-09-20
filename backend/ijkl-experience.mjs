import http from "http";
import {pool,requireAuth,isAdmin,clean} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const VISIBILITY=new Set(["public","friends","private"]);
const JOIN_POLICY=new Set(["open","request","invite"]);



http.createServer=function ijklExperienceCreateServer(app,...args){
 if(typeof app==="function"&&app?.use){
  app.patch("/api/rooms/:id/settings",async(req,res)=>{try{const u=await requireAuth(req,res);if(!u)return;const id=Number(req.params.id),room=(await pool.query(`SELECT owner_id FROM rooms WHERE id=$1`,[id])).rows[0];if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});if(!isAdmin(u)&&String(room.owner_id)!==String(u.id))return res.status(403).json({ok:false,error:"ROOM_OWNER_ONLY"});const name=clean(req.body?.name,60),description=clean(req.body?.description,180),rules=clean(req.body?.rules,2000),visibility=VISIBILITY.has(req.body?.visibility)?req.body.visibility:"public",joinPolicy=JOIN_POLICY.has(req.body?.joinPolicy)?req.body.joinPolicy:(visibility==="private"?"invite":"open"),max=Math.min(5000,Math.max(2,Number(req.body?.maxMembers)||500));if(name.length<2)return res.status(400).json({ok:false,error:"INVALID_ROOM_NAME"});const row=(await pool.query(`UPDATE rooms SET name=$1,description=$2,rules=$3,visibility=$4,join_policy=$5,max_members=$6,is_public=$7 WHERE id=$8 RETURNING *`,[name,description,rules,visibility,joinPolicy,max,visibility==="public",id])).rows[0];res.json({ok:true,room:row})}catch(e){console.error("I room settings",e);res.status(500).json({ok:false,error:"ROOM_SETTINGS_FAILED"})}});

  app.get("/api/public/rooms",async(_req,res)=>{try{const rows=(await pool.query(`SELECT r.id,r.name,r.slug,r.description,r.image_url,r.created_at,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count FROM rooms r WHERE r.visibility='public' ORDER BY members_count DESC,r.id DESC LIMIT 12`)).rows;res.setHeader("Cache-Control","public,max-age=20,stale-while-revalidate=60");res.json({ok:true,rooms:rows})}catch(e){res.status(500).json({ok:false,error:"PUBLIC_ROOMS_FAILED"})}});
  app.get("/api/public/stats",async(_req,res)=>{try{const [users,posts,rooms]=await Promise.all([pool.query(`SELECT COUNT(*)::int n FROM users WHERE account_status='active'`),pool.query(`SELECT COUNT(*)::int n FROM posts WHERE deleted_at IS NULL`),pool.query(`SELECT COUNT(*)::int n FROM rooms WHERE visibility='public'`)]);res.setHeader("Cache-Control","public,max-age=30,stale-while-revalidate=90");res.json({ok:true,stats:{users:users.rows[0].n,posts:posts.rows[0].n,publicRooms:rooms.rows[0].n}})}catch(e){res.status(500).json({ok:false,error:"PUBLIC_STATS_FAILED"})}});
 }
 return prior(app,...args);
};
