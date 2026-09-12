import http from "http";
const prior=http.createServer.bind(http);
http.createServer=function socialAuthConfigCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.get("/api/auth/oauth/providers",(_req,res)=>res.json({ok:true,providers:{google:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),facebook:Boolean(process.env.FACEBOOK_APP_ID&&process.env.FACEBOOK_APP_SECRET)}}));
  }
  return prior(app,...args)
};
