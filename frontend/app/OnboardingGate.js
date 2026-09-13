"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {fetchJson} from "./request";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
const authHeaders=()=>{const t=token();return t&&t!=="cookie"?{authorization:`Bearer ${t}`}:{}};
export default function OnboardingGate(){const path=usePathname();useEffect(()=>{if(path==="/"||path==="/onboarding"||!token())return;let alive=true;fetchJson("/api/onboarding",{headers:authHeaders(),credentials:"same-origin",cache:"no-store"},7000).then(d=>{if(!alive||d.completed!==false)return;try{if(path!=="/home")sessionStorage.setItem("marbo3a_after_onboarding",path)}catch{}location.replace("/onboarding")}).catch(()=>{});return()=>{alive=false}},[path]);return null}
