"use client";
import {useEffect,useRef} from "react";

const layers=[];
const selector='button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function syncRoot(){
  const root=document.documentElement,top=layers.at(-1);
  if(!top){delete root.dataset.modalOpen;delete root.dataset.modalDepth;delete root.dataset.modalLayer;return}
  root.dataset.modalOpen="true";
  root.dataset.modalDepth=String(layers.length);
  root.dataset.modalLayer=top.kind;
}

export default function useModalLayer(open,{containerRef,onClose,kind="dialog",escapeCloses=true}={}){
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const id=Symbol(kind),previous=document.activeElement;
    layers.push({id,kind});syncRoot();
    const frame=requestAnimationFrame(()=>{
      const root=containerRef?.current;
      if(!root)return;
      (root.querySelector("[autofocus]")||root.querySelector(selector)||root).focus?.();
    });
    const onKey=e=>{
      if(layers.at(-1)?.id!==id)return;
      const root=containerRef?.current;
      if(e.key==="Escape"&&escapeCloses&&closeRef.current){e.preventDefault();e.stopPropagation();closeRef.current();return}
      if(e.key!=="Tab"||!root)return;
      const items=[...root.querySelectorAll(selector)].filter(el=>!el.hidden&&el.getClientRects().length);
      if(!items.length){e.preventDefault();root.focus?.();return}
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    };
    document.addEventListener("keydown",onKey,true);
    return()=>{
      cancelAnimationFrame(frame);document.removeEventListener("keydown",onKey,true);
      const i=layers.findIndex(x=>x.id===id);if(i>=0)layers.splice(i,1);syncRoot();
      requestAnimationFrame(()=>previous?.isConnected&&previous.focus?.());
    };
  },[open,containerRef,kind,escapeCloses]);
}
