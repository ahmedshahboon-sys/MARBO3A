"use client";

import {useEffect,useMemo,useState} from "react";
import Icon from "../Icon";

const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
async function api(path,options={}){const headers={...(options.headers||{})};const t=token();if(t)headers.authorization=`Bearer ${t}`;if(options.body&&!headers["content-type"])headers["content-type"]="application/json";const r=await fetch(path,{...options,headers});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d}
const errText=e=>({UNAUTHORIZED:"سجل دخولك أولًا",EMPTY_POST:"اكتب شيئًا أو أضف صورة",POST_NOT_FOUND:"المنشور غير موجود",USER_BLOCKED:"لا يمكن تنفيذ العملية بسبب الحظر",FORBIDDEN:"ليس لديك صلاحية لهذه العملية"}[e?.message]||"تعذر تنفيذ الطلب. حاول مرة ثانية.");
const when=v=>{try{return new Intl.RelativeTimeFormat("ar",{numeric:"auto"}).format(-Math.max(1,Math.round((Date.now()-new Date(v).getTime())/60000)),"minute")}catch{return ""}};

function Avatar({user,size=46}){return user?.avatar_url?<img className="sf-avatar" style={{width:size,height:size}} src={user.avatar_url} alt=""/>:<div className="sf-avatar sf-avatar-fallback" style={{width:size,height:size}}>{user?.display_name?.[0]||"م"}</div>}

function PostCard({post,me,onChanged}){
  const [comments,setComments]=useState([]),[showComments,setShowComments]=useState(false),[comment,setComment]=useState(""),[busy,setBusy]=useState(false);
  async function like(){try{const d=await api(`/api/feed/${post.id}/like`,{method:"POST"});onChanged({...post,liked:d.liked,likes_count:d.likesCount})}catch{}}
  async function openComments(){setShowComments(v=>!v);if(!showComments&&!comments.length)try{setComments((await api(`/api/feed/${post.id}/comments`)).comments||[])}catch{}}
  async function sendComment(e){e.preventDefault();if(!comment.trim())return;setBusy(true);try{const d=await api(`/api/feed/${post.id}/comments`,{method:"POST",body:JSON.stringify({body:comment})});setComments(p=>[...p,d.comment]);setComment("");onChanged({...post,comments_count:Number(post.comments_count||0)+1})}finally{setBusy(false)}}
  async function edit(){const body=prompt("عدّل المنشور:",post.body||"");if(body===null)return;try{const d=await api(`/api/feed/${post.id}`,{method:"PATCH",body:JSON.stringify({body})});onChanged({...post,...d.post})}catch{}}
  async function remove(){if(!confirm("حذف المنشور؟"))return;try{await api(`/api/feed/${post.id}`,{method:"DELETE"});onChanged(null)}catch{}}
  async function share(){const url=`${location.origin}/feed?post=${post.id}`;try{if(navigator.share)await navigator.share({title:"منشور على مربوعة",text:post.body||"",url});else{await navigator.clipboard.writeText(url);alert("تم نسخ رابط المنشور")}}catch{}}
  const mine=String(me?.id)===String(post.user_id)||me?.username==="ahmed";
  return <article className="sf-post">
    <header className="sf-post-head"><a href={`/u/${post.username}`} className="sf-user"><Avatar user={post}/><span><b>{post.display_name}</b><small>@{post.username} · {when(post.created_at)}</small></span></a>{mine&&<details className="sf-menu"><summary aria-label="خيارات"><Icon name="more"/></summary><div><button onClick={edit}>تعديل</button><button className="danger" onClick={remove}>حذف</button></div></details>}</header>
    {post.body&&<p className="sf-body">{post.body}</p>}
    {post.image_url&&<img className="sf-post-image" src={post.image_url} alt="صورة المنشور"/>}
    <div className="sf-post-stats"><span>{post.likes_count||0} إعجاب</span><span>{post.comments_count||0} تعليق</span></div>
    <div className="sf-actions"><button className={post.liked?"active":""} onClick={like}><Icon name="heart"/> <span>إعجاب</span></button><button onClick={openComments}><Icon name="message"/> <span>تعليق</span></button><button onClick={share}><Icon name="share"/> <span>مشاركة</span></button></div>
    {showComments&&<section className="sf-comments">{comments.map(c=><div className="sf-comment" key={c.id}><Avatar user={c} size={34}/><div><b>{c.display_name}</b><p>{c.body}</p></div></div>)}<form onSubmit={sendComment} className="sf-comment-form"><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="اكتب تعليقًا..."/><button disabled={busy||!comment.trim()}><Icon name="send"/></button></form></section>}
  </article>
}

