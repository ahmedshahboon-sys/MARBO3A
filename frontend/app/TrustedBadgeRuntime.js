"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {createPortal} from "react-dom";
import TrustedBadge from "./TrustedBadge";

const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
async function api(path){const t=token(),headers=t&&t!=="cookie"?{authorization:`Bearer ${t}`}:{},r=await fetch(path,{headers,credentials:"same-origin",cache:"no-store"});if(!r.ok)throw new Error("LOAD_FAILED");return r.json()}
const usernameFrom=node=>String(node?.textContent||"").trim().replace(/^@/,"").toLowerCase();
const badgeHost=node=>node?.closest(".sf-comment-head,.sf-post-author,.profile-head,.profile-hero,.search-user-card,.user-card,.friend-card")?.querySelector("b,strong,h1,h2,h3")||node?.previousElementSibling||node?.parentElement;

export default function TrustedBadgeRuntime(){
 const path=usePathname(),cache=useRef(new Map()),pending=useRef(new Set()),[marks,setMarks]=useState([]),[tick,setTick]=useState(0);
 useEffect(()=>{let dead=false,frame=0;const scan=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const nodes=[...document.querySelectorAll("bdi[dir='ltr'],a[href^='/u/']")],seen=new Set(),next=[];for(const node of nodes){let username=node.matches("a[href^='/u/']")?String(node.getAttribute("href")||"").split("/u/")[1]?.split(/[/?#]/)[0]?.toLowerCase():usernameFrom(node);if(!username||seen.has(username))continue;const host=badgeHost(node);if(!host)continue;seen.add(username);const badge=cache.current.get(username);if(badge)next.push({username,badge,host});else if(!pending.current.has(username)&&token()){pending.current.add(username);api(`/api/social/profile/${encodeURIComponent(username)}`).then(d=>{cache.current.set(username,d?.profile?.official_badge||null)}).catch(()=>{cache.current.set(username,null)}).finally(()=>{pending.current.delete(username);if(!dead)setTick(v=>v+1)})}}setMarks(next)})};scan();const mo=new MutationObserver(scan);mo.observe(document.body,{childList:true,subtree:true,characterData:true});return()=>{dead=true;cancelAnimationFrame(frame);mo.disconnect();setMarks([])}},[path,tick]);
 return <>{marks.map(({username,badge,host})=>createPortal(<TrustedBadge badge={badge}/>,host,`trusted-badge-${username}`))}</>;
}
