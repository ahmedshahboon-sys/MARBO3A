"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import Icon from "./Icon";
import {isAppShellPath} from "./navigation-policy";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
export default function PremiumChrome(){
  const path=usePathname(),[unread,setUnread]=useState(0);
  useEffect(()=>{if(!isAppShellPath(path)||!token())return;const onCount=e=>setUnread(Math.max(0,Number(e?.detail?.count)||0));window.addEventListener("marbo3a:notification-count",onCount);window.dispatchEvent(new CustomEvent("marbo3a:reconcile-counts"));return()=>window.removeEventListener("marbo3a:notification-count",onCount)},[path]);
  if(!isAppShellPath(path))return null;
  const conversation=/^\/chat\/\d+(?:\/|$)/.test(path)||/^\/room\/\d+\/chat(?:\/|$)/.test(path);
  return <header className={`v3-global-header${conversation?" v3-conversation-chrome":""}`} dir="rtl">
    <Link prefetch href="/home" className="v3-brand-lockup" aria-label="العودة إلى الرئيسية"><img src="/brand/official/marbo3a-mark.png" alt="" aria-hidden="true"/></Link>
    <nav className="v3-header-actions" aria-label="اختصارات">
      <Link prefetch href="/notifications" aria-label={unread?`الإشعارات، ${unread} غير مقروءة`:"الإشعارات"} className="v3-header-icon" style={{position:"relative"}}><Icon name="bell"/>{unread>0&&<b className="v3-unread-badge" style={{position:"absolute",top:-2,right:-5,display:"grid",placeItems:"center",borderRadius:999,background:"#ff7a00",color:"#fff",fontWeight:900,boxShadow:"0 0 0 2px #080c12"}}>{unread>99?"99+":unread}</b>}</Link>
      <Link prefetch href="/search" aria-label="البحث" className="v3-header-icon"><Icon name="search"/></Link>
    </nav>
  </header>;
}
