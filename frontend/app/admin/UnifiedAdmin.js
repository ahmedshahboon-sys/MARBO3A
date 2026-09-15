"use client";
import {useState} from "react";
import AdminCenter from "./AdminCenter";
import AdvancedAdmin from "./advanced/AdvancedAdmin";
import AdminGuests from "./guests/page";
import RoomRailAdmin from "./RoomRailAdmin";
import DeletedPostsAdmin from "./DeletedPostsAdmin";

export default function UnifiedAdmin(){
 const[section,setSection]=useState("center");
 return <main className="unified-admin" dir="rtl">
  <header className="unified-admin-head"><div><small>MARBO3A CONTROL CENTER</small><h1>لوحة تحكم مربوعة</h1><p>الإحصائيات والإدارة المتقدمة ومراجعة المحتوى وسجل الزوار وإدارة شريط الغرف في مكان واحد.</p></div></header>
  <nav className="admin-tabs unified-admin-tabs" aria-label="أقسام لوحة التحكم">
   <button type="button" className={section==="center"?"active":""} onClick={()=>setSection("center")}>الحالة والتحكم</button>
   <button type="button" className={section==="advanced"?"active":""} onClick={()=>setSection("advanced")}>الإدارة المتقدمة</button>
   <button type="button" className={section==="deleted"?"active":""} onClick={()=>setSection("deleted")}>المنشورات المحذوفة</button>
   <button type="button" className={section==="rooms"?"active":""} onClick={()=>setSection("rooms")}>شريط الغرف</button>
   <button type="button" className={section==="guests"?"active":""} onClick={()=>setSection("guests")}>سجل الزوار وGuest IDs</button>
  </nav>
  <section className="unified-admin-body">{section==="center"?<AdminCenter/>:section==="advanced"?<AdvancedAdmin/>:section==="deleted"?<DeletedPostsAdmin/>:section==="rooms"?<RoomRailAdmin/>:<AdminGuests/>}</section>
 </main>
}
