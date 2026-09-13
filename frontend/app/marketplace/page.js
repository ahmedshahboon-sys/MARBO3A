"use client";
import Icon from "../Icon";
import MarketplaceComingSoon from "../MarketplaceComingSoon";

const blocks=[
  ["user","متجر مرتبط بحسابك","اسم، لوقو، وصف، تصنيف، رقم هاتف، عنوان وموقع خرائط."],
  ["image","منتجات منظمة","صور، أسعار، مخزون، ألوان ومقاسات ورابط مستقل لكل منتج."],
  ["bookmark","سلة وطلبات","الزبون يطلب كعضو أو زائر ويضيف بياناته والعنوان والتوصيل."],
  ["message","رسائل المتجر","طلبات المتجر تكون منفصلة عن الرسائل العادية ومربوطة بكل طلب."],
  ["sparkles","إعلانات ممولة","روّج لمنتج أو متجر داخل الخلاصة مع وسم مموّل وإحصائيات."],
  ["lock","اشتراك وموافقة","فتح المتجر يحتاج طلب وموافقة الإدارة، والدفع يبدأ بحوالة ثم المحفظة مستقبلًا."]
];
export default function MarketplacePreview(){return <main className="feature-page marketplace-preview" dir="rtl"><section className="feature-shell"><header className="marketplace-preview-head"><a href="/home" aria-label="رجوع"><Icon name="arrowRight"/></a><div><small>MARBO3A MARKET</small><h1>متاجر مربوعة</h1><p>المرحلة الجاية من مربوعة: البيع والشراء داخل نفس المجتمع.</p></div><span><Icon name="sparkles"/></span></header><MarketplaceComingSoon/><section className="marketplace-preview-grid">{blocks.map(([icon,title,body])=><article key={title}><span><Icon name={icon}/></span><h2>{title}</h2><p>{body}</p></article>)}</section><section className="marketplace-preview-note"><Icon name="info"/><div><b>الميزة تحت البناء</b><p>ما فيش دفع أو بيع فعلي توا. الصفحة تعرض الخطة باش المستخدمين يعرفوا شنو جاي.</p></div></section></section></main>}
