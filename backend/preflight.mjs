import http from "http";
import express from "express";

/*
 * MARBO3A extension modules register routes from patched http.createServer().
 * server.mjs installs its JSON parser only after createServer() returns, so
 * extension POST/PATCH handlers used to receive req.body as undefined.
 * This outermost wrapper installs parsers before every extension route.
 *
 * Production is served through one local Nginx reverse proxy which forwards
 * X-Forwarded-For. Trust exactly that single proxy hop so Express and
 * express-rate-limit resolve the real client IP without treating arbitrary
 * forwarded headers as authoritative.
 */
const previous=http.createServer.bind(http);

http.createServer=function preflightCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.disable?.("x-powered-by");
    app.set?.("trust proxy",1);
    app.use(express.json({limit:"1mb"}));
    app.use(express.urlencoded({extended:false,limit:"128kb"}));
  }
  return previous(app,...args);
};
