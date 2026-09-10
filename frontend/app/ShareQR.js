"use client";

import {useEffect,useState} from "react";
import QRCode from "qrcode";
import Icon from "./Icon";

export default function ShareQR({url,title="مربوعة",label="مشاركة"}){
  const [qr,setQr]=useState("");
  useEffect(()=>{if(url)QRCode.toDataURL(url,{width:220,margin:1,errorCorrectionLevel:"M"}).then(setQr).catch(()=>{});},[url]);
  async function share(){try{if(navigator.share)await navigator.share({title,text:title,url});else{await navigator.clipboard.writeText(url);alert("تم نسخ الرابط");}}catch{}}
  return <div className="share-qr"><button onClick={share}><Icon name="share" size={17}/>{label}</button>{qr&&<details><summary>QR</summary><img src={qr} alt={`QR ${title}`}/><small>{url}</small></details>}</div>;
}
