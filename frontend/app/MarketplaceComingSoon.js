"use client";
import Icon from "./Icon";
import {featureTruth} from "./product-feature-truth";

export default function MarketplaceComingSoon({compact=false}){
  const truth=featureTruth("marketplace");
  return <section className={`marketplace-soon ${compact?"compact":""}`} data-feature="marketplace" data-feature-status={truth.status} dir="rtl">
    <div className="marketplace-soon-copy"><span className="marketplace-soon-icon"><Icon name="bookmark"/></span><div><small>{truth.eyebrow}</small><h2>متاجر إلكترونية داخل المجتمع</h2><p>الخطة الجاية: تقدر تفتح متجرك وتعرض منتجاتك وتستقبل الطلبات داخل مربوعة. البيع والدفع مش متاحين حاليًا.</p><div className="marketplace-soon-tags"><span>متجرك الخاص</span><span>منتجات وسلة</span><span>طلبات وتوصيل</span><span>محفظة لاحقًا</span></div></div></div><a href="/marketplace" aria-label="عرض خطة المتاجر القادمة"><span>شوف الخطة</span><Icon name="arrowLeft" size={17}/></a>
  </section>;
}
