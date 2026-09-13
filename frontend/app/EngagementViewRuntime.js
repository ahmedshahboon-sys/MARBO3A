"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";

const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";

export default function EngagementViewRuntime(){
 const path=usePathname();
 useEffect(()=>{
   const t=token();if(!t)return;
   const headers=t&&t!=="cookie"?{authorization:`Bearer ${t}`}:{},seen=new Set(),timers=new Map();
   const postView=(type,contentId)=>{const key=`${type}:${contentId}`;if(seen.has(key))return;seen.add(key);fetch("/api/engagement/views",{method:"POST",headers:{...headers,"content-type":"application/json"},credentials:"same-origin",keepalive:true,body:JSON.stringify({contentType:type,contentId})}).catch(()=>{})};
   const profile=path?.match(/^\/u\/([^/?#]+)/)?.[1];
   if(profile)fetch(`/api/social/profile/${encodeURIComponent(profile)}`,{headers,credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{const id=d?.profile?.id||d?.user?.id;if(id)postView("profile",Number(id))}).catch(()=>{});
   if(typeof IntersectionObserver==="undefined")return;
   const observer=new IntersectionObserver(entries=>{for(const entry of entries){const id=Number(entry.target.id?.replace(/^post-/,""));if(!id)continue;if(entry.isIntersecting&&entry.intersectionRatio>=.6){if(timers.has(entry.target))continue;timers.set(entry.target,setTimeout(()=>{timers.delete(entry.target);if(entry.target.isConnected)postView("post",id)},700))}else if(timers.has(entry.target)){clearTimeout(timers.get(entry.target));timers.delete(entry.target)}}},{threshold:[0,.6,1]});
   const observe=()=>document.querySelectorAll('[id^="post-"]').forEach(el=>{if(!el.dataset.mnViewObserved){el.dataset.mnViewObserved="1";observer.observe(el)}});
   observe();const mutations=new MutationObserver(observe);mutations.observe(document.body,{childList:true,subtree:true});
   return()=>{observer.disconnect();mutations.disconnect();for(const timer of timers.values())clearTimeout(timer)};
 },[path]);
 return null;
}
