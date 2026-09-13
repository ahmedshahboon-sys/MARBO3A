"use client";
import Icon from "./Icon";

export default function MarketplaceComingSoon({compact=false}){
  return <section className={`marketplace-soon ${compact?"compact":""}`} dir="rtl">
    <div className="marketplace-soon-copy"><span className="marketplace-soon-icon"><Icon name="bookmark"/></span><div><small>قريبًا في مربوعة</small><h2>متاجر إلكترونية داخل المجتمع</h2><p>افتح متجرك، اعرض منتجاتك برابط خاص، استقبل الطلبات والسلة والتوصيل — وكل هذا مربوط بحسابك في مربوعة.</p><div className="marketplace-soon-tags"><span>متجرك الخاص</span><span>منتجات وسلة</span><span>طلبات وتوصيل</span><span>محفظة لاحقًا</span></div></div></div><a href="/marketplace"><span>شوف الفكرة</span><Icon name="arrowLeft" size={17}/></a>
  </section>;
}
