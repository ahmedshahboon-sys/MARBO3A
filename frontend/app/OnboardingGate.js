"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {fetchJson} from "./request";
import {sessionMarker,cookieHeaders} from "./webSession";
const token=()=>sessionMarker();
const authHeaders=()=>cookieHeaders();
export default function OnboardingGate(){const path=usePathname();useEffect(()=>{if(path==="/"||path==="/onboarding"||!token())return;let alive=true;fetchJson("/api/onboarding",{headers:authHeaders(),credentials:"same-origin",cache:"no-store"},7000).then(d=>{if(!alive||d.completed!==false)return;try{if(path!=="/home")sessionStorage.setItem("marbo3a_after_onboarding",path)}catch{}location.replace("/onboarding")}).catch(()=>{});return()=>{alive=false}},[path]);return null}
