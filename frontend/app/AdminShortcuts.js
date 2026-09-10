"use client";
import {useEffect,useState} from "react";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
export default function AdminShortcuts(){const[ok,setOk]=useState(false);useEffect(()=>{const t=token();if(!t)return;fetch("/api/admin/stats",{headers:{authorization:`Bearer ${t}`}}).then(r=>setOk(r.ok)).catch(()=>setOk(false));},[]);if(!ok)return null;return <nav className="admin-shortcuts"><a href="/admin/reports">البلاغات</a><a href="/admin/system">السيرفر</a></nav>}
