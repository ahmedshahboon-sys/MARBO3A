import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import {requireAuth} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const uploadsDir="/app/uploads";
fs.mkdirSync(uploadsDir,{recursive:true});
const extByMime={"video/mp4":".mp4","video/webm":".webm","video/quicktime":".mov"};
const uploadVideo=multer({
  storage:multer.diskStorage({
    destination:uploadsDir,
    filename:(_req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extByMime[file.mimetype]||path.extname(file.originalname).toLowerCase()||".mp4"}`)
  }),
  limits:{fileSize:12*1024*1024,files:1},
  fileFilter:(_req,file,cb)=>{const ok=Boolean(extByMime[file.mimetype]);cb(ok?null:new Error("UNSUPPORTED_FILE"),ok)}
});

function receive(req,res){
  uploadVideo.single("file")(req,res,err=>{
    if(err){
      const code=err?.code==="LIMIT_FILE_SIZE"?"FILE_TOO_LARGE":err?.message==="UNSUPPORTED_FILE"?"UNSUPPORTED_FILE":"UPLOAD_FAILED";
      return res.status(code==="FILE_TOO_LARGE"?413:400).json({ok:false,error:code});
    }
    if(!req.file)return res.status(400).json({ok:false,error:"FILE_REQUIRED"});
    res.status(201).json({ok:true,file:{url:`/api/uploads/${req.file.filename}`,type:req.file.mimetype,size:req.file.size,name:req.file.originalname}});
  });
}

http.createServer=function postMediaCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.post("/api/uploads/video",async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;receive(req,res)});
  }
  return prior(app,...args);
};
