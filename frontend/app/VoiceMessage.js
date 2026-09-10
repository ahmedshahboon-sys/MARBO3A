"use client";
import {useRef,useState} from "react";
const fmt=s=>{const n=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,"0")}`};
export default function VoiceMessage({src}){
  const audio=useRef(null),[playing,setPlaying]=useState(false),[time,setTime]=useState(0),[duration,setDuration]=useState(0),[rate,setRate]=useState(1);
  function toggle(){const a=audio.current;if(!a)return;if(a.paused)a.play().catch(()=>{});else a.pause()}
  function cycle(){const next=rate===1?1.5:rate===1.5?2:1;setRate(next);if(audio.current)audio.current.playbackRate=next}
  return <div className="voice-message">
    <audio ref={audio} src={src} preload="metadata" onLoadedMetadata={e=>setDuration(e.currentTarget.duration||0)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime||0)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}/>
    <button type="button" className="voice-play" onClick={toggle} aria-label={playing?"إيقاف":"تشغيل"}>{playing?"❚❚":"▶"}</button>
    <div className="voice-progress"><input type="range" min="0" max={Math.max(duration,1)} step="0.1" value={Math.min(time,Math.max(duration,1))} onChange={e=>{const v=Number(e.target.value);if(audio.current)audio.current.currentTime=v;setTime(v)}}/><span>{fmt(time)} / {fmt(duration)}</span></div>
    <button type="button" className="voice-rate" onClick={cycle}>{rate}×</button>
  </div>;
}
