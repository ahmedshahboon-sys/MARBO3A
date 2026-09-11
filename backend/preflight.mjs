import http from "http";
import express from "express";
import crypto from "crypto";
import {pool,redis,ensureRedis,tokenFrom} from "./runtime.mjs";

/*
 * MARBO3A extension modules register routes from patched http.createServer().
 * This compatibility layer installs body parsers and restores durable sessions
 * before the legacy server handles authenticated API traffic.
 */
const previous=http.createServer.bind(http);
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");

http.createServer=function preflightCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.disable?.("x-powered-by");
    app.set?.("trust proxy",1);
    app.use(express.json({limit:"1mb"}));
    app.use(express.urlencoded({extended:false,limit:"128kb"}));

    // Redis is the fast session store, while durable_sessions survives Redis/container restarts.
    // Restore the Redis mapping when possible; authentication modules still make the final decision.
    app.use("/api",async(req,_res,next)=>{
      const t=tokenFrom(req);if(!t)return next();
      try{
        await ensureRedis();
        const key=`session:${t}`;
        if(await redis.get(key))return next();
        const row=(await pool.query(`SELECT user_id,expires_at FROM durable_sessions WHERE token_hash=$1 AND expires_at>NOW() LIMIT 1`,[tokenHash(t)])).rows[0];
        if(row?.user_id){
          const ttl=Math.max(60,Math.min(7*24*60*60,Math.floor((new Date(row.expires_at).getTime()-Date.now())/1000)));
          await redis.set(key,String(row.user_id),{EX:ttl});
        }
      }catch(e){
        if(process.env.NODE_ENV!=="test")console.error("session recovery",e?.message||e);
      }
      next();
    });
  }
  return previous(app,...args);
};
