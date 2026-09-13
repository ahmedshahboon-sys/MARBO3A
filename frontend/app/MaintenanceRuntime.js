"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";

const RETURN_KEY="marbo3a:maintenance:return";
const safeReturn=value=>typeof value==="string"&&value.startsWith("/")&&!value.startsWith("//")&&value!=="/maintenance"?value:"/";

export default function MaintenanceRuntime(){
  const path=usePathname();
  useEffect(()=>{
    let stopped=false,timer=null;
    const check=async()=>{
      try{
        const response=await fetch("/api/system/maintenance",{cache:"no-store",credentials:"include",headers:{Accept:"application/json"}});
        if(response.ok){
          const state=await response.json();
          if(state?.active&&path!=="/maintenance"){
            const target=`${window.location.pathname}${window.location.search}${window.location.hash}`;
            try{sessionStorage.setItem(RETURN_KEY,safeReturn(target))}catch{}
            window.location.replace("/maintenance");
            return;
          }
          if(!state?.active&&path==="/maintenance"){
            let target="/";
            try{target=safeReturn(sessionStorage.getItem(RETURN_KEY)||"/");sessionStorage.removeItem(RETURN_KEY)}catch{}
            window.location.replace(target);
            return;
          }
        }
      }catch{}
      if(!stopped)timer=setTimeout(check,6000);
    };
    check();
    return()=>{stopped=true;if(timer)clearTimeout(timer)};
  },[path]);
  return null;
}
