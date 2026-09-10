import http from "http";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import pg from "pg";
import { createClient } from "redis";

const prior=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("MediaSocial Redis:",e));
const uploadDir=path.resolve(process.env.UPLOAD_DIR||"/app/uploads");
fs.mkdirSync(uploadDir,{recursive:true});
const allowed=new Set(["image/jpeg","image/png","image/webp","image/gif","audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/x-wav","audio/aac","application/pdf"]);
const storage=multer.diskStorage({destination:(_req,_file,cb)=>cb(null,uploadDir),filename:(_req,file,cb)=>{const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/webm":"webm","audio/wav":"wav","audio/x-wav":"wav","audio/aac":"aac","application/pdf":"pdf"}[file.mimetype]||"bin";cb(null,`${Date.now()}-${crypto.randomBytes(10).toString("hex")}.${ext}`)}});
const upload=multer({storage,limits:{fileSize:8*1024*1024,files:1},fileFilter:(_req,file,cb)=>allowed.has(file.mimetype)?cb(null,true):cb(new Error("UNSUPPORTED_FILE"))});
const tok=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
async function current(req){if(!redis.isOpen)await redis.connect();const t=tok(req);if(!t)return null;const id=await redis.get(`session:${t}`);if(!id)return null;return (await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`,[id])).rows[0]||null}
async function auth(req,res){const u=await current(req);if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null}if(u.username!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null}return u}
const cityCoords={"طرابلس":[32.8872,13.1913],"tripoli":[32.8872,13.1913],"بنغازي":[32.1167,20.0667],"benghazi":[32.1167,20.0667],"مصراتة":[32.3754,15.0925],"misrata":[32.3754,15.0925],"الزاوية":[32.7522,12.7278],"zawiya":[32.7522,12.7278],"سبها":[27.0377,14.4283],"sebha":[27.0377,14.4283],"الخمس":[32.6486,14.2619],"khoms":[32.6486,14.2619],"ترهونة":[32.4350,13.6332],"tarhuna":[32.4350,13.6332],"درنة":[32.7670,22.6367],"derna":[32.7670,22.6367],"طبرق":[32.0836,23.9764],"tobruk":[32.0836,23.9764]};
function approxPoint(userId,city){const base=cityCoords[String(city||"").trim().toLowerCase()];if(!base)return null;const h=crypto.createHash("sha256").update(String(userId)).digest();const a=(h[0]/255-.5)*.16,b=(h[1]/255-.5)*.16;return {latitude:base[0]+a,longitude:base[1]+b,precision:"city"}}

http.createServer=function(app,...args){if(typeof app==="function"&&app?.use){
  app.use("/uploads",express.static(uploadDir,{immutable:true,maxAge:"30d",fallthrough:true}));
  app.use("/api/uploads/files",express.static(uploadDir,{immutable:true,maxAge:"30d",fallthrough:true}));
  app.post("/api/uploads",async(req,res)=>{const u=await auth(req,res);if(!u)return;upload.single("file")(req,res,err=>{if(err){const code=err.code==="LIMIT_FILE_SIZE"?"FILE_TOO_LARGE":err.message==="UNSUPPORTED_FILE"?"UNSUPPORTED_FILE":"UPLOAD_FAILED";return res.status(code==="FILE_TOO_LARGE"?413:400).json({ok:false,error:code})}if(!req.file)return res.status(400).json({ok:false,error:"NO_FILE"});return res.status(201).json({ok:true,file:{url:`/api/uploads/files/${req.file.filename}`,name:req.file.originalname,size:req.file.size,type:req.file.mimetype}})});});
  app.get("/api/map/people",async(req,res)=>{try{const viewer=await auth(req,res);if(!viewer)return;const rows=(await pool.query(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.last_seen_at,l.city,l.latitude,l.longitude,l.share_precise,COALESCE(p.show_city,TRUE) show_city FROM users u JOIN user_locations l ON l.user_id=u.id LEFT JOIN profile_privacy p ON p.user_id=u.id WHERE u.account_status='active' AND COALESCE(p.show_city,TRUE)=TRUE AND l.city<>'' ORDER BY u.id DESC LIMIT 500`)).rows;const users=[];for(const row of rows){let point=null;if(row.share_precise&&Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude)))point={latitude:Number(row.latitude),longitude:Number(row.longitude),precision:"precise"};else point=approxPoint(row.id,row.city);if(!point)continue;const online=Boolean(await redis.zScore("presence:users",String(row.id)).then(s=>s&&Number(s)>Date.now()-120000).catch(()=>false));users.push({id:row.id,username:row.username,display_name:row.display_name,avatar_url:row.avatar_url,city:row.city,online,last_seen_at:row.last_seen_at,...point})}res.json({ok:true,users,viewerId:viewer.id})}catch(e){console.error("map people",e);res.status(500).json({ok:false,error:"MAP_LOAD_FAILED"})}});
}
return prior(app,...args)};