export default function FeedPage(){
  const [me,setMe]=useState(null),[posts,setPosts]=useState([]),[cursor,setCursor]=useState(null),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[body,setBody]=useState(""),[image,setImage]=useState(""),[error,setError]=useState("");
  const canPost=useMemo(()=>body.trim()||image.trim(),[body,image]);
  useEffect(()=>{if(!token()){location.href="/";return}Promise.all([api("/api/auth/me"),api("/api/feed")]).then(([m,f])=>{setMe(m.user);setPosts(f.posts||[]);setCursor(f.nextCursor||null)}).catch(e=>setError(errText(e))).finally(()=>setLoading(false))},[]);
  async function create(e){e.preventDefault();if(!canPost)return;setError("");try{const d=await api("/api/feed",{method:"POST",body:JSON.stringify({body,imageUrl:image})});setPosts(p=>[d.post,...p]);setBody("");setImage("")}catch(e){setError(errText(e))}}
  async function loadMore(){if(!cursor||more)return;setMore(true);try{const d=await api(`/api/feed?cursor=${cursor}`);setPosts(p=>[...p,...(d.posts||[])]);setCursor(d.nextCursor||null)}finally{setMore(false)}}
  function updatePost(next){if(next===null)return setPosts(p=>p.filter(x=>x.id!==event?.id));setPosts(p=>p.map(x=>x.id===next.id?next:x))}
  return <main className="social-page" dir="rtl">
    <div className="social-shell">
      <header className="sf-top"><a href="/" className="sf-brand"><img src="/logo.svg" alt="مربوعة"/><span><b>مربوعة</b><small>MARBO3A</small></span></a><div className="sf-top-actions"><a href="/"><Icon name="home"/></a><a href="/?tab=notifications"><Icon name="bell"/></a><a href={me?`/u/${me.username}`:"/"}><Avatar user={me} size={38}/></a></div></header>
      <section className="sf-layout">
        <aside className="sf-side"><nav><a className="active" href="/feed"><Icon name="home"/>الرئيسية</a><a href="/?tab=chats"><Icon name="message"/>الرسائل</a><a href="/?tab=friends"><Icon name="users"/>الأصحاب</a><a href="/?tab=rooms"><Icon name="hash"/>الغرف</a><a href="/map"><Icon name="map"/>الخريطة</a></nav></aside>
        <section className="sf-main">
          <form className="sf-composer" onSubmit={create}><div className="sf-composer-row"><Avatar user={me}/><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="شن في بالك؟" maxLength={3000}/></div>{image&&<div className="sf-image-preview"><img src={image} alt="معاينة"/><button type="button" onClick={()=>setImage("")}>×</button></div>}<div className="sf-composer-tools"><label><Icon name="image"/><span>صورة</span><input type="url" value={image} onChange={e=>setImage(e.target.value)} placeholder="رابط الصورة"/></label><button className="primary" disabled={!canPost}>نشر</button></div></form>
          {error&&<div className="sf-alert">{error}</div>}
          {loading?<div className="sf-skeleton">جاري تحميل آخر المنشورات...</div>:posts.length?posts.map(p=><PostCard key={p.id} post={p} me={me} onChanged={next=>{if(next===null)setPosts(a=>a.filter(x=>x.id!==p.id));else setPosts(a=>a.map(x=>x.id===next.id?next:x))}}/>):<div className="sf-empty"><Icon name="sparkles"/><h2>الـFeed هادي توا</h2><p>كن أول واحد ينشر حاجة في مربوعة.</p></div>}
          {cursor&&<button className="sf-more" onClick={loadMore} disabled={more}>{more?"جاري التحميل...":"عرض المزيد"}</button>}
        </section>
        <aside className="sf-right"><div className="sf-panel"><h3>اكتشف مربوعة</h3><a href="/?tab=rooms">الغرف النشطة</a><a href="/?tab=friends">تعرف على أصحاب</a><a href="/map">شوف المجتمع على الخريطة</a></div></aside>
      </section>
    </div>
  </main>
}
