import http from "http";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import {pool,sessionUser,tokenFrom,actionRateLimit,rejectRateLimit,ipOf} from "./runtime.mjs";
import {operationalControls} from "./operational-controls.mjs";

const prior=http.createServer.bind(http);
const allowedOrigin=origin=>!origin||origin==="https://marbo3a.ly"||origin==="https://www.marbo3a.ly"||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
async function maintenanceState(){
  const {settings}=await operationalControls({fresh:true});
  return {
    active:settings.maintenance_mode===true,
    message:typeof settings.maintenance_message==="string"?settings.maintenance_message:"جاري تحديث مربوعة، بنرجعولك خلال دقائق.",
    etaMinutes:Math.max(0,Number(settings.maintenance_eta_minutes)||0),
    startedAt:typeof settings.maintenance_started_at==="string"?settings.maintenance_started_at:null
  };
}

async function verifyTurnstile(token,remoteIp){
  const secret=String(process.env.TURNSTILE_SECRET_KEY||"").trim();
  if(!secret)return{ok:false,error:"TURNSTILE_NOT_CONFIGURED"};
  if(!token)return{ok:false,error:"CAPTCHA_REQUIRED"};
  try{
    const body=new URLSearchParams({secret,response:String(token)});
    if(remoteIp)body.set("remoteip",remoteIp);
    const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
    const data=await response.json().catch(()=>({}));
    return data?.success?{ok:true}:{ok:false,error:"CAPTCHA_INVALID"};
  }catch{return{ok:false,error:"CAPTCHA_UNAVAILABLE"}}
}

const actionPolicyFor=req=>{
  if(req.method!=="POST")return null;
  const p=req.path;
  if(p==="/api/auth/login")return{scope:"admin-login-policy",setting:"login_rate_limit_15m",window:900,identity:"ip",code:"LOGIN_RATE_LIMITED",newAccount:false};
  if(p==="/api/reports")return{scope:"admin-report-policy",setting:"reports_limit_per_hour",window:3600,code:"REPORT_RATE_LIMITED"};
  if(p==="/api/friends/request")return{scope:"admin-friend-request-policy",setting:"friend_requests_limit_per_hour",window:3600,code:"FRIEND_REQUEST_RATE_LIMITED"};
  if(/^\/api\/chats\/\d+\/messages$/.test(p))return{scope:"admin-dm-policy",setting:"dm_limit_per_minute",window:60,code:"DM_RATE_LIMITED"};
  if(["/api/posts","/api/feed/posts","/api/feed"].includes(p))return{scope:"admin-post-policy",setting:"post_limit_per_hour",window:3600,code:"POST_RATE_LIMITED"};
  if(/^\/api\/feed\/\d+\/comments$/.test(p))return{scope:"admin-comment-policy",setting:"comment_limit_per_hour",window:3600,code:"COMMENT_RATE_LIMITED"};
  if(p==="/api/rooms")return{scope:"admin-room-create-policy",setting:"room_create_limit_per_day",window:86400,code:"ROOM_CREATE_RATE_LIMITED"};
  if(/^\/api\/rooms\/\d+\/(?:invite|invites)(?:\/|$)/.test(p))return{scope:"admin-room-invite-policy",setting:"room_invite_limit_per_hour",window:3600,code:"ROOM_INVITE_RATE_LIMITED"};
  if(p==="/api/live")return{scope:"admin-live-create-policy",setting:"live_create_limit_per_hour",window:3600,code:"LIVE_CREATE_RATE_LIMITED"};
  return null;
};

async function enforceActionPolicy(req,res,settings){
  const policy=actionPolicyFor(req);if(!policy)return true;
  let user=null;
  if(policy.identity!=="ip"){
    user=await sessionUser(req).catch(()=>null);
    if(!user)return true;
  }
  const fresh=Boolean(user&&settings.new_account_restrictions_enabled&&Date.now()-new Date(user.created_at).getTime()<24*60*60*1000);
  const configured=Math.max(1,Number(settings[policy.setting])||1),limit=fresh&&policy.newAccount!==false?Math.max(1,Math.floor(configured/2)):configured;
  const identity=policy.identity==="ip"?(ipOf(req)||"unknown"):String(user.id);
  const rate=await actionRateLimit(policy.scope,identity,{limit,windowSeconds:policy.window});
  if(!rate.allowed){rejectRateLimit(res,rate,policy.code);return false}
  return true;
}

