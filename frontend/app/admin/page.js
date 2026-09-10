"use client";
import {useEffect,useMemo,useState} from "react";
import Icon from "../Icon";

const tok=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
async function api(p,o={}){const r=await fetch(p,{...o,headers:{...(o.headers||{}),authorization:`Bearer ${tok()}`,...(o.body?{"content-type":"application/json"}:{})},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}

export default function AdminPage(){
  const[stats,setStats]=useState(null),[err,setErr]=useState(""),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false);
  async function load(silent=false){
    if(!silent)setRefreshing(true);
    try{const d=await api('/api/admin/stats');setStats(d.stats);setErr('')}
    catch(e){setErr(e.message==='ADMIN_ONLY'?'هذه الصفحة للأدمن فقط':e.message==='UNAUTHORIZED'?'انتهت جلسة الدخول':'تعذر تحميل لوحة الإدارة')}
    finally{setLoading(false);setRefreshing(false)}
  }
  useEffect(()=>{if(!tok()){location.href='/';return}load();const t=setInterval(()=>{if(document.visibilityState==='visible')load(true)},15000);return()=>clearInterval(t)},[]);
  const cards=useMemo(()=>stats?[["متصلون الآن",stats.onlineUsers],["الزوار الآن",stats.onlineVisitors],["زوار اليوم",stats.visitorsToday],["المسجلون",stats.registeredUsers],["نشطون 24س",stats.activeUsers24h],["جدد اليوم",stats.newUsersToday],["الغرف",stats.rooms],["غرف نشطة",stats.activeRooms24h],["الرسائل",stats.messages],["أخطاء اليوم",stats.errorsToday],["مجمّدون",stats.frozen],["محظورون",stats.banned]]:[],[stats]);
  function openAdvanced(){const btn=document.querySelector('.admin-fab');if(btn)btn.click();else setErr('تعذر فتح مركز الإدارة المتقدم')}

  return <main className="debug-admin-page admin-route-page" dir="rtl">
    <header><div><small>SUPER ADMIN · @ahmed</small><h1>مركز إدارة مربوعة</h1><p>الإحصائيات والمراقبة والحسابات والغرف والبث والديباق من مكان واحد.</p></div><a href="/home">الرجوع لمربوعة</a></header>
    {err&&<div className="debug-error">{err}</div>}
    {loading&&!err&&<div className="debug-empty">جاري تحميل لوحة الإدارة...</div>}
    {stats&&<>
      <section className="admin-route-actions">
        <button onClick={openAdvanced}><Icon name="settings"/><b>الإدارة المتقدمة</b><span>الحسابات، التجميد والحظر، الغرف، البث، Audit وDebug</span></button>
        <a href="/admin/debug"><Icon name="settings"/><b>الديباق الحي</b><span>الجلسات، الأخطاء، API والتراكب</span></a>
        <button onClick={()=>load()} disabled={refreshing}><Icon name="refresh"/><b>{refreshing?"جاري التحديث...":"تحديث البيانات"}</b><span>إعادة قراءة الإحصائيات بدون إعادة تحميل الصفحة</span></button>
      </section>
      <section className="debug-summary admin-route-stats">{cards.map(([l,v])=><div key={l}><b>{Number(v||0).toLocaleString('en-US')}</b><span>{l}</span></div>)}</section>
      <section className="admin-route-links"><a href="/admin/debug">فتح سجل جلسات الديباق</a><a href="/admin/readiness">فحص جاهزية V1</a><a href="/search">البحث في مربوعة</a><a href="/rooms">مراجعة الغرف</a><a href="/messages">مراجعة الرسائل</a><a href="/home">الرئيسية</a></section>
    </>}
  </main>;
}
