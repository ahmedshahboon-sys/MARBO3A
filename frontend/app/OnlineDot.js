"use client";
import {useEffect,useState} from "react";
const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
const cache=new Map(),watchers=new Map(),queue=new Set();let flushTimer=null;
function publish(id,value){cache.set(String(id),{value:Boolean(value),at:Date.now()});for(const cb of watchers.get(String(id))||[])cb(Boolean(value))}
async function flush(){flushTimer=null;const ids=[...queue];queue.clear();if(!ids.length||!token())return;try{const r=await fetch(`/api/presence/users?ids=${ids.join(",")}`,{headers:{authorization:`Bearer ${token()}`},cache:"no-store"}),d=await r.json();const found=new Set();for(const u of d.users||[]){found.add(String(u.id));publish(u.id,u.online)}for(const id of ids)if(!found.has(String(id)))publish(id,false)}catch{}}
function request(id){if(!id)return;queue.add(String(id));if(!flushTimer)flushTimer=setTimeout(flush,35)}
export function useOnline(id){const key=id==null?null:String(id),initial=key&&cache.get(key)?.value||false,[online,setOnline]=useState(initial);useEffect(()=>{if(!key)return;let set=watchers.get(key);if(!set){set=new Set();watchers.set(key,set)}set.add(setOnline);const hit=cache.get(key);if(!hit||Date.now()-hit.at>30000)request(key);else setOnline(hit.value);const t=setInterval(()=>request(key),45000);return()=>{clearInterval(t);set.delete(setOnline);if(!set.size)watchers.delete(key)}},[key]);return online}
export default function OnlineDot({userId,className=""}){const online=useOnline(userId);return online?<i className={`online-dot ${className}`.trim()} aria-label="متصل الآن" title="متصل الآن"/>:null}
