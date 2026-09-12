"use client";
import {useEffect} from "react";
import Link from "next/link";
import Icon from "../Icon";

export default function SettingsPage(){
  useEffect(()=>{
    const id=requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent("marbo3a:open-settings")));
    return()=>cancelAnimationFrame(id);
  },[]);
  return <main className="settings-route-marker" dir="rtl">
    <header className="settings-route-head">
      <Link href="/home" aria-label="رجوع"><Icon name="arrowRight"/></Link>
      <div><small>إعدادات مربوعة</small><h1>الحساب والتطبيق</h1><p>إدارة حسابك وتخصيص تجربتك في مربوعة</p></div>
    </header>
  </main>;
}
