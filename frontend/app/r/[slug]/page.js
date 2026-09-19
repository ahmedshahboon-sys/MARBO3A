"use client";

import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import ShareQR from "../../ShareQR";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";

export default function PublicRoom(){
  const {slug}=useParams();const [room,setRoom]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
  useEffect(()=>{if(!slug)return;fetch(`/api/public/rooms/${encodeURIComponent(slug)}`,{cache:"no-store",credentials:"same-origin"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(d=>setRoom(d.room)).catch(()=>setError("الغرفة غير موجودة أو غير متاحة"));},[slug]);
  const url=typeof window!=="undefined"?window.location.href:`https://marbo3a.ly/r/${slug}`;
  async function openRoom(){if(!room||busy)return;const t=token();setBusy(true);setStatus("");try{if(!t){await fetch("/api/public/guest/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({path:`/guest/room/${room.id}`}),credentials:"same-origin"});location.href=`/guest/room/${room.id}`;return}const r=await fetch(`/api/rooms/${room.id}/join`,{method:"POST",headers:{authorization:`Bearer ${t}`},cache:"no-store",credentials:"same-origin"});const d=await r.json().catch(()=>({}));if(!r.ok&&!([200,201,409].includes(r.status)&&d.ok))throw new Error(d.error||"JOIN_FAILED");location.href=`/room/${room.id}/chat`}catch(e){setStatus(e.message==="ROOM_BANNED"?"أنت محظور من هذه الغرفة":e.message==="ROOM_FULL"?"الغرفة وصلت للحد الأقصى":"تعذر فتح الغرفة الآن");setBusy(false)}}
  return <main dir="rtl"><section className="public-card"><a className="public-brand" href="/"><img src="/brand/official/marbo3a-mark.png" alt="مربوعة"/><span>مربوعة</span></a>{!room&&!error&&<p>جاري تحميل الغرفة...</p>}{error&&<div className="notice error">{error}</div>}{room&&<>{room.image_url?<div className="public-room-share-cover" style={{backgroundImage:`url(${room.image_url})`}}/>:<div className="public-room-icon">#</div>}<h1>{room.name}</h1><p className="public-bio">{room.description}</p><div className="public-meta"><span>{room.members_count} عضو</span>{room.owner_username&&<span>المالك @{room.owner_username}</span>}</div><ShareQR url={url} title={`${room.name} على مربوعة`} label="مشاركة الغرفة"/>{status&&<div className="notice error" role="alert">{status}</div>}<button className="public-open" type="button" onClick={openRoom} disabled={busy}>{busy?"جاري الفتح...":token()?"فتح الغرفة في مربوعة":"دخول كزائر واستماع"}</button>{!token()&&<a className="public-room-register-link" href={`/?next=${encodeURIComponent(`/room/${room.id}/chat`)}#register`}>سجل حسابك لو تبي تكتب أو تتكلم</a>}</>}</section></main>;
}
