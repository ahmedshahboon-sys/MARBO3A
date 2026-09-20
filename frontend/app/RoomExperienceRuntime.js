"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";
import Icon from "./Icon";

const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
async function api(path,options={}){const t=token(),headers={...(options.headers||{})};if(t&&t!=="cookie")headers["x-marbo3a-session-mode"]="cookie";if(options.body)headers["content-type"]="application/json";const r=await fetch(path,{...options,headers,credentials:"same-origin",cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}

export default function RoomExperienceRuntime(){
 const path=usePathname(),roomId=useMemo(()=>path?.match(/^\/room\/(\d+)\/chat/)?.[1]||null,[path]),[actionsHost,setActionsHost]=useState(null),[streamHost,setStreamHost]=useState(null),[events,setEvents]=useState([]),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 useEffect(()=>{if(!roomId){setActionsHost(null);setStreamHost(null);setEvents([]);return}let observer;const sync=()=>{setActionsHost(document.querySelector(".room-community-actions"));setStreamHost(document.querySelector(".room-community-stream"))};sync();observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[roomId]);
 useEffect(()=>{if(!roomId)return;const onMember=e=>{const d=e?.detail||{};if(String(d.roomId)!==String(roomId))return;setEvents(x=>[...x,{id:`${d.kind}-${d.userId}-${Date.now()}`,message:d.message||`${d.displayName||d.username||"مستخدم"} ${d.kind==="leave"?"غادر الغرفة":"انضم للغرفة"}`,createdAt:d.createdAt||new Date().toISOString()}].slice(-30));requestAnimationFrame(()=>{const el=document.querySelector(".room-community-stream");el?.scrollTo({top:el.scrollHeight,behavior:"smooth"})})};window.addEventListener("marbo3a:room:member-event",onMember);return()=>window.removeEventListener("marbo3a:room:member-event",onMember)},[roomId]);
 async function leave(){if(!roomId||busy)return;setBusy(true);setStatus("");try{await api(`/api/rooms/${roomId}/leave`,{method:"POST"});location.href="/rooms"}catch(e){setStatus(e.message==="OWNER_CANNOT_LEAVE"?"مسؤول الغرفة ما يقدرش يغادر قبل نقل الملكية أو حذف الغرفة":"تعذر مغادرة الغرفة الآن")}finally{setBusy(false)}}
 if(!roomId)return null;
 return <>{actionsHost?createPortal(<><button type="button" className="room-leave-action" disabled={busy} onClick={leave} aria-label="مغادرة الغرفة"><Icon name="close"/><span>{busy?"جاري...":"مغادرة"}</span></button>{status&&<span className="room-leave-status">{status}</span>}</>,actionsHost):null}{streamHost&&events.length?createPortal(<div className="room-system-events" aria-live="polite">{events.map(e=><div key={e.id} className="room-system-event"><span>{e.message}</span><small>{new Date(e.createdAt).toLocaleTimeString("ar-LY",{hour:"2-digit",minute:"2-digit"})}</small></div>)}</div>,streamHost):null}</>;
}
