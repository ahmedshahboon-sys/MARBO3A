"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {isAppShellPath} from "./navigation-policy";

const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
const authHeaders=()=>{const t=token();return t&&t!=="cookie"?{authorization:`Bearer ${t}`}:{}};
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(`marbo3a:${name}`,{detail}));

export default function AppDataCoordinator(){
  const path=usePathname();
  useEffect(()=>{
    if(!isAppShellPath(path)||!token())return;
    let alive=true,notifBusy=false,messageBusy=false,notifQueued=false,messageQueued=false;
    async function notifications(){
      if(!alive)return;
      if(notifBusy){notifQueued=true;return}
      notifBusy=true;
      try{const r=await fetch("/api/notifications/unread-count",{headers:authHeaders(),cache:"no-store",credentials:"same-origin"});if(!r.ok)return;const d=await r.json();if(alive)emit("notification-count",{count:Math.max(0,Number(d.count)||0)})}catch{}finally{notifBusy=false;if(alive&&notifQueued){notifQueued=false;queueMicrotask(notifications)}}
    }
    async function messages(){
      if(!alive)return;
      if(messageBusy){messageQueued=true;return}
      messageBusy=true;
      try{const r=await fetch("/api/chats",{headers:authHeaders(),cache:"no-store",credentials:"same-origin"});if(!r.ok)return;const d=await r.json();const count=(d.chats||[]).reduce((n,c)=>n+Number(c.unread_count||0),0);if(alive)emit("message-unread-count",{count:Math.max(0,count)})}catch{}finally{messageBusy=false;if(alive&&messageQueued){messageQueued=false;queueMicrotask(messages)}}
    }
    const reconcile=()=>{if(document.visibilityState!=="hidden"){notifications();messages()}};
    const onNotification=()=>notifications();
    const onMessages=()=>messages();
    const onRealtime=e=>{if(e?.detail?.connected)reconcile()};
    const onVisible=()=>document.visibilityState==="visible"&&reconcile();
    const onFocus=()=>reconcile();
    window.addEventListener("marbo3a:notification:new",onNotification);
    window.addEventListener("marbo3a:notification:updated",onNotification);
    window.addEventListener("marbo3a:notifications-changed",onNotification);
    window.addEventListener("marbo3a:direct:new",onMessages);
    window.addEventListener("marbo3a:direct:updated",onMessages);
    window.addEventListener("marbo3a:direct:deleted",onMessages);
    window.addEventListener("marbo3a:message:new",onMessages);
    window.addEventListener("marbo3a:message:updated",onMessages);
    window.addEventListener("marbo3a:message:deleted",onMessages);
    window.addEventListener("marbo3a:reconcile-counts",reconcile);
    window.addEventListener("marbo3a:realtime",onRealtime);
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onVisible);
    reconcile();
    const timer=setInterval(reconcile,120000);
    return()=>{alive=false;notifQueued=false;messageQueued=false;clearInterval(timer);window.removeEventListener("marbo3a:notification:new",onNotification);window.removeEventListener("marbo3a:notification:updated",onNotification);window.removeEventListener("marbo3a:notifications-changed",onNotification);window.removeEventListener("marbo3a:direct:new",onMessages);window.removeEventListener("marbo3a:direct:updated",onMessages);window.removeEventListener("marbo3a:direct:deleted",onMessages);window.removeEventListener("marbo3a:message:new",onMessages);window.removeEventListener("marbo3a:message:updated",onMessages);window.removeEventListener("marbo3a:message:deleted",onMessages);window.removeEventListener("marbo3a:reconcile-counts",reconcile);window.removeEventListener("marbo3a:realtime",onRealtime);window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onVisible)};
  },[path]);
  return null;
}
