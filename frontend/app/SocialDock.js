"use client";

import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import Icon from "./Icon";

function getToken(){if(typeof window==="undefined")return "";return localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""}

export default function SocialDock(){
  const path=usePathname();
  const [visible,setVisible]=useState(false),[username,setUsername]=useState("");
  useEffect(()=>{
    const t=getToken();
    if(!t){setVisible(false);return}
    setVisible(true);
    fetch("/api/auth/me",{headers:{authorization:`Bearer ${t}`}}).then(r=>r.ok?r.json():null).then(d=>setUsername(d?.user?.username||"")).catch(()=>{});
  },[path]);
  if(!visible||path?.startsWith("/admin")||path==="/privacy"||path==="/terms")return null;
  const active=p=>path===p||path?.startsWith(p+"/");
  return <nav className="social-dock" aria-label="التنقل الرئيسي">
    <a className={active("/feed")?"active":""} href="/feed"><Icon name="home"/><span>الرئيسية</span></a>
    <a className={active("/friends")?"active":""} href="/friends"><Icon name="users"/><span>الأصحاب</span></a>
    <a className="dock-create" href="/feed#compose" aria-label="إنشاء منشور"><Icon name="sparkles"/></a>
    <a className={active("/messages")||active("/chat")?"active":""} href="/messages"><Icon name="message"/><span>الرسائل</span></a>
    <a className={active("/rooms")||active("/room")?"active":""} href="/rooms"><Icon name="hash"/><span>الغرف</span></a>
  </nav>
}
