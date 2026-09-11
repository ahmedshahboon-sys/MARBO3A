import http from "http";
import express from "express";
import path from "path";
import fs from "fs";

const prior=http.createServer.bind(http);
const uploadDir=path.resolve(process.env.UPLOAD_DIR||"/app/uploads");
fs.mkdirSync(uploadDir,{recursive:true});

// Compatibility layer for URLs produced by older clients. Upload validation and
// the map API are authoritative in security-p0.mjs; do not duplicate them here.
http.createServer=function mediaSocialCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.use("/uploads",express.static(uploadDir,{immutable:true,maxAge:"30d",fallthrough:true,index:false}));
    app.use("/api/uploads/files",express.static(uploadDir,{immutable:true,maxAge:"30d",fallthrough:true,index:false}));
  }
  return prior(app,...args);
};
