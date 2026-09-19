"use client";
import Link from "next/link";
import Icon from "../../Icon";
import PrivacySettingsPanel from "../../PrivacySettingsPanel";

export default function PrivacySettings(){
  return <main className="social-page" dir="rtl"><div className="social-shell"><section className="feature-page">
    <header className="settings-route-head"><Link href="/settings" aria-label="رجوع"><Icon name="arrowRight"/></Link><div><small>مربوعة</small><h1>الخصوصية</h1><p>نفس إعدادات الخصوصية الرئيسية — مصدر واحد للحفظ والتطبيق.</p></div></header>
    <section className="feature-card settings-large"><PrivacySettingsPanel/></section>
  </section></div></main>;
}
