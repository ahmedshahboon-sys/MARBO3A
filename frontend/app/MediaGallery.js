"use client";
import {useEffect,useRef,useState} from "react";
import Icon from "./Icon";
import useModalLayer from "./useModalLayer";

const kind=m=>m?.type==="video"||String(m?.type||"").startsWith("video/")||/\.(mp4|webm|mov)(\?|$)/i.test(m?.url||"")?"video":"image";
const PlayIcon=()=> <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z"/></svg>;

export default function MediaGallery({items=[],alt="وسائط",className=""}){
 const media=(Array.isArray(items)?items:[]).map(x=>typeof x==="string"?{url:x,type:"image"}:x).filter(x=>x?.url);
 const[index,setIndex]=useState(null),swipe=useRef(null),viewerRef=useRef(null);
 useModalLayer(index!==null,{containerRef:viewerRef,onClose:()=>setIndex(null),kind:"media"});
 const next=()=>setIndex(i=>(i+1)%media.length),previous=()=>setIndex(i=>(i-1+media.length)%media.length);
 useEffect(()=>{if(index===null)return;const key=e=>{if(e.key==="Escape")setIndex(null);if(e.key==="ArrowLeft")next();if(e.key==="ArrowRight")previous()};document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key)},[index,media.length]);
 function pointerDown(e){if(e.pointerType==="mouse")return;swipe.current={id:e.pointerId,x:e.clientX,y:e.clientY}}
 function pointerUp(e){const s=swipe.current;swipe.current=null;if(!s||s.id!==e.pointerId||media.length<2)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*1.15)return;if(dx<0)next();else previous()}
 if(!media.length)return null;
 const current=index===null?null:media[index],currentKind=kind(current);
 return <>
  <div className={`media-grid media-count-${Math.min(media.length,4)} ${className}`}>
   {media.slice(0,4).map((m,i)=>{const type=kind(m);return <button type="button" key={`${m.url}-${i}`} onClick={()=>setIndex(i)} aria-label={`فتح ${type==="video"?"الفيديو":"الصورة"} ${i+1} من ${media.length}`} className={type==="video"?"media-video-tile":""}>
    {type==="video"?<><video src={m.url} preload="metadata" muted playsInline/><span className="media-video-play"><PlayIcon/></span></>:<img src={m.url} alt={`${alt} ${i+1}`} loading="lazy"/>}
    {i===3&&media.length>4&&<span className="media-more-count">+{media.length-4}</span>}
   </button>})}
  </div>
  {current&&<div ref={viewerRef} className="media-viewer" role="dialog" tabIndex={-1} aria-modal="true" aria-label="عارض الوسائط" onMouseDown={e=>e.target===e.currentTarget&&setIndex(null)} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={()=>{swipe.current=null}}>
   <button className="media-close" type="button" onClick={()=>setIndex(null)} aria-label="إغلاق"><Icon name="close"/></button>
   {media.length>1&&<button className="media-prev" type="button" onClick={next} aria-label="الوسيط التالي">‹</button>}
   {currentKind==="video"?<video className="media-viewer-video" src={current.url} controls playsInline autoPlay preload="metadata"/>:<img src={current.url} alt={`${alt} ${index+1}`}/>} 
   {media.length>1&&<button className="media-next" type="button" onClick={previous} aria-label="الوسيط السابق">›</button>}
   <div className="media-counter">{index+1} / {media.length}</div>
  </div>}
 </>;
}
