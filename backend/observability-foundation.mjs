import http from "http";
import crypto from "crypto";
import {pool,clean,ipOf} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const SLOW_MS=Math.max(250,Number(process.env.SLOW_REQUEST_MS)||1200);
const SAMPLE_RATE=Math.max(0,Math.min(1,Number(process.env.REQUEST_LOG_SAMPLE_RATE)||0.02));
const SKIP=new Set(["/api/health","/health"]);
const routePath=req=>clean(String(req.route?.path||req.path||req.originalUrl||"/").split("?")[0],180);
const requestId=req=>{const supplied=String(req.headers["x-request-id"]||"").trim();return /^[a-zA-Z0-9._:-]{8,80}$/.test(supplied)?supplied:crypto.randomUUID()};
function shouldPersist(status,duration){return status>=500||duration>=SLOW_MS||Math.random()<SAMPLE_RATE}

http.createServer=function observabilityFoundationCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.use((req,res,next)=>{
      if(!req.path?.startsWith("/api/")||SKIP.has(req.path))return next();
      const started=process.hrtime.bigint(),rid=requestId(req);res.setHeader("X-Request-Id",rid);
      res.once("finish",()=>{
        const durationMs=Math.max(0,Number(process.hrtime.bigint()-started)/1e6),status=Number(res.statusCode||0);
        if(!shouldPersist(status,durationMs))return;
        const level=status>=500?"ERROR":durationMs>=SLOW_MS?"WARN":"INFO",category=status>=500?"HTTP_ERROR":durationMs>=SLOW_MS?"SLOW_REQUEST":"HTTP_SAMPLE";
        const details={requestId:rid,method:req.method,durationMs:Math.round(durationMs),contentLength:Number(res.getHeader("content-length")||0)||null,userAgent:clean(req.headers["user-agent"],180)};
        pool.query(`INSERT INTO operation_logs(user_id,level,category,action,status_code,path,ip_address,meta) VALUES(NULL,$1,$2,$3,$4,$5,$6,$7::jsonb)`,[level,category,`${req.method} ${routePath(req)}`,status,routePath(req),ipOf(req),JSON.stringify(details)]).catch(e=>{if(process.env.NODE_ENV!=="test")console.error("request observability",e?.message||e)});
      });
      next();
    });
  }
  return prior(app,...args);
};
