"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
export default function SocialHomeRedirect(){const path=usePathname();useEffect(()=>{if(path!=="/")return;if(window.location.search)return;let cancelled=false;const check=()=>{if(cancelled)return;const t=localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token");if(t)location.replace("/home")};check();const i=setInterval(check,700);return()=>{cancelled=true;clearInterval(i)}},[path]);return null}
