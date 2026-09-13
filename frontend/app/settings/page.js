"use client";
import {useEffect} from "react";
import Link from "next/link";
import Icon from "../Icon";

export default function SettingsPage(){
  useEffect(()=>{
    window.scrollTo({top:0,left:0,behavior:"auto"});
    const open=()=>window.dispatchEvent(new CustomEvent("marbo3a:open-settings"));
    const frame=requestAnimationFrame(open);
    window.addEventListener("pageshow",open);
    return()=>{
      cancelAnimationFrame(frame);window.removeEventListener("pageshow",open);
      document.querySelector(".settings-card>header button")?.click();
    };
  },[]);
  return <main className="settings-route-marker" dir="rtl">
    <header className="settings-route-head">
      <Link href="/home" aria-label="رجوع"><Icon name="arrowRight"/></Link>
      <div><small>إعدادات مربوعة</small><h1>الحساب والتطبيق</h1><p>إدارة حسابك وتخصيص تجربتك في مربوعة</p></div>
    </header>
    <Link className="settings-permissions-entry" href="/settings/permissions"><Icon name="settings"/><span><b>أذونات الجهاز</b><small>المايكروفون، الكاميرا، الموقع والإشعارات</small></span><Icon name="arrowLeft"/></Link>
  </main>;
}