async function enforceCaptchaEscalation(req,res,settings){
  if(!settings.captcha_escalation_enabled||req.method!=="POST")return true;
  if(!["/api/auth/login","/api/auth/request-email-otp","/api/auth/request-password-reset"].includes(req.path))return true;
  const identity=ipOf(req)||"unknown",threshold=Math.max(2,Number(settings.captcha_escalation_threshold)||6);
  const signal=await actionRateLimit("captcha-escalation",identity,{limit:threshold,windowSeconds:900});
  if(signal.allowed)return true;
  const token=req.body?.captchaToken||req.headers["x-turnstile-token"];
  const check=await verifyTurnstile(token,identity);
  if(check.ok)return true;
  res.status(check.error==="CAPTCHA_UNAVAILABLE"?503:403).json({ok:false,error:check.error,captchaRequired:true});
  return false;
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

    // This foundation wrapper is registered before every historical route.
    // Security limits must live here; a limiter registered in a later wrapper
    // can be bypassed when an earlier route handler sends the response first.
    app.use("/api/auth",rateLimit({windowMs:15*60*1000,limit:120,standardHeaders:true,legacyHeaders:false}));
    app.use("/api",rateLimit({windowMs:60*1000,limit:600,standardHeaders:true,legacyHeaders:false,skip:req=>["GET","HEAD","OPTIONS"].includes(req.method)}));

    // Location privacy must be normalized before historical profile handlers.
    // Turning precise sharing off removes coordinates instead of retaining them,
    // and precise sharing fails closed when either coordinate is missing or invalid.
    app.use((req,res,next)=>{
      if(req.method!=="PATCH"||req.path!=="/api/profile/extended"||req.body?.city===undefined)return next();
      const share=Boolean(req.body?.sharePrecise);
      if(!share){delete req.body.latitude;delete req.body.longitude;return next()}
      const rawLat=req.body?.latitude,rawLng=req.body?.longitude,provided=v=>v!==undefined&&v!==null&&v!=="",lat=Number(rawLat),lng=Number(rawLng);
      if(!provided(rawLat)||!provided(rawLng)||!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lng)||lng<-180||lng>180)return res.status(400).json({ok:false,error:"INVALID_PRECISE_LOCATION"});
      next();
    });

    // Legacy OAuth linking has its own current-user helper. Validate any supplied
    // MARBO3A session through the runtime first so expired durable sessions cannot
    // survive only because a stale Redis key is still present.
    app.use("/api/auth/oauth",async(req,res,next)=>{
      if(!tokenFrom(req))return next();
      try{await sessionUser(req);next()}catch(e){console.error("oauth session validation",e);res.status(503).json({ok:false,error:"SESSION_VALIDATION_FAILED"})}
    });

    app.use((_req,res,next)=>{
      res.setHeader("Content-Security-Policy","default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https: wss:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:");
      res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
      res.setHeader("Permissions-Policy","camera=(self), microphone=(self), geolocation=(self)");
      res.setHeader("X-Content-Type-Options","nosniff");
      next();
    });

    // Public, no-cache deployment state used by already-open clients and the
    // standalone maintenance gate. It stays readable while maintenance is active.
    app.get("/api/system/maintenance",async(_req,res)=>{
      res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
      res.setHeader("Pragma","no-cache");
      res.json({ok:true,...await maintenanceState()});
    });

    // Operational controls live here because this wrapper is registered before
    // compatibility routes. Health, maintenance-state and admin routes remain
    // reachable during an automatic deploy maintenance window.
    app.use(async(req,res,next)=>{
      if(!req.path?.startsWith("/api/")||req.path==="/api/health"||req.path==="/health"||req.path==="/api/system/maintenance")return next();
      try{
        const {settings,features}=await operationalControls();
        if(settings.maintenance_mode===true&&!req.path.startsWith("/api/admin/"))return res.status(503).json({ok:false,error:"MAINTENANCE_MODE",maintenance:true,message:settings.maintenance_message||"",etaMinutes:Number(settings.maintenance_eta_minutes)||0});
        if(req.path.startsWith("/api/admin/"))return next();
        const registrationBlocked=settings.registration_enabled===false&&req.method==="POST"&&["/api/auth/request-email-otp","/api/auth/verify-email-otp","/api/auth/register"].includes(req.path);
        if(registrationBlocked)return res.status(503).json({ok:false,error:"REGISTRATION_DISABLED"});
        if(settings.rooms_enabled===false&&req.path.startsWith("/api/rooms"))return res.status(503).json({ok:false,error:"ROOMS_DISABLED"});
        if(features.engagement===false&&req.path.startsWith("/api/engagement"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"engagement"});
        const mapProfileWrite=req.method==="PATCH"&&req.path==="/api/profile/extended"&&req.body?.city!==undefined;
        if(features.map===false&&(req.path.startsWith("/api/map")||req.path==="/api/location"||req.path==="/api/profile/location"||mapProfileWrite))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"map"});
        if(features.calls===false&&req.path.startsWith("/api/calls"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"calls"});
        if(features.live===false&&req.path.startsWith("/api/live"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"live"});
        if(features.voice_rooms===false&&/^\/api\/rooms\/\d+\/voice(?:\/|$)/.test(req.path))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"voice_rooms"});
        if(features.push===false&&req.path.startsWith("/api/push"))return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"push"});
        if(features.guest_explore===false&&req.path.startsWith("/api/public/")&&req.path!=="/api/public/ui-settings")return res.status(503).json({ok:false,error:"FEATURE_DISABLED",feature:"guest_explore"});
        if(req.method==="POST"&&req.path.startsWith("/api/uploads")){
          const family=req.path==="/api/uploads/video"?"video":null;
          const configured=family==="video"?settings.upload_max_video_mb:Math.max(Number(settings.upload_max_image_mb)||1,Number(settings.upload_max_audio_mb)||1,Number(settings.upload_max_video_mb)||1);
          const maxMb=Math.max(1,Math.min(8,Number(settings.upload_max_mb)||8,Number(configured)||8)),contentLength=Number(req.headers["content-length"]||0);
          if(contentLength>maxMb*1024*1024+128*1024)return res.status(413).json({ok:false,error:"FILE_TOO_LARGE",maxMb});
        }
        if(req.method==="POST"&&req.path.startsWith("/api/profile/pin-post/")&&Number(settings.pinned_post_limit)===0)return res.status(409).json({ok:false,error:"PINNING_DISABLED"});
        if(!await enforceCaptchaEscalation(req,res,settings))return;
        if(!await enforceActionPolicy(req,res,settings))return;
      }catch(e){
        console.error("operational control gate",e?.message||e);
        if(actionPolicyFor(req))return res.status(503).json({ok:false,error:"OPERATIONAL_CONTROL_UNAVAILABLE"});
      }
      next();
    });
  }
  return prior(app,...args);
};
