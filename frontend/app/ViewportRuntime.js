"use client";
import {useEffect} from "react";

export default function ViewportRuntime(){
  useEffect(()=>{
    const root=document.documentElement;
    let raf=0;
    const sync=()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const vv=window.visualViewport;
        const h=Math.max(1,Math.round(vv?.height||window.innerHeight||0));
        const top=Math.max(0,Math.round(vv?.offsetTop||0));
        const keyboard=Math.max(0,Math.round((window.innerHeight||h)-h-top));
        root.style.setProperty("--marbo3a-vvh",`${h}px`);
        root.style.setProperty("--marbo3a-vv-top",`${top}px`);
        root.style.setProperty("--marbo3a-keyboard-h",`${keyboard}px`);
        root.toggleAttribute("data-keyboard-open",keyboard>120);
      });
    };
    sync();
    window.addEventListener("resize",sync,{passive:true});
    window.addEventListener("orientationchange",sync,{passive:true});
    window.visualViewport?.addEventListener("resize",sync,{passive:true});
    window.visualViewport?.addEventListener("scroll",sync,{passive:true});
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",sync);window.removeEventListener("orientationchange",sync);window.visualViewport?.removeEventListener("resize",sync);window.visualViewport?.removeEventListener("scroll",sync);root.removeAttribute("data-keyboard-open")};
  },[]);
  return null;
}
