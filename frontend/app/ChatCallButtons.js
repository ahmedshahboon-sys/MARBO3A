"use client";
import {useEffect,useState} from "react";
import Icon from "./Icon";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
async function api(path){const r=await fetch(path,{headers:{authorization:`Bearer ${token()}`},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}
export default function ChatCallButtons(){
 const[meta,setMeta]=useState(null),[path,setPath]=useState("");
 useEffect(()=>{const sync=()=>setPath(location.pathname);sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync)},[]);
 useEffect(()=>{const m=path.match(/^\/chat\/(\d+)$/);if(!m||!token()){setMeta(null);return}let alive=true;api("/api/chats").then(d=>{if(!alive)return;const c=(d.chats||[]).find(x=>String(x.id)===m[1]);setMeta(c?{conversationId:Number(m[1]),name:c.display_name||c.username||"مستخدم مربوعة",avatar:c.avatar_url||null}:null)}).catch(()=>setMeta(null));return()=>{alive=false}},[path]);
 if(!meta)return null;
 const go=kind=>window.dispatchEvent(new CustomEvent("marbo3a:start-call",{detail:{...meta,kind}}));
 return <div className="chat-call-launchers" dir="rtl"><button onClick={()=>go("audio")} aria-label="مكالمة صوتية" title="مكالمة صوتية"><Icon name="phone"/></button><button onClick={()=>go("video")} aria-label="مكالمة فيديو" title="مكالمة فيديو"><Icon name="video"/></button></div>;
}
