"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import Icon from "./Icon";
import {getNavigationPolicy} from "./navigation-policy";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
const compact=n=>{const v=Math.max(0,Number(n)||0);return v>=1_000_000?`${(v/1_000_000).toFixed(v>=10_000_000?0:1)}م`:v>=10_000?`${(v/1_000).toFixed(v>=100_000?0:1)}ألف`:v.toLocaleString("ar-LY")};
const trackedTitle=v=>{const d=v?new Date(v):null;if(!d||Number.isNaN(d.getTime()))return"إجمالي الهويات الزائرة المتتبعة منذ بدء نظام التتبع";return`إجمالي الهويات الزائرة المتتبعة منذ ${d.toLocaleDateString("ar-LY")}`};
export default function PremiumChrome(){
  const path=usePathname(),[unread,setUnread]=useState(0),[audience,setAudience]=useState({totalVisitors:0,onlineNow:0,trackingStartedAt:null}),policy=getNavigationPolicy(path);
  useEffect(()=>{if(!policy.showHeader||!token())return;const onCount=e=>setUnread(Math.max(0,Number(e?.detail?.count)||0));window.addEventListener("marbo3a:notification-count",onCount);window.dispatchEvent(new CustomEvent("marbo3a:reconcile-counts"));return()=>window.removeEventListener("marbo3a:notification-count",onCount)},[path]);
  useEffect(()=>{if(!policy.showHeader)return;let dead=false,busy=false;const load=async()=>{if(busy||document.visibilityState!=="visible")return;busy=true;try{const r=await fetch("/api/public/site-stats",{credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!dead&&r.ok&&d?.ok)setAudience({totalVisitors:Number(d.totalVisitors||0),onlineNow:Number(d.onlineNow||0),trackingStartedAt:d.trackingStartedAt||null})}catch{}finally{busy=false}};load();const timer=setInterval(load,20000),visible=()=>document.visibilityState==="visible"&&load();document.addEventListener("visibilitychange",visible);return()=>{dead=true;clearInterval(timer);document.removeEventListener("visibilitychange",visible)}},[path]);
  if(!policy.showHeader)return null;
  const conversation=policy.conversation;
  return <header className={`v3-global-header${conversation?" v3-conversation-chrome":""}`} dir="rtl">
    <Link prefetch href="/home" className="v3-brand-lockup" aria-label="العودة إلى الرئيسية"><img src="/brand/official/marbo3a-mark.png" alt="" aria-hidden="true"/></Link>
    <div className="v3-audience-stats" aria-label="إحصائيات مربوعة">
      <span title={trackedTitle(audience.trackingStartedAt)}><Icon name="users"/><b>{compact(audience.totalVisitors)}</b><small>هوية زائرة</small></span>
      <span title="المتصلون الآن خلال آخر 90 ثانية"><i className="v3-online-pulse"/><b>{compact(audience.onlineNow)}</b><small>متصل</small></span>
    </div>
    <nav className="v3-header-actions" aria-label="اختصارات">
      <Link prefetch href="/notifications" aria-label={unread?`الإشعارات، ${unread} غير مقروءة`:"الإشعارات"} className="v3-header-icon"><Icon name="bell"/>{unread>0&&<b className="v3-unread-badge">{unread>99?"99+":unread}</b>}</Link>
      <Link prefetch href="/search" aria-label="البحث" className="v3-header-icon"><Icon name="search"/></Link>
    </nav>
  </header>;
}
