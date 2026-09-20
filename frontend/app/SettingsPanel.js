"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import useModalLayer from "./useModalLayer";
import Icon from "./Icon";
import AccountSecurityPanel from "./AccountSecurityPanel";
import PrivacySettingsPanel from "./PrivacySettingsPanel";
import {sessionMarker,cookieHeaders} from "./webSession";

const categoryLabels={
  dms:"الرسائل الخاصة",
  friend_requests:"طلبات الصداقة",
  comments:"التعليقات والردود",
  reactions:"التفاعلات",
  rooms:"الغرف",
  live:"البث المباشر",
  calls:"المكالمات",
  moderation_system:"الأمان والنظام"
};
const defaultCategories=Object.fromEntries(Object.keys(categoryLabels).map(k=>[k,true]));
const defaultSettings={
  theme:"dark",notifications_enabled:true,notification_sounds:true,language:"ar",
  notification_categories:defaultCategories,quiet_hours_enabled:false,quiet_hours_start:"22:00:00",
  quiet_hours_end:"07:00:00",quiet_hours_timezone:"Africa/Tripoli",autoplay_media:true,
  data_saver:false,reduced_motion:false,text_scale:1
};
const b64ToUint8=s=>{const pad="=".repeat((4-s.length%4)%4),raw=atob((s+pad).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))};
const timeValue=v=>String(v||"").slice(0,5)||"00:00";

