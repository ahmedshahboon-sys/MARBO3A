import http from "http";
import express from "express";
import cors from "cors";
import {pool} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const allowedOrigin=origin=>!origin||origin==="https://marbo3a.ly"||origin==="https://www.marbo3a.ly"||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
let controlCache={at:0,settings:{},features:{}};
async function operationalControls(){
  if(Date.now()-controlCache.at<5000)return controlCache;
  try{
    const[settings,features]=await Promise.all([
      pool.query(`SELECT key,value FROM admin_system_settings`),
      pool.query(`SELECT key,enabled FROM feature_flags`)
    ]);
    controlCache={at:Date.now(),settings:Object.fromEntries(settings.rows.map(x=>[x.key,x.value])),features:Object.fromEntries(features.rows.map(x=>[x.key,Boolean(x.enabled)]))};
  }catch{controlCache={at:Date.now(),settings:{},features:{}}}
  return controlCache;
}

http.createServer=function requestFoundationCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.disable?.("x-powered-by");
    app.set?.("trust proxy",1);

    // Authoritative request parsing. This module is intentionally imported last
    // so this middleware is registered before every compatibility route wrapper.
    app.use(express.json({limit:"1mb"}));
    app.use(express.urlencoded({extended:false,limit:"128kb"}));

    app.use((req,res,next)=>{
      const origin=String(req.headers.origin||"");
      if(!allowedOrigin(origin))return res.status(403).json({ok:false,error:"ORIGIN_NOT_ALLOWED"});
      next();
    });
    app.use(cors({origin:(origin,cb)=>cb(null,allowedOrigin(origin)),credentials:true,methods:["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"],allowedHeaders:["Content-Type","Authorization","X-Requested-With"]}));

    app.use((_req,res,next)=>{
      res.setHeader("Content-Security-Policy","default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:");
      res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
      res.setHeader("Permissions-Policy","camera=(self), microphone=(self), geolocation=(self)");
      res.setHeader("X-Content-Type-Options","nosniff");
      next();
    });

    // Group O operational controls live here because this wrapper is registered
    // before compatibility routes. Fail open only when the control tables are not
    // available during a bootstrap/migration window; health and admin routes stay reachable.
    app.use(async(req,res,next)=>{
      if(!req.path?.startsWith("/api/")||req.path==="/api/health"||req.path==="/health")return next();
      try{
        const {settings,features}=await operationalControls();
        // Keep the current memory-upload pipeline's established 8 MB hard ceiling.
        if(req.method==="PATCH"&&req.path==="/api/admin/advanced/settings"&&req.body?.key==="upload_max_mb"&&Number(req.body?.value)>8)return res.status(400).json({ok:false,error:"UPLOAD_LIMIT_MAX_8MB"});
        if(req.path.startsWith("/api/admin/"))return next();
        const registrationBlocked=settings.registration_enabled===false&&req.method==="POST"&&["/api/auth/request-email-otp","/api/auth/verify-email-otp","/api/auth/register"].includes(req.path);
        if(registrationBlocked)return res.status(503).json({ok:false,error:"REGISTRATION_DISABLED"});
        if(settings.rooms_enabled===false&&req.path.startsWith("/api/rooms"))return res.status(503).json({ok:false,error:"ROOMS_DISABLED"});
        if(req.method==="POST"&&req.path==="/api/uploads"){
          const maxMb=Math.max(1,Math.min(8,Number(settings.upload_max_mb)||8)),contentLength=Number(req.headers["content-length"]||0);
          if(contentLength>maxMb*1024*1024+128*1024)return res.status(413).json({ok:false,error:"FILE_TOO_LARGE",maxMb});
        }
        if(req.method==="POST"&&req.path.startsWith("/api/profile/pin-post/")&&Number(settings.pinned_post_limit)===0)return res.status(409).json({ok:false,error:"PINNING_DISABLED"});
        if(features.engagement===false&&req.path.startsWith("/api/engagement"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"engagement"});
        if(features.map===false&&req.path.startsWith("/api/map"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"map"});
        if(features.calls===false&&req.path.startsWith("/api/calls"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"calls"});
        if(features.voice_rooms===false&&/^\/api\/rooms\/\d+\/voice(?:\/|$)/.test(req.path))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"voice_rooms"});
        if(features.guest_explore===false&&req.path.startsWith("/api/public/"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"guest_explore"});
      }catch{}
      next();
    });
  }
  return prior(app,...args);
};
