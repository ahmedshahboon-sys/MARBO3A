"use client";
import {useEffect} from "react";

const HOLD_MS=420;
const MOVE_TOLERANCE=12;
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

    function positionPalette(anchor){
      if(!palette)return;
      const r=anchor.getBoundingClientRect(),w=Math.min(252,window.innerWidth-20),left=Math.max(10,Math.min(window.innerWidth-w-10,r.left+r.width/2-w/2));
      palette.style.width=`${w}px`;
      palette.style.left=`${left}px`;
      palette.style.top=`${Math.max(10,r.top-70)}px`;
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
          delete picker.dataset.suppressNextLike;
          originals[index]?.click();
          closePalette();
        });
        palette.appendChild(b);
      });
      document.body.appendChild(palette);
      positionPalette(anchor);
      picker.dataset.suppressNextLike="1";
    }

    function clearHold(){clearTimeout(timer);timer=null}

    function onPointerDown(e){
      const first=e.target.closest?.(".sf-reaction-picker > button:first-child");
      if(!first){if(!e.target.closest?.(".reaction-hold-palette"))closePalette();return}
      if(e.pointerType==="mouse"&&e.button!==0)return;
      const picker=first.closest(".sf-reaction-picker");
      active={picker,button:first,pointerId:e.pointerId,long:false,x:e.clientX,y:e.clientY};
      clearHold();
      timer=setTimeout(()=>{
        if(!active||active.button!==first)return;
        active.long=true;
        openPalette(picker,first);
        try{navigator.vibrate?.(20)}catch{}
      },HOLD_MS);
    }

    function onPointerMove(e){
      if(!active||active.pointerId!==e.pointerId||active.long)return;
      if(Math.hypot(e.clientX-active.x,e.clientY-active.y)>MOVE_TOLERANCE){clearHold();active=null}
    }

    function onPointerUp(e){
      clearHold();
      if(!active||active.pointerId!==e.pointerId)return;
      const {picker,long}=active;active=null;
      if(long){e.preventDefault();e.stopPropagation();setTimeout(()=>{if(picker.dataset.suppressNextLike==="1")delete picker.dataset.suppressNextLike},450)}
    }

    function onPointerCancel(){clearHold();active=null}
    function onClick(e){
      const first=e.target.closest?.(".sf-reaction-picker > button:first-child");
      if(!first)return;
      const picker=first.closest(".sf-reaction-picker");
      if(picker?.dataset.suppressNextLike==="1"){e.preventDefault();e.stopPropagation();delete picker.dataset.suppressNextLike}
    }
    function onScroll(){clearHold();active=null;closePalette()}
    function onResize(){if(palette)closePalette()}
    document.addEventListener("pointerdown",onPointerDown,true);
    document.addEventListener("pointermove",onPointerMove,true);
    document.addEventListener("pointerup",onPointerUp,true);
    document.addEventListener("pointercancel",onPointerCancel,true);
    document.addEventListener("click",onClick,true);
    window.addEventListener("scroll",onScroll,true);
    window.addEventListener("resize",onResize);
    return()=>{
      clearHold();closePalette();
      document.removeEventListener("pointerdown",onPointerDown,true);
      document.removeEventListener("pointermove",onPointerMove,true);
      document.removeEventListener("pointerup",onPointerUp,true);
      document.removeEventListener("pointercancel",onPointerCancel,true);
      document.removeEventListener("click",onClick,true);
      window.removeEventListener("scroll",onScroll,true);
      window.removeEventListener("resize",onResize);
    };
  },[]);
  return null;
}
