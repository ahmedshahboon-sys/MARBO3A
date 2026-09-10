"use client";
import {useEffect,useRef,useState} from "react";
import Icon from "./Icon";

const MAX_SECONDS=120;
const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const supportedType=()=>{
  if(typeof MediaRecorder==="undefined")return "";
  for(const t of ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"]){if(MediaRecorder.isTypeSupported?.(t))return t}
  return "";
};

export default function VoiceRecorder({disabled=false,onRecorded,onError}){
  const[state,setState]=useState("idle"),[seconds,setSeconds]=useState(0);
  const recorder=useRef(null),stream=useRef(null),chunks=useRef([]),timer=useRef(null),cancelled=useRef(false);
  const cleanup=()=>{clearInterval(timer.current);timer.current=null;stream.current?.getTracks?.().forEach(t=>t.stop());stream.current=null;recorder.current=null};
  useEffect(()=>()=>cleanup(),[]);
  async function start(){
    if(disabled||state!=="idle")return;
    try{
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw new Error("VOICE_UNSUPPORTED");
      const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      stream.current=s;chunks.current=[];cancelled.current=false;setSeconds(0);
      const type=supportedType();const r=new MediaRecorder(s,type?{mimeType:type}:undefined);recorder.current=r;
      r.ondataavailable=e=>{if(e.data?.size)chunks.current.push(e.data)};
      r.onerror=()=>{cleanup();setState("idle");onError?.("تعذر تسجيل المقطع الصوتي")};
      r.onstop=()=>{
        const mime=r.mimeType||type||"audio/webm";const blob=new Blob(chunks.current,{type:mime});const ext=mime.includes("ogg")?"ogg":mime.includes("mp4")?"m4a":"webm";
        cleanup();setState("idle");
        if(cancelled.current||blob.size<1000)return;
        onRecorded?.(new File([blob],`voice-${Date.now()}.${ext}`,{type:mime,lastModified:Date.now()}),seconds);
      };
      r.start(250);setState("recording");
      timer.current=setInterval(()=>setSeconds(v=>{const n=v+1;if(n>=MAX_SECONDS){setTimeout(()=>stop(),0);return MAX_SECONDS}return n}),1000);
    }catch(e){cleanup();setState("idle");onError?.(e?.name==="NotAllowedError"?"اسمح لمربوعة باستخدام المايكروفون لتسجيل رسالة صوتية":"التسجيل الصوتي غير مدعوم على هذا الجهاز")}
  }
  function stop(){if(recorder.current&&recorder.current.state!=="inactive")recorder.current.stop()}
  function cancel(){cancelled.current=true;stop()}
  if(state==="recording")return <div className="voice-recorder recording"><button type="button" className="voice-cancel" onClick={cancel}>إلغاء</button><span className="voice-dot"/><b>{fmt(seconds)}</b><span>يسجل...</span><button type="button" className="voice-stop" onClick={stop} aria-label="إيقاف التسجيل"><span/></button></div>;
  return <button type="button" className="voice-record-btn" onClick={start} disabled={disabled} aria-label="تسجيل رسالة صوتية"><Icon name="mic"/></button>;
}
