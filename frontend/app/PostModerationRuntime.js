"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {createPortal} from "react-dom";

const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
async function api(path,options={}){const t=token(),headers={...(options.headers||{})};if(t&&t!=="cookie")headers.authorization=`Bearer ${t}`;if(options.body&&!headers["content-type"])headers["content-type"]="application/json";const r=await fetch(path,{...options,headers,credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}

export default function PostModerationRuntime(){
 const path=usePathname(),[canDeleteAny,setCanDeleteAny]=useState(false),[targets,setTargets]=useState([]),[busy,setBusy]=useState(null);
 useEffect(()=>{let dead=false;api("/api/security/me").then(d=>{if(!dead)setCanDeleteAny(Boolean(d?.permissions?.includes("posts.delete_any")))}).catch(()=>{if(!dead)setCanDeleteAny(false)});return()=>{dead=true}},[]);
 useEffect(()=>{if(!canDeleteAny)return;let frame=0;const scan=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const next=[...document.querySelectorAll("article.sf-post[id^='post-']")].map(el=>{const id=Number(String(el.id).replace("post-","")),host=el.querySelector(".sf-post-head-actions");return Number.isSafeInteger(id)&&id>0&&host?{id,host}:null}).filter(Boolean);setTargets(prev=>{const a=prev.map(x=>`${x.id}:${x.host===next.find(n=>n.id===x.id)?.host}`).join("|"),b=next.map(x=>`${x.id}:true`).join("|");return a===b?prev:next})})};scan();const mo=new MutationObserver(scan);mo.observe(document.body,{childList:true,subtree:true});return()=>{cancelAnimationFrame(frame);mo.disconnect();setTargets([])}},[canDeleteAny,path]);
 async function remove(id){if(busy)return;const reason=window.prompt("سبب حذف المنشور (مطلوب في سجل الإدارة):","");if(reason===null)return;const clean=reason.trim();if(clean.length<3){window.alert("اكتب سبب واضح للحذف، 3 أحرف على الأقل.");return}if(!window.confirm("متأكد من حذف المنشور؟ يمكن استرجاعه لاحقًا من أدوات الإدارة."))return;setBusy(id);try{await api(`/api/admin/posts/${id}`,{method:"DELETE",body:JSON.stringify({reason:clean})});document.getElementById(`post-${id}`)?.remove();window.dispatchEvent(new CustomEvent("marbo3a:moderation:post-deleted",{detail:{postId:id}}))}catch(e){window.alert(e.message==="FORBIDDEN"?"ليس لديك صلاحية حذف هذا المنشور.":e.message==="AUDIT_REASON_REQUIRED"?"سبب الحذف مطلوب.":"تعذر حذف المنشور الآن.")}finally{setBusy(null)}}
 if(!canDeleteAny)return null;
 return <>{targets.map(({id,host})=>createPortal(<button key={`admin-delete-${id}`} type="button" className="admin-inline-post-delete" disabled={busy===id} onClick={()=>remove(id)} aria-label="حذف المنشور بصلاحية إدارة المحتوى" title="حذف المنشور بصلاحية إدارة المحتوى">{busy===id?"جاري الحذف...":"حذف إداري"}</button>,host,`admin-delete-${id}`))}</>;
}
