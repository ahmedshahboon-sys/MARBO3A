"use client";
import {useLayoutEffect} from "react";
import {usePathname} from "next/navigation";

export default function FeedModePolicy(){
  const path=usePathname();
  useLayoutEffect(()=>{
    if(path!=="/home")return;
    let done=false,observer;
    const chooseLatest=()=>{
      if(done)return true;
      const tabs=[...document.querySelectorAll('.feed-mode-tabs [role="tab"],.feed-mode-tabs button')];
      if(!tabs.length)return false;
      const selected=tabs.find(b=>b.getAttribute("aria-selected")==="true"||b.classList.contains("active"));
      const latest=tabs.find(b=>b.textContent?.trim()==="الأحدث");
      if(latest&&selected&&selected.textContent?.trim()==="مختار لك"){
        done=true;
        latest.click();
        return true;
      }
      done=true;
      return true;
    };
    if(!chooseLatest()){
      observer=new MutationObserver(()=>{if(chooseLatest())observer?.disconnect()});
      observer.observe(document.body,{childList:true,subtree:true});
    }
    const timeout=setTimeout(()=>observer?.disconnect(),5000);
    return()=>{done=true;clearTimeout(timeout);observer?.disconnect()};
  },[path]);
  return null;
}
