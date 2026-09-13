"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";

const HOLD_MS=420;
const MOVE_TOLERANCE=12;
const reactions=["❤️","😂","😡","😢"];

export default function ReactionHoldBridge(){
  const[palette,setPalette]=useState(null);
  const timer=useRef(null),active=useRef(null);
  const close=()=>setPalette(null);
  useEffect(()=>{
    const clearHold=()=>{clearTimeout(timer.current);timer.current=null};
    function openPicker(picker,anchor){
      const originals=[...picker.querySelectorAll(":scope > button")];
      if(!originals.length)return;
      const r=anchor.getBoundingClientRect(),w=Math.min(252,window.innerWidth-20),left=Math.max(10,Math.min(window.innerWidth-w-10,r.left+r.width/2-w/2));
      picker.dataset.suppressNextLike="1";
      setPalette({picker,buttons:originals,left,top:Math.max(10,r.top-70),width:w});
    }
    function onPointerDown(e){
      const first=e.target.closest?.(".sf-reaction-picker > button:first-child");
      if(!first){if(!e.target.closest?.(".reaction-hold-palette"))close();return}
      if(e.pointerType==="mouse"&&e.button!==0)return;
      const picker=first.closest(".sf-reaction-picker");
      active.current={picker,button:first,pointerId:e.pointerId,long:false,x:e.clientX,y:e.clientY};
      clearHold();
      timer.current=setTimeout(()=>{
        if(!active.current||active.current.button!==first)return;
        active.current.long=true;
        openPicker(picker,first);
        window.dispatchEvent(new CustomEvent("marbo3a:haptic",{detail:{pattern:20}}));
      },HOLD_MS);
    }
    function onPointerMove(e){const a=active.current;if(!a||a.pointerId!==e.pointerId||a.long)return;if(Math.hypot(e.clientX-a.x,e.clientY-a.y)>MOVE_TOLERANCE){clearHold();active.current=null}}
    function onPointerUp(e){clearHold();const a=active.current;if(!a||a.pointerId!==e.pointerId)return;active.current=null;if(a.long){e.preventDefault();e.stopPropagation();setTimeout(()=>{if(a.picker.dataset.suppressNextLike==="1")delete a.picker.dataset.suppressNextLike},450)}}
    function onPointerCancel(){clearHold();active.current=null}
    function onClick(e){const button=e.target.closest?.(".sf-reaction-picker > button");if(!button)return;const picker=button.closest(".sf-reaction-picker"),first=button.matches(":first-child");if(first&&picker?.dataset.suppressNextLike==="1"){e.preventDefault();e.stopPropagation();delete picker.dataset.suppressNextLike;return}window.dispatchEvent(new CustomEvent("marbo3a:effect",{detail:{type:"like"}}))}
    function onScroll(){clearHold();active.current=null;close()}
    document.addEventListener("pointerdown",onPointerDown,true);document.addEventListener("pointermove",onPointerMove,true);document.addEventListener("pointerup",onPointerUp,true);document.addEventListener("pointercancel",onPointerCancel,true);document.addEventListener("click",onClick,true);window.addEventListener("scroll",onScroll,true);window.addEventListener("resize",close);
    return()=>{clearHold();document.removeEventListener("pointerdown",onPointerDown,true);document.removeEventListener("pointermove",onPointerMove,true);document.removeEventListener("pointerup",onPointerUp,true);document.removeEventListener("pointercancel",onPointerCancel,true);document.removeEventListener("click",onClick,true);window.removeEventListener("scroll",onScroll,true);window.removeEventListener("resize",close)};
  },[]);
  if(!palette||typeof document==="undefined")return null;
  const style={position:"fixed",zIndex:1200,left:palette.left,top:palette.top,width:palette.width,bottom:"auto",right:"auto",insetInlineStart:"auto"};
  return createPortal(<div className="reaction-hold-palette" role="menu" style={style}>{reactions.map((emoji,index)=><button key={emoji} type="button" aria-label={palette.buttons[index]?.getAttribute("aria-label")||"تفاعل"} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();delete palette.picker.dataset.suppressNextLike;palette.buttons[index]?.click();close()}}>{emoji}</button>)}</div>,document.body);
}
