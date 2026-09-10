"use client";
import {useEffect,useRef,useState} from "react";

const tok=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
const safe=s=>String(s||"")
  .replace(/([?&](?:token|code|password|otp|secret|key)=)[^&]+/gi,"$1[redacted]")
  .replace(/bearer\s+[a-z0-9._-]+/ig,"Bearer [redacted]")
  .slice(0,240);
const isTraceEndpoint=url=>String(url||"").startsWith("/api/debug/session/");

export default function DebugTrace(){
  const[on,setOn]=useState(false);
  const[counts,setCounts]=useState({error:0,api:0,ui:0});
  const sid=useRef("");

  useEffect(()=>{
    const token=tok();
    if(!token)return;
    let dead=false;
    fetch("/api/debug/session/start",{
      method:"POST",
      headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
      body:JSON.stringify({viewport:`${innerWidth}x${innerHeight}`})
    }).then(async r=>{
      const d=await r.json().catch(()=>({}));
      if(dead||!r.ok||!d.ok)return;
      sid.current=d.sessionId;
      setOn(true);
    }).catch(()=>{});
    return()=>{dead=true};
  },[]);

  useEffect(()=>{
    if(!on)return;
    let batch=[];
    let timer;
    let lastPath=location.pathname+location.search;

    const add=(type,data={})=>{
      batch.push({type,path:location.pathname,ts:new Date().toISOString(),...data});
      if(type.includes("error"))setCounts(x=>({...x,error:x.error+1}));
      if(type==="api_error")setCounts(x=>({...x,api:x.api+1}));
      if(type==="ui_overlap"||type==="ui_overflow")setCounts(x=>({...x,ui:x.ui+1}));
      clearTimeout(timer);
      timer=setTimeout(flush,700);
    };

    const flush=()=>{
      if(!batch.length||!sid.current)return;
      const events=batch.splice(0,50);
      /* Use the original fetch so a trace-write failure can never recursively trace itself. */
      originalFetch(`/api/debug/session/${sid.current}/events`,{
        method:"POST",
        headers:{authorization:`Bearer ${tok()}`,"content-type":"application/json"},
        body:JSON.stringify({events}),
        keepalive:true
      }).catch(()=>{});
    };

    const click=e=>{
      const el=e.target?.closest?.("button,a,input,label,summary,[role=button]");
      if(!el)return;
      add("click",{
        target:safe(el.getAttribute("aria-label")||el.getAttribute("title")||el.name||el.id||el.innerText||el.tagName),
        href:safe(el.getAttribute("href"))
      });
    };
    const err=e=>add("js_error",{message:safe(e.message),source:safe(e.filename),line:e.lineno});
    const rej=e=>add("promise_error",{message:safe(e.reason?.message||e.reason)});

    const originalFetch=window.fetch.bind(window);
    window.fetch=async(...args)=>{
      const raw=typeof args[0]==="string"?args[0]:args[0]?.url;
      const url=safe(raw);
      const start=performance.now();
      try{
        const r=await originalFetch(...args);
        if(!r.ok&&url.startsWith("/api/")&&!isTraceEndpoint(url))add("api_error",{url,status:r.status,duration:Math.round(performance.now()-start)});
        return r;
      }catch(e){
        if(url.startsWith("/api/")&&!isTraceEndpoint(url))add("api_error",{url,status:0,message:safe(e.message),duration:Math.round(performance.now()-start)});
        throw e;
      }
    };

    const scan=()=>{
      const nowPath=location.pathname+location.search;
      if(nowPath!==lastPath){
        add("navigation",{from:safe(lastPath),to:safe(nowPath),title:safe(document.title)});
        lastPath=nowPath;
      }
      if(document.documentElement.scrollWidth>innerWidth+8)add("ui_overflow",{width:document.documentElement.scrollWidth,viewport:innerWidth});
      const dock=document.querySelector(".social-dock"),compose=document.querySelector(".chat-compose,.sf-composer");
      if(dock&&compose){
        const a=dock.getBoundingClientRect(),b=compose.getBoundingClientRect();
        if(a.top<b.bottom&&a.bottom>b.top)add("ui_overlap",{target:"social-dock/composer"});
      }
    };

    document.addEventListener("click",click,true);
    window.addEventListener("error",err);
    window.addEventListener("unhandledrejection",rej);
    add("page_view",{title:safe(document.title),viewport:`${innerWidth}x${innerHeight}`});
    const iv=setInterval(scan,2500);

    return()=>{
      document.removeEventListener("click",click,true);
      window.removeEventListener("error",err);
      window.removeEventListener("unhandledrejection",rej);
      window.fetch=originalFetch;
      clearInterval(iv);
      clearTimeout(timer);
      flush();
    };
  },[on]);

  if(!on)return null;
  return <a href="/admin/debug" className="debug-trace-pill" title="فتح سجل الديباق"><i/> REC <b>{counts.error}</b><span>API {counts.api}</span><span>UI {counts.ui}</span></a>;
}
