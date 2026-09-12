import Link from "next/link";
import Icon from "../Icon";

export const metadata={
  title:"حول مربوعة",
  description:"تعرف على مشروع مربوعة – MARBO3A، منصة تواصل اجتماعي عربية حديثة.",
  alternates:{canonical:"/about"}
};

export default function AboutPage(){
  return <main className="about-page" dir="rtl">
    <section className="about-shell">
      <header className="about-hero">
        <img src="/brand/marbo3a-symbol-orange.svg" alt="شعار مربوعة"/>
        <div><h1>مربوعة</h1><b>MARBO3A</b><p>ناسنا .. حكاياتنا .. دايمًا مع بعض</p></div>
      </header>

      <section className="about-card">
        <span className="about-card-icon"><Icon name="info"/></span>
        <div><h2>حول الموقع</h2><p>مربوعة منصة تواصل اجتماعي عربية حديثة، موجهة أساسًا للمجتمع الليبي والعربي، وتجمع المنشورات والأصحاب والرسائل الخاصة والغرف والمكالمات في تجربة واحدة تعمل على الهاتف والكمبيوتر كتطبيق ويب تقدمي PWA.</p></div>
      </section>

      <section className="about-grid">
        <article><small>اسم المشروع</small><strong>مربوعة – MARBO3A</strong></article>
        <article><small>صاحب المشروع</small><strong>أحمد شهبون</strong><span>Ahmed Shahboun</span></article>
        <article><small>الموقع الرسمي</small><strong><bdi dir="ltr">marbo3a.ly</bdi></strong></article>
        <article><small>نوع المنصة</small><strong>شبكة تواصل اجتماعي عربية</strong></article>
      </section>

      <section className="about-card about-features">
        <span className="about-card-icon"><Icon name="users"/></span>
        <div><h2>شن تقدّم مربوعة؟</h2><p>منشورات وصور وفيديو، أصدقاء وطلبات صداقة، رسائل خاصة وملاحظات صوتية، غرف اجتماعية وصوت مباشر، مكالمات صوت وفيديو، إشعارات، خصوصية، وأدوات إدارة وأمان.</p></div>
      </section>

      <section className="about-links" aria-label="روابط قانونية">
        <Link href="/privacy"><Icon name="lock"/><span>سياسة الخصوصية</span></Link>
        <Link href="/terms"><Icon name="info"/><span>شروط الاستخدام</span></Link>
        <Link href="/"><Icon name="home"/><span>العودة لمربوعة</span></Link>
      </section>

      <footer className="about-footer"><span>© 2026 مربوعة – MARBO3A</span><small>مشروع أحمد شهبون</small></footer>
    </section>
  </main>
}
