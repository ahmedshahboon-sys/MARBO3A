"use client";
import {useEffect,useState} from "react";
import {cookieHeaders,sessionMarker} from "./webSession";

const defaults={
  who_can_message:"friends",who_can_add:"everyone",show_last_seen:true,show_city:true,
  birth_visibility:"age",who_can_see_posts:"everyone",who_can_see_story:"everyone",
  who_can_reply_story:"friends",who_can_call:"friends",who_can_see_friends:"friends",
  who_can_invite_room:"friends",show_online:true,read_receipts:true,
  message_requests_enabled:true,who_can_mention:"friends",who_can_tag:"friends"
};
const audience=[
  ["everyone","الجميع"],["friends","الأصدقاء"],["friends_of_friends","أصدقاء الأصدقاء"],["nobody","لا أحد"]
];
const messageAudience=[["everyone","الجميع"],["friends","الأصدقاء"],["nobody","لا أحد"]];

async function api(path,options={}){
  sessionMarker();
  const headers=cookieHeaders(options.headers||{});
  if(options.body)headers["content-type"]="application/json";
  const r=await fetch(path,{...options,headers,credentials:"same-origin",cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");
  return d;
}
export default function PrivacySettingsPanel({onStatus}){
  const[p,setP]=useState(defaults),[saving,setSaving]=useState(false),[localStatus,setLocalStatus]=useState("");
  const status=message=>{setLocalStatus(message);onStatus?.(message)};
  useEffect(()=>{api("/api/privacy").then(d=>setP({...defaults,...d.privacy})).catch(()=>status("تعذر تحميل إعدادات الخصوصية"))},[]);
  async function save(next){
    if(saving)return;
    const previous=p;setP(next);setSaving(true);status("جاري الحفظ...");
    try{
      const d=await api("/api/privacy",{method:"PATCH",body:JSON.stringify({
        whoCanMessage:next.who_can_message,whoCanAdd:next.who_can_add,
        showLastSeen:next.show_last_seen,showCity:next.show_city,
        birthVisibility:next.birth_visibility,whoCanSeePosts:next.who_can_see_posts,
        whoCanSeeStory:next.who_can_see_story,whoCanReplyStory:next.who_can_reply_story,
        whoCanCall:next.who_can_call,whoCanSeeFriends:next.who_can_see_friends,
        whoCanInviteRoom:next.who_can_invite_room,showOnline:next.show_online,
        readReceipts:next.read_receipts,messageRequestsEnabled:next.message_requests_enabled,
        whoCanMention:next.who_can_mention,whoCanTag:next.who_can_tag
      })});
      setP({...defaults,...d.privacy});status("تم حفظ الخصوصية");
    }catch{setP(previous);status("تعذر حفظ الخصوصية")}finally{setSaving(false)}
  }
  const select=(key,label,items=audience)=><div className="setting-row"><div><b>{label}</b></div><select aria-label={label} disabled={saving} value={p[key]} onChange={e=>save({...p,[key]:e.target.value})}>{items.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></div>;
  const toggle=(key,label,desc)=><div className="setting-row"><div><b>{label}</b>{desc&&<span>{desc}</span>}</div><input aria-label={label} type="checkbox" disabled={saving} checked={Boolean(p[key])} onChange={e=>save({...p,[key]:e.target.checked})}/></div>;
  return <div className="privacy-settings-panel" aria-busy={saving}>
    <div className="feature-block"><h3>التواصل</h3>
      {select("who_can_add","من يقدر يضيفك")}
      {select("who_can_message","من يقدر يراسلك",messageAudience)}
      {toggle("message_requests_enabled","طلبات المراسلة","رسائل غير الأصدقاء تدخل لصندوق الطلبات بدل المحادثات الرئيسية")}
      {select("who_can_call","من يقدر يتصل بك")}
      {select("who_can_invite_room","من يقدر يدعوك لغرفة")}
      {select("who_can_mention","من يقدر يذكرك")}
      {select("who_can_tag","من يقدر يعمل لك Tag")}
    </div>
    <div className="feature-block"><h3>المحتوى والظهور</h3>
      {select("who_can_see_posts","من يشوف منشوراتك")}
      {select("who_can_see_story","من يشوف الستوري")}
      {select("who_can_reply_story","من يرد على الستوري")}
      {select("who_can_see_friends","من يشوف قائمة أصحابك")}
      {toggle("show_online","إظهار أنك متصل الآن")}
      {toggle("show_last_seen","إظهار آخر ظهور")}
      {toggle("show_city","إظهار المدينة")}
      {toggle("read_receipts","إيصالات القراءة","إظهار حالة قراءة الرسائل بعد قبول المحادثة")}
    </div>
    <div className="feature-block"><h3>العمر وتاريخ الميلاد</h3>
      <div className="setting-row"><div><b>المعلومات الظاهرة</b></div><select aria-label="إظهار تاريخ الميلاد والعمر" disabled={saving} value={p.birth_visibility} onChange={e=>save({...p,birth_visibility:e.target.value})}><option value="full">تاريخ الميلاد + العمر</option><option value="age">العمر فقط</option><option value="hidden">إخفاء الاثنين</option></select></div>
    </div>
    {localStatus&&<div className="settings-status" role="status">{localStatus}</div>}
  </div>;
}
