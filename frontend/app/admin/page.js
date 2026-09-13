import Link from "next/link";
import AdminCenter from "./AdminCenter";
import styles from "./AdminPage.module.css";
export default function AdminPage(){return <><div className={styles.advancedEntry}><Link href="/admin/advanced">فتح Group O · الإدارة المتقدمة</Link></div><AdminCenter/></>}
