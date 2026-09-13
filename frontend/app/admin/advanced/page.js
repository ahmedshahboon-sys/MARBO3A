import Link from "next/link";
import AdvancedAdmin from "./AdvancedAdmin";
export const metadata={title:"الإدارة المتقدمة"};
export default function AdvancedAdminPage(){return <><div className="advanced-admin-shortcuts" dir="rtl"><Link href="/admin/guests">سجل الزوار وGuest IDs</Link></div><AdvancedAdmin/></>}
