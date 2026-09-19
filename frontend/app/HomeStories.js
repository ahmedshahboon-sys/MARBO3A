"use client";
import {useEffect,useState} from "react";
import StoryRail from "./StoryRail";
import {sessionMarker,cookieHeaders} from "./webSession";

export default function HomeStories(){
 const[me,setMe]=useState(null),[status,setStatus]=useState("");
 useEffect(()=>{if(!sessionMarker())return;fetch("/api/auth/me",{headers:cookieHeaders(),credentials:"same-origin",cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>setMe(d?.user||null)).catch(()=>{})},[]);
 return <div className="home-story-shell">{status&&<div className="story-inline-status" role="status" onClick={()=>setStatus("")}>{status}</div>}<StoryRail me={me} onStatus={setStatus}/></div>;
}
