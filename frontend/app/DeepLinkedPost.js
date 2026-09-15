"use client";
import {useEffect,useState} from "react";
import {PostCard} from "./SocialFeed";

const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
async function api(path){const t=token(),headers=t&&t!=="cookie"?{authorization:`Bearer ${t}`}:{},r=await fetch(path,{headers,credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}

export default function DeepLinkedPost(){
 const[post,setPost]=useState(null),[me,setMe]=useState(null),[error,setError]=useState("");
 useEffect(()=>{if(typeof window==="undefined")return;const id=Number(new URLSearchParams(window.location.search).get("post"));if(!Number.isSafeInteger(id)||id<=0)return;let alive=true;Promise.all([api(`/api/feed/${id}`),api("/api/auth/me")]).then(([p,m])=>{if(!alive)return;setPost(p.post||null);setMe(m.user||null);requestAnimationFrame(()=>document.getElementById("notification-target-post")?.scrollIntoView({behavior:"smooth",block:"center"}))}).catch(e=>alive&&setError(e.message==="POST_NOT_FOUND"?"المنشور المرتبط بالتنبيه لم يعد موجودًا":"تعذر فتح المنشور المرتبط بالتنبيه"));return()=>{alive=false}},[]);
 if(!post&&!error)return null;
 return <section id="notification-target-post" className="notification-target-post" aria-live="polite">{error?<div className="sf-alert">{error}</div>:<PostCard post={post} me={me} autoOpen onChanged={setPost} onRemoved={()=>setPost(null)} onError={setError}/>}</section>
}
