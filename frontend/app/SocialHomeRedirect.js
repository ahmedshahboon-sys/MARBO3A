"use client";
import {useEffect} from "react";
import {usePathname,useSearchParams} from "next/navigation";
export default function SocialHomeRedirect(){const path=usePathname(),params=useSearchParams();useEffect(()=>{if(path!=="/")return;const hasLegacy=params?.toString();if(hasLegacy)return;let cancelled=false;const check=()=>{if(cancelled)return;const t=localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token");if(t)location.replace("/feed")};check();const i=setInterval(check,700);return()=>{cancelled=true;clearInterval(i)}},[path,params]);return null}