function applyPreferences(settings){
  if(typeof document==="undefined")return;
  const theme=settings.theme||"dark";
  const actual=theme==="system"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):theme;
  document.documentElement.dataset.theme=actual;
  document.documentElement.dataset.themePreference=theme;
  document.documentElement.dataset.reducedMotion=settings.reduced_motion?"true":"false";
  document.documentElement.dataset.dataSaver=settings.data_saver?"true":"false";
  document.documentElement.dataset.autoplayMedia=settings.autoplay_media?"true":"false";
  const scale=Math.max(.85,Math.min(1.5,Number(settings.text_scale)||1));
  document.documentElement.style.fontSize=`${Math.round(scale*100)}%`;
  try{localStorage.setItem("marbo3a_theme",theme);localStorage.setItem("marbo3a_user_preferences",JSON.stringify({reducedMotion:Boolean(settings.reduced_motion),dataSaver:Boolean(settings.data_saver),autoplayMedia:Boolean(settings.autoplay_media),textScale:scale}))}catch{}
}
export default function SettingsPanel(){
  const path=usePathname(),settingsRef=useRef(null);
  const[open,setOpen]=useState(false),[tab,setTab]=useState("app");
  const[settings,setSettings]=useState(defaultSettings),[permission,setPermission]=useState("default");
  const[sessions,setSessions]=useState([]),[mutes,setMutes]=useState({mutedUsers:[],mutedConversations:[],hiddenWords:[]});
  const[pushEnabled,setPushEnabled]=useState(false),[status,setStatus]=useState(""),[hiddenWord,setHiddenWord]=useState("");
  const[deviceNames,setDeviceNames]=useState({}),[busy,setBusy]=useState("");
  async function api(url,options={}){
    sessionMarker();
    const headers=cookieHeaders(options.headers||{});
    if(options.body&&!(options.body instanceof FormData))headers["content-type"]="application/json";
    const r=await fetch(url,{...options,headers,cache:"no-store",credentials:"same-origin"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(d.error||"REQUEST_FAILED");e.status=r.status;e.data=d;throw e}
    return d;
  }
  function normalized(raw){return{...defaultSettings,...raw,notification_categories:{...defaultCategories,...(raw?.notification_categories||{})},text_scale:Number(raw?.text_scale)||1}}
  async function refreshMutes(){const d=await api("/api/settings/mutes");setMutes({mutedUsers:d.mutedUsers||[],mutedConversations:d.mutedConversations||[],hiddenWords:d.hiddenWords||[]})}
  async function refresh(){
    if(!sessionMarker())return;
    const[d,s,m,pc]=await Promise.allSettled([
      api("/api/settings"),api("/api/account/sessions"),api("/api/settings/mutes"),
      fetch("/api/push/config",{cache:"no-store",credentials:"same-origin"}).then(r=>r.ok?r.json():({enabled:false}))
    ]);
    if(d.status==="fulfilled"){const next=normalized(d.value.settings);setSettings(next);applyPreferences(next)}
    if(s.status==="fulfilled")setSessions(s.value.sessions||[]);
    if(m.status==="fulfilled")setMutes({mutedUsers:m.value.mutedUsers||[],mutedConversations:m.value.mutedConversations||[],hiddenWords:m.value.hiddenWords||[]});
    if(pc.status==="fulfilled")setPushEnabled(Boolean(pc.value.enabled));
    setPermission(typeof Notification!=="undefined"?Notification.permission:"unsupported");
  }
  useEffect(()=>{
    setPermission(typeof Notification!=="undefined"?Notification.permission:"unsupported");
    const fn=()=>{setOpen(true);refresh().catch(()=>setStatus("تعذر تحميل بعض الإعدادات"))};
    window.addEventListener("marbo3a:open-settings",fn);
    return()=>window.removeEventListener("marbo3a:open-settings",fn);
  },[]);
  useModalLayer(open&&path!=="/settings",{containerRef:settingsRef,onClose:()=>setOpen(false),kind:"dialog"});

  async function saveSettings(next){
    const previous=settings;setSettings(next);applyPreferences(next);setBusy("settings");
    try{
      const d=await api("/api/settings",{method:"PATCH",body:JSON.stringify({
        theme:next.theme,language:next.language,notificationsEnabled:Boolean(next.notifications_enabled),
        notificationSounds:Boolean(next.notification_sounds),notificationCategories:next.notification_categories,
        quietHours:{enabled:Boolean(next.quiet_hours_enabled),start:timeValue(next.quiet_hours_start),end:timeValue(next.quiet_hours_end),timezone:next.quiet_hours_timezone||"Africa/Tripoli"},
        autoplayMedia:Boolean(next.autoplay_media),dataSaver:Boolean(next.data_saver),
        reducedMotion:Boolean(next.reduced_motion),textScale:Number(next.text_scale)
      })});
      const saved=normalized(d.settings);setSettings(saved);applyPreferences(saved);setStatus("تم حفظ الإعدادات");
    }catch(e){setSettings(previous);applyPreferences(previous);setStatus(e.message==="INVALID_TIMEZONE"?"المنطقة الزمنية غير صالحة":"تعذر حفظ الإعدادات")}finally{setBusy("")}
  }
  async function subscribePush(){
    if(!pushEnabled)return setStatus("الإشعارات الفورية غير مجهزة على السيرفر");
    try{
      if(typeof Notification==="undefined"||!("serviceWorker" in navigator))throw new Error("UNSUPPORTED");
      const p=await Notification.requestPermission();setPermission(p);
      if(p!=="granted")return setStatus(p==="denied"?"الإشعارات محظورة من إعدادات المتصفح":"لم يتم السماح بالإشعارات");
      const cfg=await fetch("/api/push/config",{credentials:"same-origin"}).then(r=>r.json()),reg=await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToUint8(cfg.publicKey)});
      await api("/api/push/subscribe",{method:"POST",body:JSON.stringify({subscription:sub.toJSON()})});
      await saveSettings({...settings,notifications_enabled:true});setStatus("تم تفعيل الإشعارات الفورية");
    }catch(e){setStatus(`تعذر التفعيل: ${e.message}`)}
  }
  async function unmuteUser(id){try{await api(`/api/users/${id}/mute`,{method:"DELETE"});await refreshMutes();setStatus("تم إلغاء كتم الحساب")}catch{setStatus("تعذر إلغاء الكتم")}}
  async function unmuteConversation(id){try{await api(`/api/settings/muted-conversations/${id}`,{method:"DELETE"});await refreshMutes();setStatus("تم إلغاء كتم المحادثة")}catch{setStatus("تعذر إلغاء الكتم")}}
  async function addHiddenWord(e){e?.preventDefault();if(hiddenWord.trim().length<2)return;try{await api("/api/settings/hidden-words",{method:"POST",body:JSON.stringify({word:hiddenWord})});setHiddenWord("");await refreshMutes();setStatus("تمت إضافة الكلمة المخفية")}catch{setStatus("تعذر إضافة الكلمة")}}
  async function removeHiddenWord(id){try{await api(`/api/settings/hidden-words/${id}`,{method:"DELETE"});await refreshMutes()}catch{setStatus("تعذر حذف الكلمة")}}
  async function revokeSession(id){try{await api(`/api/account/sessions/${id}`,{method:"DELETE"});await refresh();setStatus("تم إنهاء الجلسة")}catch(e){setStatus(e.message)}}
  async function renameSession(id){const name=String(deviceNames[id]||"").trim();if(!name)return;try{await api(`/api/account/sessions/${id}`,{method:"PATCH",body:JSON.stringify({name})});setDeviceNames(x=>({...x,[id]:""}));await refresh();setStatus("تم حفظ اسم الجهاز")}catch(e){setStatus(e.message)}}
  async function logoutOthers(){try{await api("/api/account/logout-all",{method:"POST"});await refresh();setStatus("تم تسجيل الخروج من باقي الأجهزة")}catch(e){setStatus(e.message)}}
  async function exportData(){
    setBusy("export");
    try{
      const r=await fetch("/api/account/export",{headers:cookieHeaders(),credentials:"same-origin",cache:"no-store"});
      if(!r.ok)throw new Error("EXPORT_FAILED");
      const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
      const cd=r.headers.get("content-disposition")||"",match=cd.match(/filename="?([^"]+)"?/i);
      a.href=url;a.download=match?.[1]||"marbo3a-data.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus("تم تجهيز نسخة بياناتك");
    }catch{setStatus("تعذر تنزيل البيانات")}finally{setBusy("")}
  }
  const pushActive=pushEnabled&&permission==="granted";
  if(!open)return null;
  return <div className="settings-overlay" onMouseDown={e=>e.target===e.currentTarget&&setOpen(false)}>
    <section ref={settingsRef} className="settings-card settings-large" role={path==="/settings"?undefined:"dialog"} aria-modal={path==="/settings"?undefined:true} aria-label={path==="/settings"?undefined:"إعدادات مربوعة"} tabIndex={path==="/settings"?undefined:-1}>
      <header><div><small>إعدادات مربوعة</small><h3>الحساب والتطبيق</h3></div><button type="button" onClick={()=>setOpen(false)} aria-label="إغلاق"><Icon name="close"/></button></header>
      <nav className="settings-tabs" aria-label="أقسام الإعدادات">
        {[["app","التطبيق"],["notifications","الإشعارات"],["privacy","الخصوصية"],["security","الأمان"],["sessions","الأجهزة"],["data","بياناتي"]].map(([key,label])=><button type="button" key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}
      </nav>

      {tab==="app"&&<div className="settings-section">
        <div className="setting-row"><div><b>المظهر</b><span>شكل مربوعة على جهازك</span></div><select aria-label="المظهر" value={settings.theme} disabled={busy==="settings"} onChange={e=>saveSettings({...settings,theme:e.target.value})}><option value="dark">داكن</option><option value="light">فاتح</option><option value="system">حسب الجهاز</option></select></div>
        <div className="setting-row"><div><b>تشغيل الوسائط تلقائيًا</b><span>الفيديو والوسائط المتحركة عند الظهور</span></div><input aria-label="تشغيل الوسائط تلقائيًا" type="checkbox" checked={settings.autoplay_media} onChange={e=>saveSettings({...settings,autoplay_media:e.target.checked})}/></div>
        <div className="setting-row"><div><b>توفير البيانات</b><span>يوقف التشغيل التلقائي ويقلل تحميل الوسائط غير الضرورية</span></div><input aria-label="توفير البيانات" type="checkbox" checked={settings.data_saver} onChange={e=>saveSettings({...settings,data_saver:e.target.checked,autoplay_media:e.target.checked?false:settings.autoplay_media})}/></div>
        <div className="setting-row"><div><b>تقليل الحركة</b><span>يخفف الانتقالات والمؤثرات المتحركة</span></div><input aria-label="تقليل الحركة" type="checkbox" checked={settings.reduced_motion} onChange={e=>saveSettings({...settings,reduced_motion:e.target.checked})}/></div>
        <div className="setting-row"><div><b>حجم النص</b><span>{Math.round(Number(settings.text_scale)*100)}%</span></div><select aria-label="حجم النص" value={String(settings.text_scale)} onChange={e=>saveSettings({...settings,text_scale:Number(e.target.value)})}><option value="0.85">85%</option><option value="1">100%</option><option value="1.15">115%</option><option value="1.3">130%</option><option value="1.5">150%</option></select></div>
        <div className="settings-links"><a href="/settings/permissions">أذونات الجهاز</a><a href="/map">الخريطة</a><a href="/privacy">سياسة الخصوصية</a><a href="/terms">شروط الاستخدام</a></div>
      </div>}

      {tab==="notifications"&&<div className="settings-section">
        <div className="setting-row"><div><b>الإشعارات</b><span>{settings.notifications_enabled?"مفعلة":"موقوفة"}</span></div><input aria-label="تفعيل الإشعارات" type="checkbox" checked={settings.notifications_enabled} onChange={e=>saveSettings({...settings,notifications_enabled:e.target.checked})}/></div>
        <div className="setting-row"><div><b>الإشعارات الفورية على هذا الجهاز</b><span>{!pushEnabled?"غير مجهزة على السيرفر":pushActive?"مفعلة":permission==="denied"?"محظورة من المتصفح":"جاهزة للتفعيل"}</span></div><button className="setting-action" type="button" disabled={!pushEnabled||pushActive||permission==="denied"} onClick={subscribePush}>{!pushEnabled?"غير متاحة":pushActive?"مفعلة":permission==="denied"?"محظورة":"تفعيل"}</button></div>
        <div className="setting-row"><div><b>صوت الإشعارات</b></div><input aria-label="صوت الإشعارات" type="checkbox" checked={settings.notification_sounds} onChange={e=>saveSettings({...settings,notification_sounds:e.target.checked})}/></div>
        <div className="feature-block"><h3>أنواع الإشعارات</h3>{Object.entries(categoryLabels).map(([key,label])=><div className="setting-row" key={key}><div><b>{label}</b></div><input aria-label={label} type="checkbox" checked={settings.notification_categories[key]!==false} onChange={e=>saveSettings({...settings,notification_categories:{...settings.notification_categories,[key]:e.target.checked}})}/></div>)}</div>
        <div className="feature-block"><h3>ساعات الهدوء</h3>
          <div className="setting-row"><div><b>تفعيل ساعات الهدوء</b><span>تبقى الأحداث في مركز الإشعارات، لكن لا يطلع Push أو صوت خلال الفترة</span></div><input aria-label="ساعات الهدوء" type="checkbox" checked={settings.quiet_hours_enabled} onChange={e=>saveSettings({...settings,quiet_hours_enabled:e.target.checked})}/></div>
          <div className="setting-row"><div><b>من</b></div><input aria-label="بداية ساعات الهدوء" type="time" value={timeValue(settings.quiet_hours_start)} onChange={e=>saveSettings({...settings,quiet_hours_start:e.target.value+":00"})}/></div>
          <div className="setting-row"><div><b>إلى</b></div><input aria-label="نهاية ساعات الهدوء" type="time" value={timeValue(settings.quiet_hours_end)} onChange={e=>saveSettings({...settings,quiet_hours_end:e.target.value+":00"})}/></div>
          <div className="setting-row"><div><b>المنطقة الزمنية</b><span>{settings.quiet_hours_timezone}</span></div><button type="button" className="setting-action" onClick={()=>saveSettings({...settings,quiet_hours_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Africa/Tripoli"})}>استخدام منطقة الجهاز</button></div>
        </div>
        <div className="feature-block"><h3>الكتم والكلمات المخفية</h3>
          <form className="settings-inline-form" onSubmit={addHiddenWord}><input aria-label="كلمة مخفية" value={hiddenWord} maxLength={60} onChange={e=>setHiddenWord(e.target.value)} placeholder="أضف كلمة أو عبارة"/><button disabled={hiddenWord.trim().length<2}>إضافة</button></form>
          {mutes.hiddenWords.map(w=><div className="setting-row" key={w.id}><div><b>{w.word}</b><span>الكلمات المطابقة تمنع إشعار الحدث</span></div><button type="button" className="setting-action" onClick={()=>removeHiddenWord(w.id)}>حذف</button></div>)}
          {mutes.mutedUsers.map(x=><div className="setting-row" key={x.user_id}><div><b>{x.display_name||x.username}</b><span>@{x.username} — إشعارات هذا الحساب مكتومة</span></div><button type="button" className="setting-action" onClick={()=>unmuteUser(x.user_id)}>إلغاء الكتم</button></div>)}
          {mutes.mutedConversations.map(x=><div className="setting-row" key={x.conversation_id}><div><b>{x.display_name||x.username}</b><span>إشعارات المحادثة مكتومة</span></div><button type="button" className="setting-action" onClick={()=>unmuteConversation(x.conversation_id)}>إلغاء الكتم</button></div>)}
          {!mutes.hiddenWords.length&&!mutes.mutedUsers.length&&!mutes.mutedConversations.length&&<p className="settings-empty">ما عندكش عناصر مكتومة حاليًا.</p>}
        </div>
      </div>}

      {tab==="privacy"&&<PrivacySettingsPanel onStatus={setStatus}/>}
      {tab==="security"&&<AccountSecurityPanel onChanged={()=>refresh().catch(()=>{})}/>}

      {tab==="sessions"&&<div className="settings-section">
        <div className="session-head"><p>الجلسات النشطة. تقدر تسمي الجهاز باسم مفهوم لك وتنهي أي جلسة ثانية.</p><button type="button" onClick={logoutOthers}>خروج من باقي الأجهزة</button></div>
        <div className="session-list">{sessions.map(s=><article key={s.id}><div><b>{s.device_name|| (s.current?"هذا الجهاز":"جهاز غير مسمى")}</b><span>{s.user_agent||"جهاز غير معروف"}</span><small>{s.ip_address||"IP غير متاح"} • آخر نشاط {new Date(s.last_seen).toLocaleString("ar-LY")}</small><div className="settings-inline-form"><input aria-label={`اسم الجهاز ${s.id}`} maxLength={60} placeholder="مثال: هاتفي سامسونج" value={deviceNames[s.id]||""} onChange={e=>setDeviceNames(x=>({...x,[s.id]:e.target.value}))}/><button type="button" disabled={!String(deviceNames[s.id]||"").trim()} onClick={()=>renameSession(s.id)}>حفظ الاسم</button></div></div>{!s.current&&<button type="button" onClick={()=>revokeSession(s.id)}>إنهاء</button>}</article>)}</div>
      </div>}

      {tab==="data"&&<div className="settings-section">
        <div className="settings-form"><h4>تنزيل بياناتي</h4><p>ينزّل ملف JSON ببيانات حسابك ومحتواك وإعداداتك وعلاقاتك وسجل إشعاراتك. لا يحتوي كلمة المرور أو رموز الجلسات أو أسرار الأمان.</p><button type="button" disabled={busy==="export"} onClick={exportData}>{busy==="export"?"جاري التجهيز...":"تنزيل نسخة من بياناتي"}</button></div>
        <div className="settings-form"><h4>تعطيل أو حذف الحساب</h4><p><b>التعطيل</b> يخفي الحساب وينهي الجلسة، وتقدر ترجعه بتسجيل دخول صحيح. <b>الحذف</b> يُجدول بعد 7 أيام وتقدر تلغيه قبل الموعد.</p><button type="button" className="setting-action" onClick={()=>setTab("security")}>فتح إعدادات الأمان</button></div>
      </div>}
      {status&&<div className="settings-status" role="status" onClick={()=>setStatus("")}>{status}</div>}
    </section>
  </div>;
}
