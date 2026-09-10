"use client";

import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import ShareQR from "../../ShareQR";

export default function PublicRoom(){
  const {slug}=useParams();const [room,setRoom]=useState(null),[error,setError]=useState("");
  useEffect(()=>{if(!slug)return;fetch(`/api/public/rooms/${encodeURIComponent(slug)}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(d=>setRoom(d.room)).catch(()=>setError("الغرفة غير موجودة أو غير متاحة"));},[slug]);
  const url=typeof window!=="undefined"?window.location.href:`https://marbo3a.ly/r/${slug}`;
  return <main dir="rtl"><section className="public-card"><a className="public-brand" href="/"><img src="/logo.svg" alt="مربوعة"/><span>مربوعة</span></a>{!room&&!error&&<p>جاري تحميل الغرفة...</p>}{error&&<div className="notice error">{error}</div>}{room&&<><div className="public-room-icon">#</div><h1>{room.name}</h1><p className="public-bio">{room.description}</p><div className="public-meta"><span>{room.members_count} عضو</span>{room.owner_username&&<span>المالك @{room.owner_username}</span>}</div><ShareQR url={url} title={`${room.name} على مربوعة`} label="مشاركة الغرفة"/><a className="public-open" href={`/?room=${encodeURIComponent(room.slug)}`}>فتح الغرفة في مربوعة</a></>}</section></main>;
}
