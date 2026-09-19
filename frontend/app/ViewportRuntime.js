"use client";
import {useEffect} from "react";

export default function ViewportRuntime(){
  useEffect(()=>{
    const root=document.documentElement;
    let raf=0,lastOrientation=window.innerWidth>window.innerHeight?"landscape":"portrait",maxLayoutHeight=Math.max(window.innerHeight||0,1);
    const isEditable=()=>{const el=document.activeElement;if(!el)return false;const tag=String(el.tagName||"").toLowerCase();return tag==="input"||tag==="textarea"||el.isContentEditable===true};
    const sync=()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const vv=window.visualViewport,orientation=window.innerWidth>window.innerHeight?"landscape":"portrait";
        if(orientation!==lastOrientation){lastOrientation=orientation;maxLayoutHeight=Math.max(window.innerHeight||0,1)}else if(!isEditable())maxLayoutHeight=Math.max(maxLayoutHeight,window.innerHeight||0);
        const h=Math.max(1,Math.round(vv?.height||window.innerHeight||0)),w=Math.max(1,Math.round(vv?.width||window.innerWidth||0)),top=Math.max(0,Math.round(vv?.offsetTop||0));
        const layoutBaseline=Math.max(maxLayoutHeight,window.innerHeight||0),rawKeyboard=Math.max(0,Math.round(layoutBaseline-h-top)),keyboard=isEditable()&&rawKeyboard>100?rawKeyboard:0;
        root.style.setProperty("--marbo3a-vvh",`${h}px`);
        root.style.setProperty("--marbo3a-vvw",`${w}px`);
        root.style.setProperty("--marbo3a-vv-top",`${top}px`);
        root.style.setProperty("--marbo3a-keyboard-h",`${keyboard}px`);
        root.dataset.viewportOrientation=orientation;
        root.toggleAttribute("data-keyboard-open",keyboard>0);
      });
    };
    const focusSync=()=>setTimeout(sync,40);
    sync();
    window.addEventListener("resize",sync,{passive:true});
    window.addEventListener("orientationchange",sync,{passive:true});
    window.addEventListener("focusin",focusSync,{passive:true});
    window.addEventListener("focusout",focusSync,{passive:true});
    window.visualViewport?.addEventListener("resize",sync,{passive:true});
    window.visualViewport?.addEventListener("scroll",sync,{passive:true});
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",sync);window.removeEventListener("orientationchange",sync);window.removeEventListener("focusin",focusSync);window.removeEventListener("focusout",focusSync);window.visualViewport?.removeEventListener("resize",sync);window.visualViewport?.removeEventListener("scroll",sync);root.removeAttribute("data-keyboard-open");delete root.dataset.viewportOrientation};
  },[]);
  return null;
}
