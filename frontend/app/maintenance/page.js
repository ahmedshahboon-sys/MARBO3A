import styles from "./maintenance.module.css";

export const metadata={title:"مربوعة قيد التحديث",robots:{index:false,follow:false}};

export default function MaintenancePage(){
  return <main className={styles.page}>
    <section className={styles.card} role="status" aria-live="polite">
      <div className={styles.mark} aria-hidden="true"/>
      <div className={styles.brand}>مربوعة · MARBO3A</div>
      <h1 className={styles.title}>قاعدين نحدّثوا الموقع 🛠️</h1>
      <p className={styles.message}>نجّهزوا نسخة أحدث من مربوعة. الموقع بيرجع تلقائيًا أول ما يكتمل التحديث ونتأكدوا إن كل الخدمات سليمة.</p>
      <p className={styles.eta}>عادةً الموضوع ياخذ دقائق قليلة.</p>
      <div className={styles.bar} aria-hidden="true"><span/></div>
      <div className={styles.hint}>مش محتاج تدير تحديث للصفحة — بنرجعوك للموقع تلقائيًا.</div>
    </section>
  </main>;
}
