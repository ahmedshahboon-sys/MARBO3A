"use client";
import {useEffect,useRef} from "react";

const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
const defaults={sound_enabled:true,haptics_enabled:true,respect_reduced_motion:true,notification_sounds:true};

export function emitExperienceEffect(type,detail={}){if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("marbo3a:effect",{detail:{type,...detail}}))}

export default function ExperienceEffects(){
 const prefs=useRef({...defaults}),audio=useRef(null),unlocked=useRef(false),meId=useRef(null);
 useEffect(()=>{
   const t=token();if(!t)return;
   const headers=t&&t!=="cookie"?{authorization:`Bearer ${t}`}:{ };
   Promise.allSettled([
     fetch("/api/experience/preferences",{headers,credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():null),
     fetch("/api/settings",{headers,credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():null),
     fetch("/api/auth/me",{headers,credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():null)
   ]).then(([a,b,c])=>{prefs.current={...defaults,...(a.status==="fulfilled"?a.value?.preferences:null),notification_sounds:b.status==="fulfilled"?b.value?.settings?.notification_sounds!==false:true};meId.current=c.status==="fulfilled"?c.value?.user?.id:null}).catch(()=>{});
   const unlock=()=>{if(unlocked.current)return;try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;audio.current=audio.current||new Ctx();audio.current.resume?.();unlocked.current=true}catch{}};
   window.addEventListener("pointerdown",unlock,{passive:true});
   const reduced=()=>prefs.current.respect_reduced_motion!==false&&window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
   const vibrate=(pattern=8)=>{if(!prefs.current.haptics_enabled||reduced()||document.hidden)return;try{navigator.vibrate?.(pattern)}catch{}};
   const tone=(kind="notification")=>{if(!prefs.current.sound_enabled||document.hidden||!unlocked.current)return;if(kind==="notification"&&prefs.current.notification_sounds===false)return;try{const ctx=audio.current;if(!ctx)return;const map={like:[660,0.035],send:[520,0.03],notification:[740,0.05],friendAccepted:[620,0.04],story:[580,0.035]},[freq,duration]=map[kind]||map.notification,osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;osc.type="sine";osc.frequency.setValueAtTime(freq,now);gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime(0.025,now+0.006);gain.gain.exponentialRampToValueAtTime(0.0001,now+duration);osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+duration+0.01)}catch{}};
   const effect=e=>{const type=e?.detail?.type||"notification";tone(type);vibrate(type==="friendAccepted"?[8,28,8]:type==="notification"?6:8)};
   const haptic=e=>vibrate(e?.detail?.pattern??8);
   const notification=e=>{const d=e?.detail||{},type=String(d.type||d.notification?.type||""),text=`${d.title||d.notification?.title||""} ${d.body||d.notification?.body||""}`;effect({detail:{type:/friend.*accept/i.test(type)||/قبول.*صداقة|تم قبول طلب الصداقة/.test(text)?"friendAccepted":"notification"}})};
   const message=e=>{const d=e?.detail?.message||e?.detail||{},sender=d.sender_id??d.user_id;if(sender&&meId.current&&String(sender)===String(meId.current))effect({detail:{type:"send"}})};
   const update=e=>{prefs.current={...prefs.current,...(e?.detail||{})}};
   window.addEventListener("marbo3a:effect",effect);
   window.addEventListener("marbo3a:haptic",haptic);
   window.addEventListener("marbo3a:notification:new",notification);
   window.addEventListener("marbo3a:notification:updated",notification);
   window.addEventListener("marbo3a:direct:new",message);
   window.addEventListener("marbo3a:message:new",message);
   window.addEventListener("marbo3a:experience-preferences",update);
   return()=>{window.removeEventListener("pointerdown",unlock);window.removeEventListener("marbo3a:effect",effect);window.removeEventListener("marbo3a:haptic",haptic);window.removeEventListener("marbo3a:notification:new",notification);window.removeEventListener("marbo3a:notification:updated",notification);window.removeEventListener("marbo3a:direct:new",message);window.removeEventListener("marbo3a:message:new",message);window.removeEventListener("marbo3a:experience-preferences",update);try{audio.current?.close?.()}catch{}};
 },[]);
 return null;
}
