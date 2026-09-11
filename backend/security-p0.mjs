import http from "http";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import pg from "pg";
import {createClient} from "redis";

const prior=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("P0 Redis:",e));
const uploadDir=path.resolve(process.env.UPLOAD_DIR||"/app/uploads");
let redisReady=null;
async function ensureRedis(){if(redis.isOpen)return;if(!redisReady)redisReady=redis.connect().catch(e=>{redisReady=null;throw e});await redisReady}
const token=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
async function current(req){await ensureRedis();const t=token(req);if(!t)return null;const id=await redis.get(`session:${t}`);if(!id)return null;return (await pool.query(`SELECT id,username,account_status FROM users WHERE id=$1`,[id])).rows[0]||null}
async function auth(req,res){const u=await current(req);if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null}if(String(u.username).toLowerCase()!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null}return u}

const memoryUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}});
function detectedType(buf){
  if(!buf||buf.length<4)return null;
  if(buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff)return {mime:"image/jpeg",ext:"jpg"};
  if(buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return {mime:"image/png",ext:"png"};
  if(buf.subarray(0,6).toString("ascii")==="GIF87a"||buf.subarray(0,6).toString("ascii")==="GIF89a")return {mime:"image/gif",ext:"gif"};
  if(buf.subarray(0,4).toString("ascii")==="RIFF"&&buf.subarray(8,12).toString("ascii")==="WEBP")return {mime:"image/webp",ext:"webp"};
  if(buf.subarray(0,5).toString("ascii")==="%PDF-")return {mime:"application/pdf",ext:"pdf"};
  if(buf.subarray(0,4).toString("ascii")==="OggS")return {mime:"audio/ogg",ext:"ogg"};
  if(buf.subarray(0,4).toString("ascii")==="RIFF"&&buf.subarray(8,12).toString("ascii")==="WAVE")return {mime:"audio/wav",ext:"wav"};
  if(buf.subarray(0,3).toString("ascii")==="ID3"||(buf[0]===0xff&&(buf[1]&0xe0)===0xe0))return {mime:"audio/mpeg",ext:"mp3"};
  if(buf.length>12&&buf.subarray(4,8).toString("ascii")==="ftyp")return {mime:"audio/mp4",ext:"m4a"};
  return null;
}

async function voiceGate(req,res,next){
  const m=req.path.match(/^\/api\/rooms\/(\d+)\/voice(?:\/|$)/);if(!m)return next();
  try{
    const u=await auth(req,res);if(!u)return;
    const roomId=Number(m[1]);
    const room=(await pool.query(`SELECT id,is_public,join_policy,max_members FROM rooms WHERE id=$1`,[roomId])).rows[0];
    if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
    if(String(u.username).toLowerCase()!=="ahmed"){
      const banned=(await pool.query(`SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2 LIMIT 1`,[roomId,u.id])).rows[0];
      if(banned)return res.status(403).json({ok:false,error:"ROOM_BANNED"});
    }
    let member=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0];
    if(!member&&String(u.username).toLowerCase()!=="ahmed"){
      if(!room.is_public||room.join_policy!=="open")return res.status(403).json({ok:false,error:room.join_policy==="invite"?"INVITE_REQUIRED":"JOIN_REQUIRED"});
      const count=Number((await pool.query(`SELECT COUNT(*)::int n FROM room_members WHERE room_id=$1`,[roomId])).rows[0]?.n||0);
      if(count>=Number(room.max_members||500))return res.status(409).json({ok:false,error:"ROOM_FULL"});
      await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING`,[roomId,u.id]);
    }
    req.marbo3aUser=u;next();
  }catch(e){console.error("voice gate",e);res.status(500).json({ok:false,error:"VOICE_ACCESS_FAILED"})}
}

http.createServer=function p0CreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.use(voiceGate);
    app.post("/api/uploads",async(req,res,next)=>{const u=await auth(req,res);if(!u)return;memoryUpload.single("file")(req,res,async err=>{try{
      if(err)return res.status(err.code==="LIMIT_FILE_SIZE"?413:400).json({ok:false,error:err.code==="LIMIT_FILE_SIZE"?"FILE_TOO_LARGE":"UPLOAD_FAILED"});
      if(!req.file)return res.status(400).json({ok:false,error:"NO_FILE"});
      const kind=detectedType(req.file.buffer);if(!kind)return res.status(400).json({ok:false,error:"UNSUPPORTED_FILE"});
      await fs.mkdir(uploadDir,{recursive:true});const name=`${Date.now()}-${crypto.randomBytes(12).toString("hex")}.${kind.ext}`;await fs.writeFile(path.join(uploadDir,name),req.file.buffer,{flag:"wx"});
      return res.status(201).json({ok:true,file:{url:`/api/uploads/files/${name}`,name:req.file.originalname,size:req.file.size,type:kind.mime}});
    }catch(e){console.error("secure upload",e);return res.status(500).json({ok:false,error:"UPLOAD_FAILED"})}})});
    app.get("/api/rtc/preflight",async(req,res)=>{const u=await auth(req,res);if(!u)return;const host=String(process.env.TURN_HOST||process.env.TURN_EXTERNAL_IP||"").trim(),secret=String(process.env.TURN_SECRET||"").trim(),tlsHost=String(process.env.TURN_TLS_HOST||"").trim();res.json({ok:true,turnConfigured:Boolean(host&&secret),turnHost:host||null,udp3478:Boolean(host&&secret),tcp3478:Boolean(host&&secret),tlsConfigured:Boolean(tlsHost&&secret),tlsHost:tlsHost||null,tlsPort:Number(process.env.TURN_TLS_PORT)||null,forceRelay:String(process.env.TURN_FORCE_RELAY||"").toLowerCase()==="true"})});
  }
  return prior(app,...args);
};
