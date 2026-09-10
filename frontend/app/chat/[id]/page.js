"use client";
import {useEffect,useRef,useState} from "react";
import {useParams} from "next/navigation";
import Icon from "../../Icon";

const token=()=>localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||"";
async function api(path,options={}){const headers={authorization:`Bearer ${token()}`,...(options.headers||{})};if(options.body&&!(options.body instanceof FormData))headers["content-type"]="application/json";const r=await fetch(path,{...options,headers,cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"REQUEST_FAILED");return d;}
const human=e=>({REQUEST_FAILED:"تعذر تنفيذ الطلب",CHAT_FORBIDDEN:"لا يمكنك فتح هذه المحادثة",UNAUTHORIZED:"انتهت جلسة الدخول",MESSAGE_NOT_FOUND:"الرسالة غير موجودة",FORBIDDEN:"ليس لديك صلاحية لهذه العملية",UPLOAD_FAILED:"تعذر رفع الملف"}[e?.message]||"صار خطأ. حاول مرة ثانية.");

export default function DirectChat(){
  const{id}=useParams();
  const[messages,setMessages]=useState([]),[text,setText]=useState(""),[reply,setReply]=useState(null),[typing,setTyping]=useState([]),[search,setSearch]=useState(""),[results,setResults]=useState([]),[status,setStatus]=useState(""),[attachment,setAttachment]=useState(null),[chats,setChats]=useState([]),[me,setMe]=useState(null),[receipt,setReceipt]=useState(null),[uploading,setUploading]=useState(false),[sending,setSending]=useState(false);
  const box=useRef(null),typingTimer=useRef(null),lastReadSent=useRef(0),mounted=useRef(true),stickToBottom=useRef(true),firstPaint=useRef(true);

  async function loadShell(){
    try{
      const[m,c]=await Promise.all([api("/api/auth/me"),api("/api/chats")]);
      if(!mounted.current)return;
      setMe(m.user||null);setChats(c.chats||[]);
    }catch(e){if(mounted.current)setStatus(human(e))}
  }

  async function markRead(list){
    const lastIncoming=[...list].reverse().find(m=>String(m.sender_id)!==String(me?.id));
    const lastId=Number(lastIncoming?.id||0);
    if(!lastId||lastId<=lastReadSent.current||document.visibilityState!=="visible")return;
    try{await api(`/api/chats/${id}/read`,{method:"POST"});lastReadSent.current=lastId}catch{}
  }

  async function loadMessages({mark=true}={}){
    try{
      const[d,rc]=await Promise.all([api(`/api/chats/${id}/messages`),api(`/api/chats/${id}/receipt`).catch(()=>({receipt:null}))]);
      if(!mounted.current)return;
      const list=d.messages||[];setMessages(list);setReceipt(rc.receipt||null);
      if(mark)await markRead(list);
    }catch(e){if(mounted.current)setStatus(human(e))}
  }

  useEffect(()=>{mounted.current=true;if(!id)return;firstPaint.current=true;stickToBottom.current=true;loadShell();return()=>{mounted.current=false}},[id]);
  useEffect(()=>{if(!id||!me)return;loadMessages();const tick=()=>{if(document.visibilityState==="visible")loadMessages()};const t=setInterval(tick,3500);const onVisible=()=>document.visibilityState==="visible"&&loadMessages();document.addEventListener("visibilitychange",onVisible);return()=>{clearInterval(t);document.removeEventListener("visibilitychange",onVisible)}},[id,me?.id]);
  useEffect(()=>{if(!id)return;const tick=()=>{if(document.visibilityState==="visible")api(`/api/typing/direct/${id}`).then(d=>mounted.current&&setTyping(d.users||[])).catch(()=>{})};tick();const ty=setInterval(tick,2800);return()=>clearInterval(ty)},[id]);
  useEffect(()=>{const el=box.current;if(!el)return;if(firstPaint.current||stickToBottom.current){requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight;firstPaint.current=false})}},[messages]);

  function onChatScroll(){const el=box.current;if(!el)return;stickToBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<90;}
  async function send(e){e.preventDefault();if((!text.trim()&&!attachment)||sending)return;setSending(true);stickToBottom.current=true;try{await api(`/api/chats/${id}/messages`,{method:"POST",body:JSON.stringify({body:text.trim(),replyToId:reply?.id||null,attachmentUrl:attachment?.url||null,attachmentType:attachment?.type||null})});setText("");setReply(null);setAttachment(null);await loadMessages({mark:false})}catch(e){setStatus(human(e))}finally{setSending(false)}}
  function onType(v){setText(v);api(`/api/typing/direct/${id}`,{method:"POST",body:JSON.stringify({typing:true})}).catch(()=>{});clearTimeout(typingTimer.current);typingTimer.current=setTimeout(()=>api(`/api/typing/direct/${id}`,{method:"POST",body:JSON.stringify({typing:false})}).catch(()=>{}),4500)}
  async function upload(file){if(!file||uploading)return;setUploading(true);const fd=new FormData();fd.append("file",file);try{const d=await api("/api/uploads",{method:"POST",body:fd});setAttachment(d.file)}catch(e){setStatus(human(e))}finally{setUploading(false)}}
  async function react(m,emoji){try{await api(`/api/messages/direct/${m.id}/reactions`,{method:"POST",body:JSON.stringify({emoji})});setStatus(`تم التفاعل ${emoji}`)}catch(e){setStatus(human(e))}}
  async function edit(m){const body=prompt("تعديل الرسالة:",m.body||"");if(body===null||!body.trim())return;try{await api(`/api/direct-messages/${m.id}`,{method:"PATCH",body:JSON.stringify({body})});await loadMessages({mark:false})}catch(e){setStatus(human(e))}}
  async function remove(m){if(!confirm("حذف الرسالة من الطرفين؟"))return;try{await api(`/api/direct-messages/${m.id}`,{method:"DELETE"});await loadMessages({mark:false})}catch(e){setStatus(human(e))}}
  async function forward(m){const options=chats.filter(c=>String(c.id)!==String(id)).map(c=>`${c.id}: ${c.display_name} (@${c.username})`).join("\n");if(!options)return setStatus("ما عندكش محادثة ثانية لإعادة التوجيه");const target=Number(prompt(`اختر رقم المحادثة:\n${options}`));if(!Number.isInteger(target))return;try{await api(`/api/direct-messages/${m.id}/forward`,{method:"POST",body:JSON.stringify({conversationId:target})});setStatus("تمت إعادة توجيه الرسالة")}catch(e){setStatus(human(e))}}
  async function doSearch(e){e.preventDefault();if(!search.trim())return;try{setResults((await api(`/api/chats/${id}/search?q=${encodeURIComponent(search)}`)).messages||[])}catch(e){setStatus(human(e))}}

  const peer=chats.find(c=>String(c.id)===String(id));const readId=Number(receipt?.last_read_message_id||0);
  return <main className="social-page chat-social" dir="rtl"><div className="chat-social-shell"><header className="chat-social-head"><a href="/messages" className="chat-icon-btn"><Icon name="close"/></a><div><small>{peer?.username?`@${peer.username}`:"محادثة خاصة"}</small><h1>{peer?.display_name||"الرسائل"}</h1></div><button className="chat-icon-btn" onClick={()=>document.getElementById("chat-search")?.classList.toggle("show")}><Icon name="search"/></button></header><form id="chat-search" className="chat-search" onSubmit={doSearch}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في المحادثة"/><button>بحث</button></form>{results.length>0&&<div className="chat-search-results">{results.map(m=><button key={m.id} onClick={()=>document.getElementById(`dm-${m.id}`)?.scrollIntoView({behavior:"smooth",block:"center"})}>{m.body||"مرفق"}</button>)}</div>}{status&&<div className="chat-toast" onClick={()=>setStatus("")}>{status}</div>}<section ref={box} onScroll={onChatScroll} className="chat-stream">{messages.map(m=>{const mine=String(m.sender_id)===String(me?.id),seen=mine&&Number(m.id)<=readId;return <article id={`dm-${m.id}`} key={m.id} className={`chat-bubble ${mine?"mine":"theirs"}`}><div className="chat-bubble-head"><b>{mine?"أنت":(m.display_name||m.username||`#${m.sender_id}`)}</b><details><summary><Icon name="more"/></summary><div><div className="chat-menu-reactions"><button onClick={()=>react(m,"👍")}>👍</button><button onClick={()=>react(m,"❤️")}>❤️</button><button onClick={()=>react(m,"😂")}>😂</button></div><button onClick={()=>setReply(m)}>رد</button>{mine&&!m.deleted_at&&<button onClick={()=>edit(m)}>تعديل</button>}{!m.deleted_at&&<button onClick={()=>forward(m)}>إعادة توجيه</button>}{mine&&!m.deleted_at&&<button className="danger" onClick={()=>remove(m)}>حذف للطرفين</button>}</div></details></div>{m.reply_to_id&&<small className="chat-reply-tag">رد على رسالة #{m.reply_to_id}</small>}<p>{m.deleted_at?"تم حذف الرسالة":m.body}</p>{m.attachment_url&&(m.attachment_type?.startsWith("image/")||/\.(png|jpe?g|webp|gif)(\?|$)/i.test(m.attachment_url))?<a href={m.attachment_url} target="_blank" rel="noreferrer"><img className="chat-image-preview" src={m.attachment_url} alt="صورة مرفقة"/></a>:m.attachment_url&&<a className="chat-attachment" href={m.attachment_url} target="_blank" rel="noreferrer">فتح المرفق</a>}<footer><small>{new Date(m.created_at).toLocaleTimeString("ar-LY",{hour:"2-digit",minute:"2-digit"})}{m.edited_at?" · معدّلة":""}{seen?" · تمت القراءة":""}</small></footer></article>})}</section>{typing.length>0&&<div className="chat-typing">{typing.map(x=>x.displayName||x.username).join("، ")} يكتب...</div>}{reply&&<div className="chat-replying"><span>رد على: {reply.body?.slice(0,90)||"مرفق"}</span><button onClick={()=>setReply(null)}>إلغاء</button></div>}{attachment&&<div className="chat-replying"><span>مرفق جاهز: {attachment.name}</span><button onClick={()=>setAttachment(null)}>إلغاء</button></div>}<form onSubmit={send} className="chat-compose"><label className={`chat-icon-btn ${uploading?"busy":""}`}><Icon name="image"/><input type="file" accept="image/*,audio/*,application/pdf" hidden disabled={uploading||sending} onChange={e=>upload(e.target.files?.[0])}/></label><input value={text} onChange={e=>onType(e.target.value)} placeholder={uploading?"جاري رفع الملف...":"اكتب رسالتك..."} disabled={sending}/><button className="chat-send" disabled={sending||uploading||(!text.trim()&&!attachment)}><Icon name="send"/></button></form></div></main>;
}
