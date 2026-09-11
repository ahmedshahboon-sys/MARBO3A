import http from "http";

const prior=http.createServer.bind(http),SESSION_TTL=7*24*60*60;
function cookieToken(req){const c=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("marbo3a_session="));const t=c?decodeURIComponent(c.slice("marbo3a_session=".length)):"";return /^[a-f0-9]{64}$/i.test(t)?t:""}
function setCookie(res,token){if(!/^[a-f0-9]{64}$/i.test(String(token||"")))return;res.setHeader("Set-Cookie",`marbo3a_session=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Lax`)}
http.createServer=function cookieAuthCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    // Browser clients use the HttpOnly cookie. A non-secret localStorage marker is kept only
    // for legacy UI gates; never allow that marker to override the real cookie credential.
    app.use((req,_res,next)=>{const c=cookieToken(req),a=String(req.headers.authorization||"");if(c&&!/^Bearer\s+[a-f0-9]{64}$/i.test(a))req.headers.authorization=`Bearer ${c}`;next()});
    // Registration is still implemented by the legacy core route. Mirror its newly issued
    // session into the HttpOnly cookie without exposing a persistent bearer token to JS.
    app.use((req,res,next)=>{if(req.method!=="POST"||req.path!=="/api/auth/register")return next();const original=res.json.bind(res);res.json=data=>{if(data?.token)setCookie(res,data.token);return original(data)};next()});
  }
  return prior(app,...args);
};
