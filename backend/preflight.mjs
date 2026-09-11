import http from "http";
import express from "express";
import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

/*
 * MARBO3A extension modules register routes from patched http.createServer().
 * This module is intentionally imported LAST so it is the outermost wrapper:
 * parsers and session recovery are registered before every extension route.
 */
const previous=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("Preflight Redis:",e));
let redisReady;
const bearer=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
async function ensureRedis(){if(redis.isOpen)return;if(!redisReady)redisReady=redis.connect().catch(e=>{redisReady=null;throw e});await redisReady}

http.createServer=function preflightCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.disable?.("x-powered-by");
    app.set?.("trust proxy",1);
    app.use(express.json({limit:"1mb"}));
    app.use(express.urlencoded({extended:false,limit:"128kb"}));

    // Redis is the fast session store, while durable_sessions survives Redis/container restarts.
    // Recover the Redis mapping before feature modules authenticate the request so a valid
    // logged-in browser never gets a false 401 merely because Redis restarted.
    app.use("/api",async(req,_res,next)=>{
      const t=bearer(req);if(!t)return next();
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
        // Authentication modules still make the final decision; recovery must never take the API down.
        if(process.env.NODE_ENV!=="test")console.error("session recovery",e?.message||e);
      }
      next();
    });
  }
  return previous(app,...args);
};
