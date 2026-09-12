"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import Icon from "./Icon";

const HIDDEN_PREFIXES=["/privacy","/terms","/onboarding"];
export default function PremiumChrome(){
  const path=usePathname();
  if(!path||path==="/"||HIDDEN_PREFIXES.some(p=>path===p||path.startsWith(p+"/")))return null;
  const openDrawer=()=>window.dispatchEvent(new CustomEvent("marbo3a:open-drawer"));
  return <header className="v3-global-header" dir="rtl">
    <button className="v3-brand-lockup" type="button" onClick={openDrawer} aria-label="فتح قائمة مربوعة">
      <img className="v3-brand-lockup-image" src="/brand/brand-lockup-horizontal.png" alt="مربوعة MARBO3A"/>
    </button>
    <nav className="v3-header-actions" aria-label="اختصارات">
      <Link prefetch href="/notifications" aria-label="الإشعارات" className="v3-header-icon v3-bell"><Icon name="bell"/></Link>
      <Link prefetch href="/search" aria-label="البحث" className="v3-header-icon"><Icon name="search"/></Link>
    </nav>
  </header>
}
