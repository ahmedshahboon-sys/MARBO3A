"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import Icon from "./Icon";
import {isAppShellPath} from "./navigation-policy";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
export default function PremiumChrome(){
  const path=usePathname(),[unread,setUnread]=useState(0);
  useEffect(()=>{if(!isAppShellPath(path)||!token())return;let live=true;const load=()=>fetch("/api/notifications/unread-count",{headers:{authorization:`Bearer ${token()}`},cache:"no-store"}).then(r=>r.json()).then(d=>live&&setUnread(Math.max(0,Number(d.count)||0))).catch(()=>{});load();const onNew=()=>setUnread(n=>n+1),onChanged=e=>{if(Number.isFinite(Number(e?.detail?.count)))setUnread(Math.max(0,Number(e.detail.count)));else load()};window.addEventListener("marbo3a:notification:new",onNew);window.addEventListener("marbo3a:notifications-changed",onChanged);const t=setInterval(load,30000);return()=>{live=false;clearInterval(t);window.removeEventListener("marbo3a:notification:new",onNew);window.removeEventListener("marbo3a:notifications-changed",onChanged)}},[path]);
  if(!isAppShellPath(path))return null;
  const conversation=/^\/chat\/\d+(?:\/|$)/.test(path)||/^\/room\/\d+\/chat(?:\/|$)/.test(path);
  return <header className={`v3-global-header${conversation?" v3-conversation-chrome":""}`} dir="rtl">
    <Link prefetch href="/home" className="v3-brand-lockup" aria-label="العودة إلى الرئيسية"><img src="/brand/marbo3a-symbol-orange.svg" alt="" aria-hidden="true"/><span className="v3-brand-copy"><b>مربوعة</b><small>MARBO3A</small><em>ناسنا .. حكاياتنا .. دايمًا مع بعض</em></span></Link>
    <nav className="v3-header-actions" aria-label="اختصارات">
      <Link prefetch href="/notifications" aria-label={unread?`الإشعارات، ${unread} غير مقروءة`:"الإشعارات"} className={`v3-header-icon v3-bell${unread?" has-unread":""}`}><Icon name="bell"/>{unread>0&&<b className="v3-unread-badge">{unread>99?"99+":unread}</b>}</Link>
      <Link prefetch href="/search" aria-label="البحث" className="v3-header-icon"><Icon name="search"/></Link>
    </nav>
  </header>;
}
