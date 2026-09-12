"use client";
import {useEffect} from "react";

const HOLD_MS=420;
const reactions=["❤️","😂","😡","😢"];

export default function ReactionHoldBridge(){
  useEffect(()=>{
    let timer=null;
    let active=null;
    let palette=null;

    function closePalette(){
      palette?.remove();
      palette=null;
      document.querySelectorAll(".sf-reaction-picker.is-open").forEach(el=>el.classList.remove("is-open"));
    }

    function openPalette(picker,anchor){
      closePalette();
      const originals=[...picker.querySelectorAll(":scope > button")];
      if(!originals.length)return;
      picker.classList.add("is-open");
      palette=document.createElement("div");
      palette.className="reaction-hold-palette";
      palette.setAttribute("role","menu");
      reactions.forEach((emoji,index)=>{
        const b=document.createElement("button");
        b.type="button";
        b.textContent=emoji;
        b.setAttribute("aria-label",originals[index]?.getAttribute("aria-label")||"تفاعل");
        b.addEventListener("pointerdown",ev=>ev.stopPropagation());
        b.addEventListener("click",ev=>{
          ev.preventDefault();
          ev.stopPropagation();
          originals[index]?.click();
          closePalette();
        });
        palette.appendChild(b);
      });
      anchor.appendChild(palette);
      picker.dataset.suppressNextLike="1";
    }

    function onPointerDown(e){
      const first=e.target.closest?.(".sf-reaction-picker > button:first-child");
      if(!first){
        if(!e.target.closest?.(".reaction-hold-palette"))closePalette();
        return;
      }
      const picker=first.closest(".sf-reaction-picker");
      active={picker,button:first,pointerId:e.pointerId,long:false};
      clearTimeout(timer);
      timer=setTimeout(()=>{
        if(!active||active.button!==first)return;
        active.long=true;
        openPalette(picker,picker);
        try{first.setPointerCapture?.(e.pointerId)}catch{}
      },HOLD_MS);
    }

    function onPointerUp(e){
      clearTimeout(timer);
      timer=null;
      if(!active)return;
      const {picker,button,pointerId,long}=active;
      if(pointerId!==e.pointerId)return;
      active=null;
      if(long){
        e.preventDefault();
        e.stopPropagation();
        setTimeout(()=>{if(picker.dataset.suppressNextLike==="1")delete picker.dataset.suppressNextLike},500);
      }
      try{button.releasePointerCapture?.(e.pointerId)}catch{}
    }

    function onPointerCancel(){clearTimeout(timer);timer=null;active=null}

    function onClick(e){
      const first=e.target.closest?.(".sf-reaction-picker > button:first-child");
      if(!first)return;
      const picker=first.closest(".sf-reaction-picker");
      if(picker?.dataset.suppressNextLike==="1"){
        e.preventDefault();
        e.stopPropagation();
        delete picker.dataset.suppressNextLike;
      }
    }

    function onScroll(){closePalette()}
    document.addEventListener("pointerdown",onPointerDown,true);
    document.addEventListener("pointerup",onPointerUp,true);
    document.addEventListener("pointercancel",onPointerCancel,true);
    document.addEventListener("click",onClick,true);
    window.addEventListener("scroll",onScroll,true);
    return()=>{
      clearTimeout(timer);
      closePalette();
      document.removeEventListener("pointerdown",onPointerDown,true);
      document.removeEventListener("pointerup",onPointerUp,true);
      document.removeEventListener("pointercancel",onPointerCancel,true);
      document.removeEventListener("click",onClick,true);
      window.removeEventListener("scroll",onScroll,true);
    };
  },[]);
  return null;
}
