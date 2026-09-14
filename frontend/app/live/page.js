"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import Icon from "../Icon";
import {liveApi,liveErrorText} from "./live-api";

function Avatar({item}){return item.avatar_url?<img src={item.avatar_url} alt=""/>:<span>{String(item.display_name||item.username||"م")[0]}</span>}
export default function LivePage(){
  const[lives,setLives]=useState([]),[status,setStatus]=useState(""),[loading,setLoading]=useState(true);
  async function load(){try{const d=await liveApi("/api/live");setLives(d.lives||[]);setStatus("")}catch(e){setStatus(liveErrorText(e))}finally{setLoading(false)}}
  useEffect(()=>{load();const t=setInterval(()=>document.visibilityState==="visible"&&load(),8000);return()=>clearInterval(t)},[]);
  return <main className="live-page social-page" dir="rtl"><section className="live-shell"><header className="live-page-head"><div><span>مربوعة LIVE</span><h1>اللايفات</h1><p>شوف الناس اللي طالعين لايف توا، أو افتح لايفك.</p></div><Link href="/live/new"><Icon name="video"/><b>ابدأ لايف</b></Link></header>{status&&<div className="live-status">{status}</div>}<section className="live-grid">{lives.map(item=><Link href={`/live/${item.id}`} className="live-card" key={item.id}><div className="live-card-preview"><Avatar item={item}/><b className="live-badge"><i/> LIVE</b><span className="live-viewers"><Icon name="users"/>{Number(item.viewers_count||0)}</span></div><div className="live-card-copy"><b>{item.title||`${item.display_name} لايف`}</b><small>{item.display_name} · <bdi dir="ltr">@{item.username}</bdi></small></div></Link>)}{loading&&<div className="live-empty">لحظة، بنشوفوا شكون لايف...</div>}{!loading&&!lives.length&&!status&&<div className="live-empty"><Icon name="video"/><h2>ما فيش حد لايف توا</h2><p>تقدر تكون أول واحد يفتح لايف.</p><Link href="/live/new">ابدأ لايف</Link></div>}</section></section></main>
}
