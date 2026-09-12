"use client";
import {useEffect} from "react";
import Link from "next/link";
import Icon from "../Icon";

export default function SettingsPage(){
  useEffect(()=>{
    const open=()=>window.dispatchEvent(new CustomEvent("marbo3a:open-settings"));
    const a=setTimeout(open,60);
    const b=setTimeout(open,320);
    window.addEventListener("pageshow",open);
    return()=>{clearTimeout(a);clearTimeout(b);window.removeEventListener("pageshow",open)};
  },[]);
  return <main className="settings-route-marker" dir="rtl">
    <header className="settings-route-head">
      <Link href="/home" aria-label="رجوع"><Icon name="arrowRight"/></Link>
      <div><small>إعدادات مربوعة</small><h1>الحساب والتطبيق</h1><p>إدارة حسابك وتخصيص تجربتك في مربوعة</p></div>
    </header>
  </main>;
}
