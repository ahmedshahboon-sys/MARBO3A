import http from "http";
import {pool,requireAuth,clean} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const USERNAME_RE=/^[a-z0-9._]{3,24}$/;

http.createServer=function stageOneExperienceServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.get("/api/users/username-available",async(req,res)=>{
      try{
        const username=clean(req.query.username,24).trim().toLowerCase();
        if(!USERNAME_RE.test(username))return res.json({ok:true,username,valid:false,available:false});
        const exists=Boolean((await pool.query(`SELECT 1 FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1`,[username])).rows[0]);
        res.json({ok:true,username,valid:true,available:!exists});
      }catch(e){console.error("username availability",e);res.status(500).json({ok:false,error:"USERNAME_CHECK_FAILED"})}
    });

    app.get("/api/presence/users",async(req,res)=>{
      try{
        const viewer=await requireAuth(req,res);if(!viewer)return;
        const ids=String(req.query.ids||"").split(",").map(Number).filter(Number.isInteger).filter(x=>x>0).slice(0,100);
        if(!ids.length)return res.json({ok:true,users:[]});
        const rows=(await pool.query(`SELECT u.id,u.last_seen_at,COALESCE(p.show_last_seen,TRUE) show_last_seen FROM users u LEFT JOIN profile_privacy p ON p.user_id=u.id WHERE u.id=ANY($1::bigint[])`,[ids])).rows;
        const {redis,ensureRedis}=await import("./runtime.mjs");await ensureRedis().catch(()=>{});const cutoff=Date.now()-90000;let scores=[];try{scores=await redis.zRangeWithScores("presence:users",0,-1)}catch{}const online=new Set(scores.filter(x=>Number(x.score)>cutoff).map(x=>String(x.value)));
        res.json({ok:true,users:rows.map(row=>({id:row.id,online:Boolean(row.show_last_seen)&&online.has(String(row.id)),last_seen_at:row.show_last_seen?row.last_seen_at:null}))});
      }catch(e){console.error("presence batch",e);res.status(500).json({ok:false,error:"PRESENCE_LOAD_FAILED"})}
    });
  }
  return prior(app,...args);
};
