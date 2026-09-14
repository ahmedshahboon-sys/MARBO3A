"use client";
import {useEffect,useMemo,useState} from "react";
import Icon from "../Icon";

const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
async function api(path){const r=await fetch(path,{headers:{authorization:`Bearer ${token()}`},cache:"no-store",credentials:"same-origin"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}
export default function TvPage(){
  const[channels,setChannels]=useState([]),[active,setActive]=useState(null),[q,setQ]=useState(""),[group,setGroup]=useState("الكل"),[status,setStatus]=useState("جاري تحميل القنوات...");
  useEffect(()=>{let alive=true;api("/api/tv/channels").then(d=>{if(!alive)return;setChannels(d.channels||[]);setActive((d.channels||[])[0]||null);setStatus((d.channels||[]).length?"":"ما فيش قنوات مضافة توا")}).catch(()=>alive&&setStatus("ما قدرناش نحمّلوا القنوات توا"));return()=>{alive=false}},[]);
  const groups=useMemo(()=>["الكل",...Array.from(new Set(channels.map(c=>c.group_title||"أخرى")))],[channels]);
  const visible=useMemo(()=>channels.filter(c=>(group==="الكل"||(c.group_title||"أخرى")===group)&&(!q.trim()||`${c.name} ${c.group_title||""}`.toLowerCase().includes(q.trim().toLowerCase()))),[channels,group,q]);
  return <main className="tv-page social-page" dir="rtl"><section className="tv-shell"><header className="tv-head"><div><span className="tv-kicker">مربوعة TV</span><h1>التلفزيون</h1><p>اختار القناة وتفرّج من داخل مربوعة.</p></div><div className="tv-live-pill"><span/> مباشر</div></header>
    {active&&<section className="tv-player-card"><div className="tv-player-frame"><video key={active.id} src={active.play_url} controls autoPlay playsInline preload="metadata" poster={active.logo_url||undefined} onError={()=>setStatus("القناة هذي ما اشتغلتش. جرّب قناة ثانية أو راجع المصدر.")}/></div><div className="tv-now"><span className="tv-logo">{active.logo_url?<img src={active.logo_url} alt=""/>:<Icon name="video"/>}</span><div><b>{active.name}</b><small>{active.group_title||"قناة"}</small></div></div></section>}
    <section className="tv-browser"><div className="tv-tools"><label><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="دوّر على قناة..."/></label><div className="tv-groups">{groups.map(g=><button type="button" className={group===g?"active":""} onClick={()=>setGroup(g)} key={g}>{g}</button>)}</div></div>
      {status&&<div className="tv-empty">{status}</div>}
      <div className="tv-grid">{visible.map(c=><button type="button" key={c.id} className={`tv-channel ${String(active?.id)===String(c.id)?"active":""}`} onClick={()=>{setStatus("");setActive(c);window.scrollTo({top:0,behavior:"smooth"})}}><span className="tv-channel-logo">{c.logo_url?<img src={c.logo_url} alt=""/>:<Icon name="video"/>}</span><span><b>{c.name}</b><small>{c.group_title||"أخرى"}</small></span><Icon name="video"/></button>)}</div>
    </section>
  </section></main>
}
