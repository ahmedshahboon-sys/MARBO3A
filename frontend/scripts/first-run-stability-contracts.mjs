import fs from "node:fs";
import path from "node:path";
const root=path.resolve(process.cwd()),read=file=>fs.readFileSync(path.join(root,file),"utf8"),must=(src,token,label)=>{if(!src.includes(token))throw new Error(`${label}: missing ${token}`)},reject=(src,token,label)=>{if(src.includes(token))throw new Error(`${label}: forbidden ${token}`)};

const request=read("app/request.js");
for(const t of ["AbortController","REQUEST_TIMEOUT","fetchWithTimeout","fetchJson"])must(request,t,"bounded requests");

const onboarding=read("app/onboarding/page.js");
for(const t of ["fetchJson","/api/onboarding","/api/onboarding/complete","marbo3a_permissions_intro_pending","إعادة المحاولة","استكشف كزائر","8000","12000","t&&t!==\"cookie\""])must(onboarding,t,"self-contained onboarding");
reject(onboarding,"كمّل الخطوات الظاهرة باش تبدأ في مربوعة","onboarding cannot depend on hidden global wizard");
reject(onboarding,'headers:{authorization:`Bearer ${t}`}',"onboarding cannot blindly send cookie sentinel as bearer token");

const gate=read("app/OnboardingGate.js");
for(const t of ["location.replace(\"/onboarding\")","fetchJson","7000","t!==\"cookie\""])must(gate,t,"onboarding gate redirect");
reject(gate,"onboarding-backdrop","onboarding gate must not own a second wizard");

const landing=read("app/page.js");
for(const t of ["fetchJson","6000","REQUEST_TIMEOUT","auth-v1-discover","استكشف مربوعة كزائر","/explore"])must(landing,t,"landing recovery");

const explore=read("app/explore/page.js");
for(const t of ["fetchJson","10000","إعادة المحاولة","REQUEST_TIMEOUT"])must(explore,t,"guest explore recovery");

const platform=read("app/PlatformClient.js");
for(const t of ["isSocialBrowser","FBAN","FB_IAB","نسخ الرابط لفتحه في المتصفح","install-nudge","live-notification-toast","pathname===\"/explore\""])must(platform,t,"social browser and PWA support");

const permissions=read("app/PermissionsCenter.js");
for(const t of ["marbo3a_permissions_intro_pending","FBAN","Chrome أو Safari"])must(permissions,t,"permission handoff");

const sw=read("public/sw.js");
for(const t of ["marbo3a-shell-v17-social-experience","/_next/static/","SHELL.includes(url.pathname)","caches.delete"])must(sw,t,"service worker freshness");

const errorPage=read("app/error.js");
for(const t of ["/api/debug/report","إعادة المحاولة","دخول كزائر","/explore"])must(errorPage,t,"global error recovery");

console.log("First-run C + M + P stability contracts OK");
