"use client";

import { useEffect,useRef,useState } from "react";
import Icon from "./Icon";

function isStandalone(){return window.matchMedia?.("(display-mode: standalone)").matches||window.navigator.standalone===true;}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function token(){return localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";}

export default function PlatformClient(){
  const [installPrompt,setInstallPrompt]=useState(null);
  const [installed,setInstalled]=useState(false);
  const [showIOS,setShowIOS]=useState(false);
  const [updateReady,setUpdateReady]=useState(false);
  const [offline,setOffline]=useState(false);
  const [broadcast,setBroadcast]=useState(null);
  const registrationRef=useRef(null);

  useEffect(()=>{
    setInstalled(isStandalone()); setOffline(!navigator.onLine);
    const before=e=>{e.preventDefault();setInstallPrompt(e);};
    const installedHandler=()=>{setInstalled(true);setInstallPrompt(null);setShowIOS(false);};
    const online=()=>setOffline(false), offlineHandler=()=>setOffline(true);
    window.addEventListener("beforeinstallprompt",before); window.addEventListener("appinstalled",installedHandler); window.addEventListener("online",online); window.addEventListener("offline",offlineHandler);

    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("/sw.js").then(reg=>{
        registrationRef.current=reg;
        if(reg.waiting)setUpdateReady(true);
        reg.addEventListener("updatefound",()=>{const worker=reg.installing;if(worker)worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)setUpdateReady(true);});});
      }).catch(err=>report("service-worker",err));
      navigator.serviceWorker.addEventListener("controllerchange",()=>window.location.reload());
    }

    const source=new EventSource("/api/realtime/broadcasts");
    source.addEventListener("broadcast",event=>{try{const data=JSON.parse(event.data);setBroadcast(data);if(data.sound)playTone();window.setTimeout(()=>setBroadcast(current=>current?.id===data.id?null:current),Math.max(1000,Number(data.duration_ms)||5000));}catch{}});
    source.onerror=()=>{};
    fetch("/api/broadcasts/active").then(r=>r.json()).then(d=>{const b=d.broadcasts?.[0];if(b){setBroadcast(b);window.setTimeout(()=>setBroadcast(null),Math.max(1000,Number(b.duration_ms)||5000));}}).catch(()=>{});

    const onError=e=>report("frontend",e.error||new Error(e.message),{url:location.href});
    const onReject=e=>report("frontend",e.reason instanceof Error?e.reason:new Error(String(e.reason)),{url:location.href});
    window.addEventListener("error",onError);window.addEventListener("unhandledrejection",onReject);
    return()=>{source.close();window.removeEventListener("beforeinstallprompt",before);window.removeEventListener("appinstalled",installedHandler);window.removeEventListener("online",online);window.removeEventListener("offline",offlineHandler);window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onReject);};
  },[]);

  async function report(source,error,extra={}){
    try{await fetch("/api/debug/report",{method:"POST",headers:{"content-type":"application/json",...(token()?{authorization:`Bearer ${token()}`}:{})},body:JSON.stringify({source,level:"ERROR",message:String(error?.message||error).slice(0,1000),context:{...extra,stack:String(error?.stack||"").slice(0,2000)}})});}catch{}
  }
  function playTone(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=660;g.gain.value=.035;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.12);}catch{}}
  async function install(){if(installPrompt){await installPrompt.prompt();const result=await installPrompt.userChoice;if(result.outcome==="accepted"){setInstalled(true);setInstallPrompt(null);}}else if(isIOS())setShowIOS(true);}
  function applyUpdate(){registrationRef.current?.waiting?.postMessage({type:"SKIP_WAITING"});}

  return <>
    {!installed&&(installPrompt||isIOS())&&<button className="pwa-install" onClick={install}><Icon name="install" size={18}/><span>تثبيت مربوعة</span></button>}
    {offline&&<div className="network-banner"><Icon name="wifiOff" size={18}/><span>ما فيش اتصال بالإنترنت</span><button onClick={()=>location.reload()}>إعادة المحاولة</button></div>}
    {updateReady&&<div className="update-toast"><Icon name="refresh"/><div><b>يوجد تحديث جديد لمربوعة</b><span>حدّث للحصول على آخر نسخة.</span></div><button onClick={applyUpdate}>تحديث</button></div>}
    {broadcast&&<div className={`broadcast-toast kind-${broadcast.kind||"info"}`}><Icon name={broadcast.kind==="warning"?"warning":"megaphone"}/><div><b>{broadcast.kind==="announcement"?"إعلان من مربوعة":"رسالة من الإدارة"}</b><span>{broadcast.message}</span></div>{broadcast.action_url&&<a href={broadcast.action_url}>{broadcast.action_label||"فتح"}</a>}<button className="broadcast-close" onClick={()=>setBroadcast(null)} aria-label="إغلاق"><Icon name="close" size={16}/></button></div>}
    {showIOS&&<div className="pwa-modal" onMouseDown={e=>e.currentTarget===e.target&&setShowIOS(false)}><div><button className="pwa-modal-close" onClick={()=>setShowIOS(false)}><Icon name="close"/></button><img src="/logo.svg" alt="مربوعة"/><h3>ثبّت مربوعة على iPhone/iPad</h3><p>من Safari اضغط زر المشاركة، وبعدها اختار <b>إضافة إلى الشاشة الرئيسية</b> ثم «إضافة».</p><button className="pwa-done" onClick={()=>setShowIOS(false)}>تمام</button></div></div>}
  </>;
}
