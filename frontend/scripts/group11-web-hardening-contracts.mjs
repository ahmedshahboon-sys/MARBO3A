import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const proxy=read("proxy.js"),page=read("app/page.js"),onboarding=read("app/onboarding/page.js"),maintenance=read("app/MaintenanceRuntime.js");
const must=(src,t,label)=>{if(!src.includes(t))throw new Error(label+": missing "+t)};
for(const t of ["Content-Security-Policy","nonce-\${nonce}","strict-dynamic","Strict-Transport-Security","Cross-Origin-Opener-Policy","frame-ancestors 'none'"])must(proxy,t,"web proxy");
const scriptLine=proxy.split("\n").find(x=>x.includes("script-src"))||"";
if(scriptLine.includes("unsafe-inline"))throw new Error("web script-src must not contain unsafe-inline");
must(proxy,"style-src 'self' 'unsafe-inline'","temporary style compatibility");
for(const [src,label] of [[page,"auth next"],[onboarding,"onboarding next"],[maintenance,"maintenance return"]]){
  must(src,"https://marbo3a.invalid",label);
  must(src,'decoded.startsWith("//")',label);
  must(src,'decoded.includes("\\\\")',label);
}
console.log("Group 11 frontend web-hardening contracts OK");
