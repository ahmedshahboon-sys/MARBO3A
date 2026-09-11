const nativeImageTypes=new Set(["image/jpeg","image/png","image/webp","image/gif"]);
const looksLikeImage=file=>Boolean(file?.type?.startsWith("image/")||/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file?.name||""));
const isHeic=file=>/image\/(heic|heif)/i.test(file?.type||"")||/\.(heic|heif)$/i.test(file?.name||"");

async function decodeImage(file){
  if(typeof createImageBitmap==="function"){
    try{return {source:await createImageBitmap(file,{imageOrientation:"from-image"}),cleanup:s=>s?.close?.()}}catch{}
  }
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.decoding="async";
    img.onload=()=>resolve({source:img,cleanup:()=>URL.revokeObjectURL(url)});
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error(isHeic(file)?"HEIC_DECODE_FAILED":"IMAGE_PROCESS_FAILED"))};
    img.src=url;
  });
}

async function convertHeic(file){
  try{
    const mod=await import("heic2any");
    const convert=mod.default||mod;
    const result=await convert({blob:file,toType:"image/jpeg",quality:.92});
    const blob=Array.isArray(result)?result[0]:result;
    if(!(blob instanceof Blob)||!blob.size)throw new Error("HEIC_DECODE_FAILED");
    const base=(file.name||"image").replace(/\.[^.]+$/,"" ).slice(0,80)||"image";
    return new File([blob],`${base}.jpg`,{type:"image/jpeg",lastModified:Date.now()});
  }catch(e){
    throw new Error("HEIC_DECODE_FAILED");
  }
}

const canvasBlob=(canvas,type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));

export async function compressImage(file,{maxDimension=2200,targetBytes=1800000}={}){
  if(!looksLikeImage(file))return file;
  if(file.type==="image/gif")return file;
  let decoded,sourceFile=file,converted=false;
  try{
    decoded=await decodeImage(sourceFile);
  }catch(e){
    if(!isHeic(file))throw e;
    sourceFile=await convertHeic(file);
    converted=true;
    decoded=await decodeImage(sourceFile);
  }
  const src=decoded.source;
  try{
    const sw=Number(src.width||src.naturalWidth||0),sh=Number(src.height||src.naturalHeight||0);
    if(!sw||!sh)throw new Error("IMAGE_PROCESS_FAILED");
    const scale=Math.min(1,maxDimension/Math.max(sw,sh));
    const width=Math.max(1,Math.round(sw*scale)),height=Math.max(1,Math.round(sh*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("IMAGE_PROCESS_FAILED");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);ctx.drawImage(src,0,0,width,height);
    let blob=null,outType="image/webp",ext="webp";
    for(const q of [.92,.88,.84,.80,.76]){blob=await canvasBlob(canvas,"image/webp",q);if(blob&&blob.size<=targetBytes)break}
    if(!blob){outType="image/jpeg";ext="jpg";for(const q of [.92,.88,.84,.80,.76]){blob=await canvasBlob(canvas,"image/jpeg",q);if(blob&&blob.size<=targetBytes)break}}
    if(!blob)throw new Error("IMAGE_PROCESS_FAILED");
    const safeOriginal=nativeImageTypes.has(file.type);
    if(!converted&&safeOriginal&&!isHeic(file)&&blob.size>=file.size&&scale===1)return file;
    const base=(file.name||"image").replace(/\.[^.]+$/,"" ).slice(0,80)||"image";
    return new File([blob],`${base}.${ext}`,{type:outType,lastModified:Date.now()});
  }finally{decoded.cleanup?.(src)}
}

export async function uploadMedia(file,token,{compress=true,onState}={}){
  if(!file)throw new Error("NO_FILE");
  onState?.("processing");
  let prepared=file;
  if(compress&&looksLikeImage(file))prepared=await compressImage(file);
  if(isHeic(file)&&prepared===file)throw new Error("HEIC_DECODE_FAILED");
  if(prepared.size>8*1024*1024)throw new Error("FILE_TOO_LARGE");
  onState?.("uploading");
  const fd=new FormData();fd.append("file",prepared,prepared.name||file.name||"upload");
  const r=await fetch("/api/uploads",{method:"POST",headers:token?{authorization:`Bearer ${token}`}:{},body:fd,cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||"UPLOAD_FAILED");
  if(!d.file?.url)throw new Error("UPLOAD_FAILED");
  onState?.("done");
  return {...d,originalSize:file.size,uploadedSize:prepared.size,compressed:prepared!==file};
}
