"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import Icon from "./Icon";
import {UI_MODE} from "./ui-mode";
import {isAppShellPath} from "./navigation-policy";
const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
export default function SideDrawer(){
  const path=usePathname(),[open,setOpen]=useState(false),[me,setMe]=useState(null),[isAdmin,setIsAdmin]=useState(false);
  useEffect(()=>{const t=token();if(!t){setMe(null);return}fetch("/api/auth/me",{headers:{authorization:`Bearer ${t}`},cache:"no-store",credentials:"same-origin"}).then(r=>r.ok?r.json():null).then(d=>{setMe(d?.user||null);setIsAdmin(Boolean(d?.isAdmin)||d?.user?.role==="admin")}).catch(()=>{});setOpen(false)},[path]);
  useEffect(()=>{const openFromNavigation=()=>setOpen(true);window.addEventListener("marbo3a:open-drawer",openFromNavigation);return()=>window.removeEventListener("marbo3a:open-drawer",openFromNavigation)},[]);
  if(!me||!isAppShellPath(path))return null;
  async function logout(){try{await fetch("/api/auth/logout",{method:"POST",headers:{authorization:`Bearer ${token()}`},credentials:"same-origin"})}catch{}localStorage.removeItem("marbo3a_token");sessionStorage.removeItem("marbo3a_token");location.href="/"}
  function openSettings(){setOpen(false);setTimeout(()=>window.dispatchEvent(new CustomEvent("marbo3a:open-settings")),50)}
  const items=[["/home","home","الرئيسية"],["/search","search","البحث"],["/notifications","bell","الإشعارات"],["/friends","users","الأصحاب"],["/messages","message","الرسائل"],["/rooms","hash","الغرف"],["/map","map","الخريطة"],[`/u/${me.username}`,"user","ملفي الشخصي"],["/saved","bookmark","المحفوظات"],["/profile/edit","image","تعديل الملف"],["/blocked","warning","المحظورون"]];
  return <>{open&&<div className="drawer-overlay" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}><aside className="social-drawer"><header><div className="drawer-user">{me.avatar_url?<img src={me.avatar_url} alt=""/>:<span>{me.display_name?.[0]||"م"}</span>}<div><b>{me.display_name}</b><small><bdi dir="ltr">@{me.username}</bdi></small></div></div><button type="button" onClick={()=>setOpen(false)} aria-label="إغلاق"><Icon name="close"/></button></header><nav>{items.map(([href,icon,label])=><Link prefetch key={href} href={href} className={path===href||path?.startsWith(href+"/")?"active":""}><Icon name={icon}/><span>{label}</span></Link>)}</nav><footer>{isAdmin&&<><Link prefetch href="/admin"><Icon name="settings"/><span>مركز الإدارة</span></Link><Link prefetch href="/admin/readiness"><Icon name="check"/><span>فحص الجاهزية</span></Link></>}{UI_MODE==="v3"?<Link prefetch href="/settings"><Icon name="settings"/><span>الإعدادات</span></Link>:<button type="button" onClick={openSettings}><Icon name="settings"/><span>الإعدادات</span></button>}<Link prefetch href="/settings/login-methods"><Icon name="lock"/><span>طرق تسجيل الدخول</span></Link><Link prefetch href="/about"><Icon name="info"/><span>حول مربوعة</span></Link><button type="button" className="drawer-logout" onClick={logout}><Icon name="logout"/><span>تسجيل الخروج</span></button></footer></aside></div>}</>;
}
