"use client";
import {useEffect,useState} from "react";
import StoryRail from "./StoryRail";

const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
export default function HomeStories(){
 const[me,setMe]=useState(null),[status,setStatus]=useState("");
 useEffect(()=>{const t=token();if(!t)return;const headers=t!=="cookie"?{authorization:`Bearer ${t}`}:{ };fetch("/api/auth/me",{headers,credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>setMe(d?.user||null)).catch(()=>{})},[]);
 return <div className="home-story-shell">{status&&<div className="story-inline-status" role="status" onClick={()=>setStatus("")}>{status}</div>}<StoryRail me={me} onStatus={setStatus}/></div>;
}
