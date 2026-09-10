"use client";

import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import ShareQR from "../../ShareQR";

export default function PublicUser(){
  const {username}=useParams();const [user,setUser]=useState(null),[error,setError]=useState("");
  useEffect(()=>{if(!username)return;fetch(`/api/public/users/${encodeURIComponent(username)}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}).then(d=>setUser(d.user)).catch(()=>setError("الحساب غير موجود أو غير متاح"));},[username]);
  const url=typeof window!=="undefined"?window.location.href:`https://marbo3a.ly/u/${username}`;
  return <main dir="rtl"><section className="public-card"><a className="public-brand" href="/"><img src="/logo.svg" alt="مربوعة"/><span>مربوعة</span></a>{!user&&!error&&<p>جاري تحميل الحساب...</p>}{error&&<div className="notice error">{error}</div>}{user&&<><div className="public-avatar">{user.display_name?.[0]||"م"}</div><h1>{user.display_name}</h1><p className="public-username">@{user.username}</p>{user.bio&&<p className="public-bio">{user.bio}</p>}<small>عضو منذ {new Date(user.created_at).toLocaleDateString("ar-LY")}</small><ShareQR url={url} title={`${user.display_name} على مربوعة`} label="مشاركة الحساب"/><a className="public-open" href={`/?profile=${encodeURIComponent(user.username)}`}>فتح في مربوعة</a></>}</section></main>;
}
