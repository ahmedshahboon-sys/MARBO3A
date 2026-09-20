import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import {requireAuth} from "./runtime.mjs";
import {operationalControls} from "./operational-controls.mjs";

const prior=http.createServer.bind(http);
const uploadsDir=path.resolve(process.env.UPLOAD_DIR||"/app/uploads");
fs.mkdirSync(uploadsDir,{recursive:true});
const extByMime={"video/mp4":".mp4","video/webm":".webm","video/quicktime":".mov"};
const uploadVideo=multer({
  storage:multer.diskStorage({
    destination:uploadsDir,
    filename:(_req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extByMime[file.mimetype]||".mp4"}`)
  }),
  limits:{fileSize:12*1024*1024,files:1},
  fileFilter:(_req,file,cb)=>{const ok=Boolean(extByMime[file.mimetype]);cb(ok?null:new Error("UNSUPPORTED_FILE"),ok)}
});

function validVideoSignature(filePath,mime){
  const fd=fs.openSync(filePath,"r");
  try{
    const head=Buffer.alloc(16),read=fs.readSync(fd,head,0,head.length,0);if(read<12)return false;
    if(mime==="video/webm")return head[0]===0x1a&&head[1]===0x45&&head[2]===0xdf&&head[3]===0xa3;
    return head.subarray(4,8).toString("ascii")==="ftyp";
  }finally{fs.closeSync(fd)}
}
function discard(file){try{if(file?.path)fs.unlinkSync(file.path)}catch{}}

function receive(req,res){
  uploadVideo.single("file")(req,res,async err=>{
    if(err){
      const code=err?.code==="LIMIT_FILE_SIZE"?"FILE_TOO_LARGE":err?.message==="UNSUPPORTED_FILE"?"UNSUPPORTED_FILE":"UPLOAD_FAILED";
      return res.status(code==="FILE_TOO_LARGE"?413:400).json({ok:false,error:code});
    }
    if(!req.file)return res.status(400).json({ok:false,error:"FILE_REQUIRED"});
    try{if(!validVideoSignature(req.file.path,req.file.mimetype)){discard(req.file);return res.status(400).json({ok:false,error:"UNSUPPORTED_FILE"})}}catch(e){discard(req.file);console.error("video signature validation",e);return res.status(500).json({ok:false,error:"UPLOAD_FAILED"})}
    const {settings}=await operationalControls(),allowed=Array.isArray(settings.allowed_media_types)?settings.allowed_media_types:[];
    if(!allowed.includes(req.file.mimetype)){discard(req.file);return res.status(415).json({ok:false,error:"MEDIA_TYPE_DISABLED",receivedType:req.file.mimetype})}
    const maxMb=Math.max(1,Math.min(8,Number(settings.upload_max_mb)||8,Number(settings.upload_max_video_mb)||8));
    if(Number(req.file.size)>maxMb*1024*1024){discard(req.file);return res.status(413).json({ok:false,error:"FILE_TOO_LARGE",maxMb,mediaFamily:"video"})}
    res.status(201).json({ok:true,file:{url:`/api/uploads/${req.file.filename}`,type:req.file.mimetype,size:req.file.size,name:req.file.originalname}});
  });
}

http.createServer=function postMediaCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.post("/api/uploads/video",async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;receive(req,res)});
  }
  return prior(app,...args);
};
