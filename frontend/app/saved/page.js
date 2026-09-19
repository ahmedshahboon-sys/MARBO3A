"use client";
import {useEffect,useState} from "react";
import Icon from "../Icon";
import {PostCard} from "../SocialFeed";
const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
async function api(path){const headers={"x-marbo3a-session-mode":"cookie"};const r=await fetch(path,{headers,cache:"no-store",credentials:"same-origin"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}
export default function SavedPage(){
 const[me,setMe]=useState(null),[posts,setPosts]=useState([]),[loading,setLoading]=useState(true),[status,setStatus]=useState("");
 async function load(){setLoading(true);try{const[m,s]=await Promise.all([api("/api/auth/me"),api("/api/saved")]);setMe(m.user||null);setPosts((s.posts||[]).map(p=>({...p,saved:true})));setStatus("")}catch(e){setStatus(e.message==="UNAUTHORIZED"?"انتهت جلسة الدخول":"تعذر تحميل المحفوظات")}finally{setLoading(false)}}
 useEffect(()=>{if(!token()){location.href="/";return}load()},[]);
 return <main className="social-page saved-page" dir="rtl"><div className="social-shell"><div className="sf-simple-page"><section className="sf-panel"><div className="sf-section-head"><div><h1>المحفوظات</h1><p>المنشورات اللي حفظتها ترجع لها من هنا.</p></div><a href="/home" className="sf-primary"><Icon name="home"/> الرئيسية</a></div>{status&&<div className="sf-alert" role="status" onClick={()=>setStatus("")}>{status}</div>}{loading&&<div className="sf-skeleton">جاري تحميل المحفوظات...</div>}{!loading&&posts.map(post=><PostCard key={post.id} post={post} me={me} onError={setStatus} onChanged={next=>setPosts(list=>next.saved===false?list.filter(x=>String(x.id)!==String(next.id)):list.map(x=>String(x.id)===String(next.id)?next:x))} onRemoved={id=>setPosts(list=>list.filter(x=>String(x.id)!==String(id)))}/>)}{!loading&&!posts.length&&!status&&<div className="sf-empty"><Icon name="bookmark"/><h2>ما عندكش منشورات محفوظة</h2><p>من خيارات أي منشور اختار «حفظ المنشور» وبتلقاه هنا.</p></div>}</section></div></div></main>;
}
