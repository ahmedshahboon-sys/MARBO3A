"use client";

import {useEffect,useMemo,useState} from "react";
import {usePathname} from "next/navigation";
import Icon from "./Icon";

function getToken(){if(typeof window==="undefined")return "";return localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""}

export default function SocialDock(){
  const path=usePathname();
  const[visible,setVisible]=useState(false),[unread,setUnread]=useState(0);
  useEffect(()=>{
    const t=getToken();setVisible(Boolean(t));
    if(!t){setUnread(0);return}
    let alive=true,busy=false;
    async function refresh(){if(!alive||busy||document.visibilityState!=="visible")return;busy=true;try{const r=await fetch("/api/chats",{headers:{authorization:`Bearer ${getToken()}`},cache:"no-store"});if(!r.ok)return;const d=await r.json();if(alive)setUnread((d.chats||[]).reduce((n,c)=>n+Number(c.unread_count||0),0))}catch{}finally{busy=false}}
    refresh();const timer=setInterval(refresh,12000);const onVisible=()=>document.visibilityState==="visible"&&refresh();document.addEventListener("visibilitychange",onVisible);return()=>{alive=false;clearInterval(timer);document.removeEventListener("visibilitychange",onVisible)};
  },[path]);
  const badge=useMemo(()=>unread>99?"99+":String(unread),[unread]);
  if(!visible||path?.startsWith("/admin")||path==="/privacy"||path==="/terms")return null;
  const active=p=>path===p||path?.startsWith(p+"/");
  return <nav className="social-dock" aria-label="التنقل الرئيسي">
    <a className={active("/home")?"active":""} href="/home"><Icon name="home"/><span>الرئيسية</span></a>
    <a className={active("/friends")?"active":""} href="/friends"><Icon name="users"/><span>الأصحاب</span></a>
    <a className={`dock-create ${active("/feed")?"active":""}`} href="/feed#compose" aria-label="إنشاء منشور"><Icon name="sparkles"/><span>نشر</span></a>
    <a className={`dock-messages ${active("/messages")||active("/chat")?"active":""}`} href="/messages"><span className="dock-icon-wrap"><Icon name="message"/>{unread>0&&<b className="dock-unread-badge">{badge}</b>}</span><span>الرسائل</span></a>
    <a className={active("/rooms")||active("/room")?"active":""} href="/rooms"><Icon name="hash"/><span>الغرف</span></a>
  </nav>;
}
