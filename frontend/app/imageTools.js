export async function compressImage(file,{maxDimension=2200,targetBytes=1800000}={}){
  if(!file?.type?.startsWith("image/"))return file;
  if(file.type==="image/gif")return file;
  const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale));
  const height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d",{alpha:false});ctx.drawImage(bitmap,0,0,width,height);bitmap.close?.();
  let quality=.92,blob=null;
  for(const q of [.92,.88,.84,.80,.76]){quality=q;blob=await new Promise(r=>canvas.toBlob(r,"image/webp",q));if(blob&&blob.size<=targetBytes)break;}
  if(!blob)throw new Error("IMAGE_PROCESS_FAILED");
  if(blob.size>=file.size&&scale===1)return file;
  const base=(file.name||"image").replace(/\.[^.]+$/,"" ).slice(0,80);
  return new File([blob],`${base}.webp`,{type:"image/webp",lastModified:Date.now()});
}

export async function uploadMedia(file,token,{compress=true,onState}={}){
  if(!file)throw new Error("NO_FILE");
  onState?.("processing");
  let prepared=file;
  if(compress&&file.type?.startsWith("image/"))prepared=await compressImage(file);
  if(prepared.size>8*1024*1024)throw new Error("FILE_TOO_LARGE");
  onState?.("uploading");
  const fd=new FormData();fd.append("file",prepared);
  const r=await fetch("/api/uploads",{method:"POST",headers:token?{authorization:`Bearer ${token}`}:{},body:fd});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"UPLOAD_FAILED");
  onState?.("done");
  return {...d,originalSize:file.size,uploadedSize:prepared.size,compressed:prepared!==file};
}
