"use client";
import {useEffect,useMemo,useState} from "react";
import {createPortal} from "react-dom";
import {usePathname} from "next/navigation";
import Icon from "./Icon";

const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
const roomFromPath=p=>Number(String(p||"").match(/^\/room\/(\d+)\/chat$/)?.[1]||0)||null;
async function api(path,options={}){const t=token(),headers={...(options.headers||{}),...(t&&t!=="cookie"?{"x-marbo3a-session-mode":"cookie"}:{})};if(options.body)headers["content-type"]="application/json";const r=await fetch(path,{...options,headers,credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}

export default function RoomVoiceR1Runtime(){
  const pathname=usePathname(),roomId=useMemo(()=>roomFromPath(pathname),[pathname]);
  const[host,setHost]=useState(null),[state,setState]=useState(null),[open,setOpen]=useState(false),[status,setStatus]=useState("");

  useEffect(()=>{let prev=Number(sessionStorage.getItem("marbo3a_voice_room")||0)||null;if(prev&&prev!==roomId&&token()){
    try{fetch(`/api/rooms/${prev}/voice/leave`,{method:"POST",headers:{"x-marbo3a-session-mode":"cookie","content-type":"application/json"},body:JSON.stringify({beforeMs:Date.now()}),credentials:"same-origin",keepalive:true}).catch(()=>{})}catch{}
    document.querySelectorAll(".room-voice-remote-audio").forEach(a=>{try{a.pause();a.srcObject=null;a.remove()}catch{}})
  }
  if(roomId)sessionStorage.setItem("marbo3a_voice_room",String(roomId));else sessionStorage.removeItem("marbo3a_voice_room");
  },[roomId]);

  useEffect(()=>{if(!roomId)return;const sync=()=>setHost(document.querySelector(".room-voice-host"));sync();const id=setInterval(sync,700),resume=()=>{if(document.visibilityState!=="visible")return;document.querySelectorAll(".room-voice-remote-audio").forEach(a=>a.play?.().catch(()=>{}))};document.addEventListener("visibilitychange",resume);window.addEventListener("pageshow",resume);return()=>{clearInterval(id);document.removeEventListener("visibilitychange",resume);window.removeEventListener("pageshow",resume)}},[roomId]);

  useEffect(()=>{if(!roomId||!token())return;let alive=true;const load=()=>api(`/api/rooms/${roomId}/voice/state`).then(d=>alive&&setState(d)).catch(()=>{});load();const id=setInterval(load,4000),refresh=e=>{if(Number(e.detail?.roomId)===Number(roomId))load()};window.addEventListener("marbo3a:roomvoice:state",refresh);return()=>{alive=false;clearInterval(id);window.removeEventListener("marbo3a:roomvoice:state",refresh)}},[roomId]);

  if(!roomId||!host||!state?.manager)return null;
  const locked=new Set((state.lockedSeats||[]).map(Number)),people=(state.participants||[]).filter(p=>Number(p.user_id)!==Number(state.viewerId));
  async function moderate(userId,action,guest=false){setStatus("");try{if(action==="kick"&&guest)await api(`/api/rooms/${roomId}/voice/kick`,{method:"POST",body:JSON.stringify({userId:Number(userId)})});else await api(`/api/rooms/${roomId}/voice/moderate`,{method:"POST",body:JSON.stringify({userId:Number(userId),action})});setStatus("تم تنفيذ الإجراء");setState(await api(`/api/rooms/${roomId}/voice/state`))}catch(e){setStatus(e.message==="FORBIDDEN"?"ما عندكش صلاحية":"تعذر تنفيذ الإجراء")}}
  async function seatLock(index){setStatus("");try{await api(`/api/rooms/${roomId}/voice/seats/${index}`,{method:"PUT",body:JSON.stringify({locked:!locked.has(index)})});setState(await api(`/api/rooms/${roomId}/voice/state`))}catch{setStatus("تعذر تغيير حالة الكرسي")}}
  const panel=<section className="r1-voice-admin"><button className="r1-voice-admin-toggle" type="button" onClick={()=>setOpen(v=>!v)}><Icon name="settings" size={16}/><span>إدارة الصوت</span><b>{open?"−":"+"}</b></button>{open&&<div className="r1-voice-admin-body"><div className="r1-seat-locks"><b>الكراسي</b><div>{Array.from({length:Number(state.seatCount||8)},(_,i)=>i+1).map(i=><button type="button" key={i} className={locked.has(i)?"locked":""} onClick={()=>seatLock(i)}><Icon name={locked.has(i)?"lock":"plusCircle"} size={15}/><span>{i}</span></button>)}</div><small>اضغط على رقم الكرسي لقفله أو فتحه.</small></div><div className="r1-voice-people"><b>الموجودون في الصوت</b>{people.map(p=><article key={p.user_id}><span>{p.avatar_url?<img src={p.avatar_url} alt=""/>:<i>{String(p.display_name||p.username||"ز")[0]}</i>}<em>{p.display_name||p.username||`زائر ${Math.abs(Number(p.user_id))}`}</em><small>{p.role==="speaker"?`متحدث · كرسي ${p.seat_index||"-"}`:"مستمع"}</small></span><div>{!p.guest&&<button type="button" onClick={()=>moderate(p.user_id,p.forced_muted?"unmute":"mute")}><Icon name={p.forced_muted?"mic":"micOff"} size={15}/>{p.forced_muted?"فك الكتم":"كتم"}</button>}{!p.guest&&p.role==="speaker"&&<button type="button" onClick={()=>moderate(p.user_id,"listener")}><Icon name="speaker" size={15}/>نزّل</button>}<button type="button" className="danger" onClick={()=>moderate(p.user_id,"kick",p.guest)}><Icon name="logout" size={15}/>إخراج</button></div></article>)}{!people.length&&<small>ما فيش مستخدمين آخرين في الصوت.</small>}</div><a className="r1-room-manage-link" href={`/room/manage/${roomId}`}>الحظر وإدارة الأعضاء من إعدادات الغرفة</a>{status&&<p role="status">{status}</p>}</div>}</section>;
  return createPortal(panel,host);
}
