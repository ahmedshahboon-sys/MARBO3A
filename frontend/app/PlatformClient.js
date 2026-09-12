"use client";

import { useEffect,useRef,useState } from "react";
import {usePathname} from "next/navigation";
import Icon from "./Icon";
import {UiButton,UiIconButton,UiLinkButton} from "./Ui";
import {UI_MODE} from "./ui-mode";

function isStandalone(){return window.matchMedia?.("(display-mode: standalone)").matches||window.navigator.standalone===true;}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function token(){return localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";}
function safeActionUrl(raw){try{if(!raw)return"";const u=new URL(String(raw),location.origin);return u.origin===location.origin?`${u.pathname}${u.search}${u.hash}`:""}catch{return""}}

export default function PlatformClient(){
  const pathname=usePathname();
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
    const controllerChanged=()=>window.location.reload();
    window.addEventListener("beforeinstallprompt",before); window.addEventListener("appinstalled",installedHandler); window.addEventListener("online",online); window.addEventListener("offline",offlineHandler);

    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("/sw.js").then(reg=>{
        registrationRef.current=reg;
        if(reg.waiting)setUpdateReady(true);
        reg.addEventListener("updatefound",()=>{const worker=reg.installing;if(worker)worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)setUpdateReady(true);});});
      }).catch(err=>report("service-worker",err));
      navigator.serviceWorker.addEventListener("controllerchange",controllerChanged);
    }

    const source=new EventSource("/api/realtime/broadcasts");
    source.addEventListener("broadcast",event=>{try{const data=JSON.parse(event.data);setBroadcast(data);if(data.sound)playTone();window.setTimeout(()=>setBroadcast(current=>current?.id===data.id?null:current),Math.max(1000,Number(data.duration_ms)||5000));}catch{}});
    source.onerror=()=>{};
    fetch("/api/broadcasts/active").then(r=>r.json()).then(d=>{const b=d.broadcasts?.[0];if(b){setBroadcast(b);window.setTimeout(()=>setBroadcast(null),Math.max(1000,Number(b.duration_ms)||5000));}}).catch(()=>{});

    const onError=e=>report("frontend",e.error||new Error(e.message),{url:location.href});
    const onReject=e=>report("frontend",e.reason instanceof Error?e.reason:new Error(String(e.reason)),{url:location.href});
    window.addEventListener("error",onError);window.addEventListener("unhandledrejection",onReject);
    return()=>{source.close();window.removeEventListener("beforeinstallprompt",before);window.removeEventListener("appinstalled",installedHandler);window.removeEventListener("online",online);window.removeEventListener("offline",offlineHandler);window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onReject);navigator.serviceWorker?.removeEventListener?.("controllerchange",controllerChanged);};
  },[]);

  async function report(source,error,extra={}){
    try{await fetch("/api/debug/report",{method:"POST",headers:{"content-type":"application/json",...(token()?{authorization:`Bearer ${token()}`}:{})},body:JSON.stringify({source,level:"ERROR",message:String(error?.message||error).slice(0,1000),context:{...extra,stack:String(error?.stack||"").slice(0,2000)}})});}catch{}
  }
  function playTone(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=660;g.gain.value=.035;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.12);setTimeout(()=>ctx.close().catch(()=>{}),300);}catch{}}
  async function install(){if(installPrompt){await installPrompt.prompt();const result=await installPrompt.userChoice;if(result.outcome==="accepted"){setInstalled(true);setInstallPrompt(null);}}else if(isIOS())setShowIOS(true);}
  function applyUpdate(){registrationRef.current?.waiting?.postMessage({type:"SKIP_WAITING"});}
  const primarySurface=pathname==="/home"||pathname==="/feed";
  const broadcastAction=typeof window!=="undefined"?safeActionUrl(broadcast?.action_url):"";
  const installLogo=UI_MODE==="v3"?"/brand/marbo3a-app-icon.svg":"/logo.svg";

  return <>
    {primarySurface&&!installed&&(installPrompt||isIOS())&&<button className="pwa-install" onClick={install} aria-label="تثبيت تطبيق مربوعة"><Icon name="install" size={18}/><span>تثبيت</span></button>}
    {offline&&<div className="network-banner"><Icon name="wifiOff" size={18}/><span>ما فيش اتصال بالإنترنت</span><UiButton variant="secondary" size="compact" onClick={()=>location.reload()}>إعادة المحاولة</UiButton></div>}
    {updateReady&&<div className="update-toast"><Icon name="refresh"/><div><b>يوجد تحديث جديد لمربوعة</b><span>حدّث للحصول على آخر نسخة.</span></div><UiButton size="compact" onClick={applyUpdate}>تحديث</UiButton></div>}
    {broadcast&&<div className={`broadcast-toast kind-${broadcast.kind||"info"}`}><Icon name={broadcast.kind==="warning"?"warning":"megaphone"}/><div><b>{broadcast.kind==="announcement"?"إعلان من مربوعة":"رسالة من الإدارة"}</b><span>{broadcast.message}</span></div>{broadcastAction&&<UiLinkButton href={broadcastAction} size="compact">{broadcast.action_label||"فتح"}</UiLinkButton>}<UiIconButton icon="close" label="إغلاق" size="compact" className="broadcast-close" onClick={()=>setBroadcast(null)}/></div>}
    {showIOS&&<div className="pwa-modal" onMouseDown={e=>e.currentTarget===e.target&&setShowIOS(false)}><div><UiIconButton icon="close" label="إغلاق" size="compact" className="pwa-modal-close" onClick={()=>setShowIOS(false)}/><img src={installLogo} alt="مربوعة"/><h3>ثبّت مربوعة على iPhone/iPad</h3><p>من Safari اضغط زر المشاركة، وبعدها اختار <b>إضافة إلى الشاشة الرئيسية</b> ثم «إضافة».</p><UiButton className="pwa-done" onClick={()=>setShowIOS(false)}>تمام</UiButton></div></div>}
  </>;
}
