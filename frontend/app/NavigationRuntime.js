"use client";
import {useEffect,useRef,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import {getNavigationPolicy} from "./navigation-policy";

const emit=(name,detail={})=>{try{window.dispatchEvent(new CustomEvent(name,{detail}))}catch{}};
const sameOriginHref=a=>{
  const raw=a?.getAttribute?.("href")||"";
  if(!raw||raw.startsWith("#")||raw.startsWith("mailto:")||raw.startsWith("tel:")||raw.startsWith("javascript:"))return null;
  try{const u=new URL(raw,location.href);return u.origin===location.origin?u:null}catch{return null}
};

export default function NavigationRuntime(){
  const router=useRouter();
  const pathname=usePathname();
  const[pending,setPending]=useState(false);
  const started=useRef(null);
  const fallback=useRef(null);

  useEffect(()=>{
    const root=document.documentElement,policy=getNavigationPolicy(pathname);
    root.dataset.navShell=policy.shell?"true":"false";
    root.dataset.navHeader=policy.showHeader?"shown":"hidden";
    root.dataset.navDock=policy.showDock?"shown":"hidden";
    root.dataset.navImmersive=policy.immersive?"true":"false";
    return()=>{delete root.dataset.navShell;delete root.dataset.navHeader;delete root.dataset.navDock;delete root.dataset.navImmersive};
  },[pathname]);

  useEffect(()=>{
    const onClick=e=>{
      if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      const a=e.target?.closest?.("a[href]");
      if(!a||a.target==="_blank"||a.hasAttribute("download")||a.dataset?.nativeNavigation==="true")return;
      const u=sameOriginHref(a);if(!u)return;
      const current=new URL(location.href);
      if(u.pathname===current.pathname&&u.search===current.search&&u.hash){return}
      e.preventDefault();
      const to=`${u.pathname}${u.search}${u.hash}`;
      started.current={at:performance.now(),from:`${current.pathname}${current.search}`,to};
      setPending(true);emit("marbo3a:navigation-start",started.current);
      router.push(to);
      clearTimeout(fallback.current);fallback.current=setTimeout(()=>setPending(false),1800);
    };
    const prefetch=e=>{
      const a=e.target?.closest?.("a[href]");const u=sameOriginHref(a);if(!u)return;
      if(u.pathname!==location.pathname)router.prefetch(`${u.pathname}${u.search}`);
    };
    document.addEventListener("click",onClick,true);
    document.addEventListener("pointerover",prefetch,true);
    document.addEventListener("touchstart",prefetch,{capture:true,passive:true});
    return()=>{document.removeEventListener("click",onClick,true);document.removeEventListener("pointerover",prefetch,true);document.removeEventListener("touchstart",prefetch,true);clearTimeout(fallback.current)};
  },[router]);

  useEffect(()=>{
    if(!started.current)return;
    const nav=started.current;started.current=null;
    const done=()=>{const duration=Math.round(performance.now()-nav.at);emit("marbo3a:navigation-render",{from:nav.from,to:`${location.pathname}${location.search}`,duration});setPending(false);clearTimeout(fallback.current)};
    requestAnimationFrame(()=>requestAnimationFrame(done));
  },[pathname]);

  return <div className={`route-progress ${pending?"show":""}`} aria-hidden="true"><i/></div>;
}
