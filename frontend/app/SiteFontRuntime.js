"use client";
import {useEffect} from "react";
const KEY="marbo3a_site_font";
const normalize=value=>value==="cairo"?"cairo":"readex";
const apply=font=>{try{document.documentElement.dataset.siteFont=normalize(font)}catch{}};
export default function SiteFontRuntime(){
  useEffect(()=>{
    let alive=true;
    try{apply(localStorage.getItem(KEY)||"readex")}catch{apply("readex")}
    const sync=async()=>{try{const r=await fetch("/api/public/ui-settings",{cache:"no-store",credentials:"same-origin"}),d=await r.json().catch(()=>({}));if(!alive||!r.ok)return;const font=normalize(d.font);apply(font);try{localStorage.setItem(KEY,font)}catch{}}catch{}};
    const onFont=e=>{const font=normalize(e.detail?.font);apply(font);try{localStorage.setItem(KEY,font)}catch{}};
    const onVisible=()=>document.visibilityState==="visible"&&sync();
    sync();const timer=setInterval(sync,60000);
    window.addEventListener("marbo3a:site-font",onFont);document.addEventListener("visibilitychange",onVisible);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener("marbo3a:site-font",onFont);document.removeEventListener("visibilitychange",onVisible)};
  },[]);
  return null;
}
