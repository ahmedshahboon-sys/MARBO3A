import http from "http";
import express from "express";
import cors from "cors";

const prior=http.createServer.bind(http);
const allowedOrigin=origin=>!origin||origin==="https://marbo3a.ly"||origin==="https://www.marbo3a.ly"||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

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
  }
  return prior(app,...args);
};
