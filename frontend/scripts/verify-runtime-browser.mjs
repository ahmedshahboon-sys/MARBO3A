import {spawn,spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {setTimeout as sleep} from "node:timers/promises";

const origin="http://127.0.0.1:3100";
const chromePort=9223;
const routes=["/","/explore","/about","/privacy","/terms"];
const viewports=[[320,568],[390,844],[1366,768]];
const failures=[];
const notes=[];
const fail=m=>{failures.push(m);console.error("RUNTIME_BROWSER_FAILED: "+m)};
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(bin=>spawnSync("bash",["-lc",`command -v ${bin}`],{encoding:"utf8"}).status===0);
if(!chrome){console.error("RUNTIME_BROWSER_FAILED: Chrome/Chromium not found");process.exit(1)}

async function waitHttp(url,tries=80){
  for(let i=0;i<tries;i++){
    try{const r=await fetch(url,{redirect:"manual"});if(r.status<500)return r}catch{}
    await sleep(250);
  }
  throw new Error("timeout waiting for "+url);
}
function child(name,args,opts={}){
  const p=spawn(name,args,{stdio:["ignore","pipe","pipe"],...opts});
  let out="",err="";
  p.stdout?.on("data",d=>out+=d);p.stderr?.on("data",d=>err+=d);
  p._logs=()=>({out,err});
  return p;
}

const next=child("npm",["start","--","-p","3100"],{env:{...process.env,NEXT_TELEMETRY_DISABLED:"1"}});
const userDir=fs.mkdtempSync(path.join(os.tmpdir(),"marbo3a-chrome-"));
let browser;
try{
  await waitHttp(origin+"/");
  browser=child(chrome,[
    "--headless=new","--no-sandbox","--disable-gpu","--no-first-run",
    `--remote-debugging-port=${chromePort}`,`--user-data-dir=${userDir}`,"about:blank"
  ]);
  await waitHttp(`http://127.0.0.1:${chromePort}/json/version`);

  async function newTarget(){
    const r=await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`,{method:"PUT"});
    if(!r.ok)throw new Error("cannot create Chrome target "+r.status);
    return r.json();
  }
  class CDP{
    constructor(url){this.url=url;this.id=0;this.pending=new Map();this.handlers=new Map()}
    async open(){
      this.ws=new WebSocket(this.url);
      await new Promise((resolve,reject)=>{this.ws.addEventListener("open",resolve,{once:true});this.ws.addEventListener("error",reject,{once:true})});
      this.ws.addEventListener("message",e=>{
        const m=JSON.parse(String(e.data));
        if(m.id&&this.pending.has(m.id)){const {resolve,reject}=this.pending.get(m.id);this.pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result);return}
        for(const fn of this.handlers.get(m.method)||[])fn(m.params||{});
      });
    }
    send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}))})}
    on(method,fn){const a=this.handlers.get(method)||[];a.push(fn);this.handlers.set(method,a)}
    close(){try{this.ws.close()}catch{}}
  }

  const target=await newTarget();
  const cdp=new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  await Promise.all([
    cdp.send("Page.enable"),cdp.send("Runtime.enable"),cdp.send("Network.enable"),cdp.send("Log.enable")
  ]);

  let current={route:"",mode:"browser",width:0,height:0,exceptions:[],consoleErrors:[],network:[]};
  cdp.on("Runtime.exceptionThrown",p=>current.exceptions.push(p.exceptionDetails?.text||p.exceptionDetails?.exception?.description||"runtime exception"));
  cdp.on("Runtime.consoleAPICalled",p=>{
    if(p.type!=="error"&&p.type!=="warning")return;
    const text=(p.args||[]).map(a=>a.value??a.description??"").join(" ");
    if(/Failed to load resource/i.test(text))return;
    if(/hydration|uncaught|unhandled|exception|error/i.test(text))current.consoleErrors.push(text);
  });
  cdp.on("Log.entryAdded",p=>{
    const e=p.entry||{};
    if(!["error","warning"].includes(e.level))return;
    if(/Failed to load resource/i.test(e.text||""))return;
    if(/hydration|uncaught|unhandled|exception|error/i.test(e.text||""))current.consoleErrors.push(e.text||"log error");
  });
  cdp.on("Network.responseReceived",p=>{
    const u=p.response?.url||"",status=Number(p.response?.status||0);
    if(!u.startsWith(origin)||u.startsWith(origin+"/api/"))return;
    if(status>=400)current.network.push(`${status} ${u.slice(origin.length)}`);
  });
  cdp.on("Network.loadingFailed",p=>{
    const u=p.url||"";
    if(u.startsWith(origin)&&!u.startsWith(origin+"/api/")&&!p.canceled)current.network.push(`failed ${u.slice(origin.length)} ${p.errorText||""}`);
  });

  const standaloneBootstrap=`(()=>{const native=window.matchMedia.bind(window);window.matchMedia=q=>{if(q==="(display-mode: standalone)")return {matches:true,media:q,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true}};return native(q)};try{Object.defineProperty(navigator,"standalone",{configurable:true,get:()=>true})}catch{}})();`;

  async function evaluate(expression,awaitPromise=false){
    const r=await cdp.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise,userGesture:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||"evaluate failed");
    return r.result?.value;
  }
  async function runCase(route,width,height,mode){
    current={route,mode,width,height,exceptions:[],consoleErrors:[],network:[]};
    await cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<=520,screenWidth:width,screenHeight:height});
    if(mode==="standalone")await cdp.send("Page.addScriptToEvaluateOnNewDocument",{source:standaloneBootstrap});
    await cdp.send("Page.navigate",{url:origin+route});
    await sleep(1400);
    const result=await evaluate(`(()=>{const d=document.documentElement,b=document.body;const focusables=[...document.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.getClientRects().length);const badButtons=focusables.filter(x=>{const r=x.getBoundingClientRect();return (x.tagName==="BUTTON"||x.getAttribute("role")==="button")&&(r.width<44||r.height<44)}).length;const unlabeled=focusables.filter(x=>{if(x.tagName==="INPUT"||x.tagName==="TEXTAREA"||x.tagName==="SELECT")return !(x.labels?.length||x.getAttribute("aria-label")||x.getAttribute("aria-labelledby")||x.getAttribute("placeholder"));return false}).length;return {title:document.title,bodyText:(b?.innerText||"").trim().length,scrollWidth:d.scrollWidth,innerWidth:innerWidth,overflow:d.scrollWidth>innerWidth+1,focusables:focusables.length,badButtons,unlabeled,theme:d.dataset.theme||"",manifest:document.querySelector('link[rel="manifest"]')?.getAttribute("href")||"",standalone:matchMedia("(display-mode: standalone)").matches,hydrationText:/hydration failed|hydration mismatch/i.test(b?.innerText||"")}})()`,false);
    if(!result.bodyText)fail(`${route} ${width}x${height} ${mode}: empty body`);
    if(result.overflow)fail(`${route} ${width}x${height} ${mode}: horizontal overflow ${result.scrollWidth} > ${result.innerWidth}`);
    if(result.unlabeled)fail(`${route} ${width}x${height} ${mode}: ${result.unlabeled} unlabeled form control(s)`);
    if(route==="/"&&!result.manifest)fail(`${route}: manifest link missing`);
    if(mode==="standalone"&&!result.standalone)fail(`${route}: standalone emulation not observed`);
    if(result.hydrationText)fail(`${route}: hydration failure text rendered`);
    await cdp.send("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
    await cdp.send("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
    await sleep(80);
    const focus=await evaluate(`(()=>{const e=document.activeElement,s=e&&getComputedStyle(e);return {tag:e?.tagName||"",body:e===document.body,outline:s?.outlineStyle||"",box:s?.boxShadow||""}})()`);
    if(result.focusables&&focus.body)fail(`${route} ${width}x${height}: Tab did not enter interactive content`);
    if(current.exceptions.length)fail(`${route} ${width}x${height}: runtime exceptions: ${[...new Set(current.exceptions)].join(" | ")}`);
    if(current.consoleErrors.length)fail(`${route} ${width}x${height}: console/hydration errors: ${[...new Set(current.consoleErrors)].join(" | ")}`);
    if(current.network.length)fail(`${route} ${width}x${height}: missing/failed assets: ${[...new Set(current.network)].join(" | ")}`);
    notes.push({route,width,height,mode,focusables:result.focusables,badButtons:result.badButtons,theme:result.theme});
  }

  for(const [width,height] of viewports)for(const route of routes)await runCase(route,width,height,"browser");
  await runCase("/",390,844,"standalone");

  const manifest=await (await fetch(origin+"/manifest.webmanifest")).json();
  if(manifest.display!=="standalone")fail(`manifest display must be standalone, got ${manifest.display}`);
  for(const src of ["/pwa-192.png","/pwa-512.png","/pwa-maskable-512.png","/apple-touch-icon.png","/sw.js"]){
    const r=await fetch(origin+src);
    if(!r.ok)fail(`PWA asset ${src} returned ${r.status}`);
  }
  const platformSource=fs.readFileSync("app/PlatformClient.js","utf8");
  if(!platformSource.includes('navigator.serviceWorker.register("/sw.js")'))fail("PlatformClient no longer registers /sw.js");
  const sw=await evaluate(`navigator.serviceWorker?Promise.race([navigator.serviceWorker.register("/sw.js").then(r=>Boolean(r&&(r.installing||r.waiting||r.active))).catch(e=>"ERR:"+e.message),new Promise(resolve=>setTimeout(()=>resolve("TIMEOUT"),4000))]):Promise.resolve("UNSUPPORTED")`,true);
  if(sw!==true)fail("service worker runtime registration failed: "+sw);

  cdp.close();
} catch(error){
  fail(error.stack||error.message||String(error));
} finally {
  if(browser&&!browser.killed)browser.kill("SIGTERM");
  if(next&&!next.killed)next.kill("SIGTERM");
  try{fs.rmSync(userDir,{recursive:true,force:true})}catch{}
}
if(failures.length)process.exit(1);
console.log(`Runtime browser OK · ${notes.length} route/viewport/mode cases · console/hydration/network/focus/PWA checks passed`);
