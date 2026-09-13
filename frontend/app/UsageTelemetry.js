"use client";
import {useEffect,useRef} from "react";
import {usePathname} from "next/navigation";

function token(){return localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""}
function visitorId(){let id=localStorage.getItem("marbo3a_visitor_id");if(!id){id=`v_${crypto.randomUUID().replace(/-/g,"")}`;localStorage.setItem("marbo3a_visitor_id",id)}return id}
function sessionId(){let id=sessionStorage.getItem("marbo3a_usage_session_id");if(!id){id=`s_${crypto.randomUUID().replace(/-/g,"")}`;sessionStorage.setItem("marbo3a_usage_session_id",id)}return id}
async function send(event,path){try{const auth=token();await fetch("/api/telemetry/activity",{method:"POST",headers:{"content-type":"application/json",...(auth&&auth!=="cookie"?{authorization:`Bearer ${auth}`}:{})},credentials:"same-origin",keepalive:true,body:JSON.stringify({event,path,sessionId:sessionId(),visitorId:visitorId()})})}catch{}}

export default function UsageTelemetry(){
  const path=usePathname()||"/",last=useRef("");
  useEffect(()=>{if(last.current!==path){last.current=path;send("pageview",path)}},[path]);
  useEffect(()=>{const beat=()=>{if(document.visibilityState==="visible")send("heartbeat",location.pathname)};const timer=setInterval(beat,60000),visible=()=>document.visibilityState==="visible"&&beat();window.addEventListener("focus",beat);document.addEventListener("visibilitychange",visible);return()=>{clearInterval(timer);window.removeEventListener("focus",beat);document.removeEventListener("visibilitychange",visible)}},[]);
  return null;
}
