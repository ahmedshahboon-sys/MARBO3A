"use client";
import {useEffect} from "react";

const HOLD_MS=420;

export default function ReactionHoldBridge(){
  useEffect(()=>{
    let timer=null;
    let active=null;

    function closeAll(except=null){
      document.querySelectorAll(".sf-reaction-picker.is-open").forEach(el=>{if(el!==except)el.classList.remove("is-open")});
    }

    function onPointerDown(e){
      const button=e.target.closest?.(".sf-reaction-picker button");
      if(!button)return closeAll();
      const picker=button.closest(".sf-reaction-picker");
      if(!picker)return;
      closeAll(picker);
      if(button!==picker.querySelector("button"))return;
      active={picker,button,pointerId:e.pointerId,long:false};
      clearTimeout(timer);
      timer=setTimeout(()=>{
        if(!active||active.button!==button)return;
        active.long=true;
        picker.classList.add("is-open");
        picker.dataset.suppressNextLike="1";
        try{button.setPointerCapture?.(e.pointerId)}catch{}
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
        setTimeout(()=>{if(picker.dataset.suppressNextLike==="1")delete picker.dataset.suppressNextLike},450);
      }
      try{button.releasePointerCapture?.(e.pointerId)}catch{}
    }

    function onPointerCancel(){clearTimeout(timer);timer=null;active=null}

    function onClick(e){
      const button=e.target.closest?.(".sf-reaction-picker button");
      if(!button)return;
      const picker=button.closest(".sf-reaction-picker");
      if(!picker)return;
      const first=picker.querySelector("button");
      if(button===first&&picker.dataset.suppressNextLike==="1"){
        e.preventDefault();
        e.stopPropagation();
        delete picker.dataset.suppressNextLike;
        return;
      }
      if(picker.classList.contains("is-open"))setTimeout(()=>picker.classList.remove("is-open"),80);
    }

    document.addEventListener("pointerdown",onPointerDown,true);
    document.addEventListener("pointerup",onPointerUp,true);
    document.addEventListener("pointercancel",onPointerCancel,true);
    document.addEventListener("click",onClick,true);
    return()=>{
      clearTimeout(timer);
      document.removeEventListener("pointerdown",onPointerDown,true);
      document.removeEventListener("pointerup",onPointerUp,true);
      document.removeEventListener("pointercancel",onPointerCancel,true);
      document.removeEventListener("click",onClick,true);
    };
  },[]);
  return null;
}
