"use client";

import {useEffect,useRef,useState} from "react";
import QRCode from "qrcode";
import Icon from "./Icon";
import {UiButton} from "./Ui";

export default function ShareQR({url,title="مربوعة",label="مشاركة"}){
  const [qr,setQr]=useState("");
  const [status,setStatus]=useState("");
  const timer=useRef(null);
  useEffect(()=>{if(url)QRCode.toDataURL(url,{width:220,margin:1,errorCorrectionLevel:"M"}).then(setQr).catch(()=>{});},[url]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  function say(v){setStatus(v);clearTimeout(timer.current);timer.current=setTimeout(()=>setStatus(""),1800)}
  async function copy(){try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url);else{const t=document.createElement("textarea");t.value=url;t.setAttribute("readonly","");t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();document.execCommand("copy");t.remove()}say("تم نسخ الرابط")}catch{say("تعذر نسخ الرابط")}}
  async function share(){try{if(navigator.share)await navigator.share({title,text:title,url});else await copy()}catch(e){if(e?.name!=="AbortError")say("تعذر فتح المشاركة")}}
  return <div className="share-qr"><UiButton variant="secondary" size="compact" className="share-qr-button" onClick={share}><Icon name="share" size={17}/>{label}</UiButton>{status&&<span className="share-status" role="status">{status}</span>}{qr&&<details><summary>QR</summary><img src={qr} alt={`QR ${title}`}/><small>{url}</small></details>}</div>;
}
