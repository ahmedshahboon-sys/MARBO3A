"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import Icon from "./Icon";

const HIDDEN_PREFIXES=["/about","/privacy","/terms","/onboarding"];
export default function PremiumChrome(){
  const path=usePathname();
  if(!path||path==="/"||HIDDEN_PREFIXES.some(p=>path===p||path.startsWith(p+"/")))return null;
  const conversation=/^\/chat\/\d+(?:\/|$)/.test(path)||/^\/room\/\d+\/chat(?:\/|$)/.test(path);
  return <header className={`v3-global-header${conversation?" v3-conversation-chrome":""}`} dir="rtl">
    <Link prefetch href="/home" className="v3-brand-lockup" aria-label="العودة إلى الرئيسية">
      <img src="/brand/marbo3a-symbol-orange.svg" alt="" aria-hidden="true"/>
      <span className="v3-brand-copy"><b>مربوعة</b><small>MARBO3A</small><em>ناسنا .. حكاياتنا .. دايمًا مع بعض</em></span>
    </Link>
    <nav className="v3-header-actions" aria-label="اختصارات">
      <Link prefetch href="/notifications" aria-label="الإشعارات" className="v3-header-icon v3-bell"><Icon name="bell"/></Link>
      <Link prefetch href="/search" aria-label="البحث" className="v3-header-icon"><Icon name="search"/></Link>
    </nav>
  </header>;
}
