"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
export default function ReadReceiptBridge(){const path=usePathname();useEffect(()=>{const m=String(path||"").match(/^\/chat\/(\d+)$/);if(!m)return;let stopped=false;const mark=async()=>{if(stopped||document.visibilityState!=="visible")return;const t=token();if(!t)return;try{await fetch(`/api/chats/${m[1]}/read`,{method:"POST",headers:{authorization:`Bearer ${t}`},keepalive:true})}catch{}};mark();const timer=setInterval(mark,3500);const visible=()=>document.visibilityState==="visible"&&mark();document.addEventListener("visibilitychange",visible);return()=>{stopped=true;clearInterval(timer);document.removeEventListener("visibilitychange",visible)}},[path]);return null}
