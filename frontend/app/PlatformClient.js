"use client";

import {useEffect,useRef,useState} from "react";
import Icon from "./Icon";
import {UiButton,UiIconButton,UiLinkButton} from "./Ui";

function isStandalone(){return window.matchMedia?.("(display-mode: standalone)").matches||window.navigator.standalone===true;}
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function isSocialBrowser(){return /FBAN|FBAV|FB_IAB|FB4A|Instagram/i.test(navigator.userAgent||"");}
function token(){return localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";}
function authHeader(){const t=token();return t&&t!=="cookie"?{"x-marbo3a-session-mode":"cookie"}:{}}
function safeActionUrl(raw){try{if(!raw)return"";const u=new URL(String(raw),location.origin);return u.origin===location.origin?`${u.pathname}${u.search}${u.hash}`:""}catch{return""}}
function installRouteAllowed(){if(typeof location==="undefined")return true;return !/^\/(admin|chat|room|live)(\/|$)/.test(location.pathname)}
function installDismissed(){try{return Date.now()<Number(localStorage.getItem("marbo3a_install_nudge_until")||0)}catch{return false}}
function dismissInstall(days=7){try{localStorage.setItem("marbo3a_install_nudge_until",String(Date.now()+days*86400000))}catch{}}
function notificationHref(n){const type=String(n?.type||"");if(type==="friend_request")return"/friends";if(type==="friend_accepted"&&n?.actor_username)return`/u/${encodeURIComponent(n.actor_username)}`;if(type==="live_started"&&n?.ref_id)return`/live/${n.ref_id}`;if((type.startsWith("post_")||type.startsWith("comment_"))&&n?.ref_id)return`/home?post=${n.ref_id}`;if(type.startsWith("story_")&&n?.ref_id)return`/home?story=${n.ref_id}`;if((type==="direct_message"||type.startsWith("direct_"))&&n?.ref_id)return`/chat/${n.ref_id}`;if(type.includes("room")&&n?.ref_id)return`/room/${n.ref_id}/chat`;if(type.includes("message"))return"/messages";if(type.includes("room"))return"/rooms";return"/notifications"}

export default function PlatformClient(){
  const [installPrompt,setInstallPrompt]=useState(null),[installed,setInstalled]=useState(false),[showIOS,setShowIOS]=useState(false),[installNudge,setInstallNudge]=useState(false),[updateReady,setUpdateReady]=useState(false),[offline,setOffline]=useState(false),[broadcast,setBroadcast]=useState(null),[socialBrowser,setSocialBrowser]=useState(false),[socialNotice,setSocialNotice]=useState(true),[copied,setCopied]=useState(false),[notification,setNotification]=useState(null);
  const registrationRef=useRef(null),nudgeShown=useRef(false),nudgeDrag=useRef(null),notifQueue=useRef([]),notifTimer=useRef(null);

  useEffect(()=>{
    setInstalled(isStandalone());setOffline(!navigator.onLine);setSocialBrowser(isSocialBrowser());
    const before=e=>{e.preventDefault();setInstallPrompt(e)};
    const installedHandler=()=>{setInstalled(true);setInstallPrompt(null);setInstallNudge(false);setShowIOS(false)};
    const online=()=>setOffline(false),offlineHandler=()=>setOffline(true),controllerChanged=()=>window.location.reload();
    window.addEventListener("beforeinstallprompt",before);window.addEventListener("appinstalled",installedHandler);window.addEventListener("online",online);window.addEventListener("offline",offlineHandler);
    if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js").then(reg=>{registrationRef.current=reg;reg.update().catch(()=>{});if(reg.waiting)setUpdateReady(true);reg.addEventListener("updatefound",()=>{const worker=reg.installing;if(worker)worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)setUpdateReady(true)})})}).catch(err=>report("service-worker",err));navigator.serviceWorker.addEventListener("controllerchange",controllerChanged)}
    const source=new EventSource("/api/realtime/broadcasts");source.addEventListener("broadcast",event=>{try{const data=JSON.parse(event.data);setBroadcast(data);if(data.sound)playTone();window.setTimeout(()=>setBroadcast(current=>current?.id===data.id?null:current),Math.max(1000,Number(data.duration_ms)||5000))}catch{}});source.onerror=()=>{};fetch("/api/broadcasts/active").then(r=>r.json()).then(d=>{const b=d.broadcasts?.[0];if(b){setBroadcast(b);window.setTimeout(()=>setBroadcast(null),Math.max(1000,Number(b.duration_ms)||5000))}}).catch(()=>{});
    const onError=e=>report("frontend",e.error||new Error(e.message),{url:location.href}),onReject=e=>report("frontend",e.reason instanceof Error?e.reason:new Error(String(e.reason)),{url:location.href}),onRequestFailure=e=>{const detail=e?.detail||{};report("first-run-request",new Error(`${detail.code||"REQUEST_FAILED"} ${detail.url||""}`),{url:location.href,component:isSocialBrowser()?"social-in-app-browser":"browser"})};
    const scheduleDismiss=()=>{clearTimeout(notifTimer.current);notifTimer.current=setTimeout(()=>setNotification(null),3000)};
    const onNotification=e=>{const n=e?.detail;if(!n?.id)return;notifQueue.current.push(n);setNotification(current=>{if(current)return current;const next=notifQueue.current.shift()||null;if(next)scheduleDismiss();return next})};
    window.addEventListener("error",onError);window.addEventListener("unhandledrejection",onReject);window.addEventListener("marbo3a:request-failure",onRequestFailure);window.addEventListener("marbo3a:notification:new",onNotification);
    return()=>{source.close();clearTimeout(notifTimer.current);window.removeEventListener("beforeinstallprompt",before);window.removeEventListener("appinstalled",installedHandler);window.removeEventListener("online",online);window.removeEventListener("offline",offlineHandler);window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onReject);window.removeEventListener("marbo3a:request-failure",onRequestFailure);window.removeEventListener("marbo3a:notification:new",onNotification);navigator.serviceWorker?.removeEventListener?.("controllerchange",controllerChanged)};
  },[]);

  useEffect(()=>{if(notification)return;const next=notifQueue.current.shift();if(!next)return;setNotification(next);clearTimeout(notifTimer.current);notifTimer.current=setTimeout(()=>setNotification(null),3000)},[notification]);
  useEffect(()=>{if(installed||nudgeShown.current||installDismissed()||(!installPrompt&&!isIOS())||!installRouteAllowed())return;const show=setTimeout(()=>{nudgeShown.current=true;setInstallNudge(true)},6500);return()=>clearTimeout(show)},[installed,installPrompt]);
  useEffect(()=>{if(!installNudge)return;const hide=setTimeout(()=>setInstallNudge(false),12000);return()=>clearTimeout(hide)},[installNudge]);

  async function report(source,error,extra={}){try{await fetch("/api/debug/report",{method:"POST",headers:{"content-type":"application/json",...authHeader()},body:JSON.stringify({source,level:"ERROR",message:String(error?.message||error).slice(0,1000),context:{...extra,stack:String(error?.stack||"").slice(0,2000)}})})}catch{}}
  function playTone(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)(),o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=660;g.gain.value=.035;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.12);setTimeout(()=>ctx.close().catch(()=>{}),300)}catch{}}
  async function install(){if(installPrompt){await installPrompt.prompt();const result=await installPrompt.userChoice;if(result.outcome==="accepted"){setInstalled(true);setInstallPrompt(null);setInstallNudge(false)}}else if(isIOS()){setInstallNudge(false);setShowIOS(true)}}
  function closeInstall(){dismissInstall(7);setInstallNudge(false)}
  function applyUpdate(){registrationRef.current?.waiting?.postMessage({type:"SKIP_WAITING"})}
  async function copyPublicUrl(){const value=`${location.origin}${location.pathname}${location.search}`;try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{try{const input=document.createElement("textarea");input.value=value;document.body.appendChild(input);input.select();document.execCommand("copy");input.remove();setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{}}}
  function nudgeDown(e){nudgeDrag.current={x:e.clientX,y:e.clientY}}
  function nudgeUp(e){const p=nudgeDrag.current;nudgeDrag.current=null;if(p&&Math.abs(e.clientX-p.x)>55&&Math.abs(e.clientX-p.x)>Math.abs(e.clientY-p.y))closeInstall()}
  function openNotification(){const n=notification;if(!n)return;setNotification(null);location.href=notificationHref(n)}
  const firstRunSurface=typeof location!=="undefined"&&(location.pathname==="/"||location.pathname==="/explore"||location.pathname==="/onboarding"),broadcastAction=typeof window!=="undefined"?safeActionUrl(broadcast?.action_url):"";

  return <>
    {installNudge&&!installed&&<aside className="install-nudge" role="status" onPointerDown={nudgeDown} onPointerUp={nudgeUp}><img src="/brand/official/marbo3a-mark.png" alt=""/><div><b>ثبّت مربوعة كتطبيق</b><span>دخول أسرع من الشاشة الرئيسية</span></div><button type="button" onClick={install}>تثبيت</button><button type="button" className="install-nudge-close" aria-label="إخفاء لأسبوع" onClick={closeInstall}><Icon name="close" size={16}/></button></aside>}
    {notification&&<button type="button" className="live-notification-toast" onClick={openNotification}><span className="live-notification-icon"><Icon name="bell"/></span><div><b>{notification.actor_name||notification.title||"تنبيه جديد"}</b><span>{notification.body||notification.title||"عندك تنبيه جديد في مربوعة"}</span></div>{notification.actor_avatar&&<img src={notification.actor_avatar} alt=""/>}</button>}
    {socialBrowser&&socialNotice&&firstRunSurface&&<aside className="first-run-browser-note" role="status"><Icon name="info"/><div><b>أنت فاتح مربوعة من داخل فيسبوك/إنستغرام</b><p>الموقع يشتغل هنا، لكن لو المتصفح وقف أو منع الأذونات افتح marbo3a.ly في Chrome أو Safari.</p></div><button type="button" onClick={()=>setSocialNotice(false)}>إخفاء</button><button className="copy" type="button" onClick={copyPublicUrl}>{copied?"تم نسخ الرابط ✓":"نسخ الرابط لفتحه في المتصفح"}</button></aside>}
    {offline&&<div className="network-banner"><Icon name="wifiOff" size={18}/><span>ما فيش اتصال بالإنترنت</span><UiButton variant="secondary" size="compact" onClick={()=>location.reload()}>إعادة المحاولة</UiButton></div>}
    {updateReady&&<div className="update-toast"><Icon name="refresh"/><div><b>يوجد تحديث جديد لمربوعة</b><span>حدّث للحصول على آخر نسخة.</span></div><UiButton size="compact" onClick={applyUpdate}>تحديث</UiButton></div>}
    {broadcast&&<div className={`broadcast-toast kind-${broadcast.kind||"info"}`}><Icon name={broadcast.kind==="warning"?"warning":"megaphone"}/><div><b>{broadcast.kind==="announcement"?"إعلان من مربوعة":"رسالة من الإدارة"}</b><span>{broadcast.message}</span></div>{broadcastAction&&<UiLinkButton href={broadcastAction} size="compact">{broadcast.action_label||"فتح"}</UiLinkButton>}<UiIconButton icon="close" label="إغلاق" size="compact" className="broadcast-close" onClick={()=>setBroadcast(null)}/></div>}
    {showIOS&&<div className="pwa-modal" onMouseDown={e=>e.currentTarget===e.target&&setShowIOS(false)}><div><UiIconButton icon="close" label="إغلاق" size="compact" className="pwa-modal-close" onClick={()=>setShowIOS(false)}/><img src="/brand/official/marbo3a-mark.png" alt="مربوعة"/><h3>ثبّت مربوعة على iPhone/iPad</h3><p>من Safari اضغط زر المشاركة، وبعدها اختار <b>إضافة إلى الشاشة الرئيسية</b> ثم «إضافة».</p><UiButton className="pwa-done" onClick={()=>setShowIOS(false)}>تمام</UiButton></div></div>}
  </>;
}
