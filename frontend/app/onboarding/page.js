"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import Icon from "../Icon";
import {fetchJson} from "../request";
import {sessionMarker,clearCookieSession,cookieHeaders} from "../webSession";

const token=()=>sessionMarker();
const clearToken=()=>clearCookieSession();
const authHeaders=()=>cookieHeaders();
function finishTarget(){try{const raw=sessionStorage.getItem("marbo3a_after_onboarding")||sessionStorage.getItem("marbo3a_return_to")||"/home";sessionStorage.removeItem("marbo3a_after_onboarding");sessionStorage.removeItem("marbo3a_return_to");const value=String(raw||"").trim(),decoded=decodeURIComponent(value);if(!value.startsWith("/")||value.startsWith("//")||value.includes("\\")||decoded.startsWith("//")||decoded.includes("\\"))return"/home";const u=new URL(value,"https://marbo3a.invalid"),pathname=u.pathname||"/";if(u.origin!=="https://marbo3a.invalid")return"/home";return pathname!=="/"&&pathname!=="/explore"&&!pathname.startsWith("/explore/")&&pathname!=="/onboarding"?`${u.pathname}${u.search}${u.hash}`:"/home"}catch{return"/home"}}
const messageFor=e=>e?.message==="REQUEST_TIMEOUT"?"الاتصال تأخر. جرّب مرة ثانية أو تأكد من الشبكة.":e?.message==="REQUEST_FAILED"?"تعذر الاتصال بالسيرفر. جرّب مرة ثانية.":"تعذر تجهيز بيانات البداية. جرّب مرة ثانية.";

export default function OnboardingRoute(){
  const router=useRouter();
  const[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const[step,setStep]=useState(0),[bio,setBio]=useState(""),[city,setCity]=useState(""),[showCity,setShowCity]=useState(true);

  useEffect(()=>{
    let alive=true;
    const t=token();
    if(!t){router.replace("/");return()=>{alive=false}}
    setLoading(true);setError("");
    fetchJson("/api/onboarding",{headers:authHeaders(),credentials:"same-origin",cache:"no-store"},8000).then(d=>{
      if(!alive)return;
      if(d.completed){router.replace(finishTarget());return}
      setBio(d.profile?.bio||"");setCity(d.profile?.city||"");setShowCity(d.profile?.show_city!==false);setLoading(false);
    }).catch(e=>{
      if(!alive)return;
      if(e.status===401){clearToken();router.replace("/");return}
      setError(messageFor(e));setLoading(false);
    });
    return()=>{alive=false};
  },[router,attempt]);

  async function finish(){
    setBusy(true);setError("");
    try{
      await fetchJson("/api/onboarding/complete",{method:"PATCH",headers:{...authHeaders(),"content-type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({bio,city,showCity})},12000);
      try{localStorage.setItem("marbo3a_permissions_intro_pending","1")}catch{}
      try{window.dispatchEvent(new CustomEvent("marbo3a:onboarding-complete"))}catch{}
      router.replace(finishTarget());
    }catch(e){
      if(e.status===401){clearToken();router.replace("/");return}
      setError(messageFor(e));
    }finally{setBusy(false)}
  }

  if(loading)return <main className="onboarding-backdrop" dir="rtl"><section className="onboarding-card onboarding-route-card"><div className="onboarding-logo"><img src="/brand/official/marbo3a-mark.png" alt="مربوعة"/></div><small>MARBO3A</small><h2>نجهز حسابك</h2><p>ثواني ونفتح لك مربوعة. لو الشبكة ضعيفة ما بنخلوكش عالق.</p><div className="onboarding-route-loading" role="status">جاري تحميل بيانات البداية...</div></section></main>;

  if(error)return <main className="onboarding-backdrop" dir="rtl"><section className="onboarding-card onboarding-route-card"><div className="onboarding-logo"><img src="/brand/official/marbo3a-mark.png" alt="مربوعة"/></div><small>مشكلة اتصال</small><h2>ما قدرناش نكمل البداية</h2><p>{error}</p><div className="onboarding-actions single"><button className="onboarding-primary" type="button" onClick={()=>setAttempt(x=>x+1)}>إعادة المحاولة</button><a className="onboarding-secondary onboarding-link" href="/explore">استكشف كزائر</a></div><button className="onboarding-route-signout" type="button" onClick={()=>{clearToken();location.replace("/")}}>الرجوع لتسجيل الدخول</button></section></main>;

  return <main className="onboarding-backdrop" dir="rtl"><section className="onboarding-card onboarding-route-card" role="dialog" aria-labelledby="onboarding-title">
    <div className="onboarding-logo"><img src="/brand/official/marbo3a-mark.png" alt="مربوعة"/></div>
    <small>{step===0?"أهلًا بيك في مربوعة":"آخر خطوة"}</small>
    <h2 id="onboarding-title">{step===0?"جهز حسابك في أقل من دقيقة":"عرّف الناس عليك"}</h2>
    {step===0?<>
      <p>مربوعة منصة تواصل اجتماعي فيها منشورات، أصحاب، غرف صوتية ورسائل. هذي الخطوات اختيارية وما بنطلبوش منك تعطي أكثر من اللي تبيه.</p>
      <div className="onboarding-points"><span><Icon name="users"/> تعرّف على ناس ومجتمعك</span><span><Icon name="mic"/> ادخل الغرف واسمع أو اطلع على كرسي</span><span><Icon name="shield"/> أنت تتحكم في خصوصيتك وأذونات جهازك</span></div>
      <div className="onboarding-actions single"><button className="onboarding-primary" type="button" onClick={()=>setStep(1)}>نكمل</button></div>
    </>:<>
      <p>تقدر تعدل المعلومات هذي في أي وقت من الإعدادات.</p>
      <label>نبذة قصيرة<textarea value={bio} onChange={e=>setBio(e.target.value.slice(0,220))} placeholder="قول للناس حاجة بسيطة عليك..."/><small>{bio.length}/220</small></label>
      <label>المدينة<input value={city} onChange={e=>setCity(e.target.value.slice(0,80))} placeholder="مثال: طرابلس"/></label>
      <label className="onboarding-switch"><span>إظهار المدينة في الملف<small>تقدر تطفيها بعدين من الخصوصية</small></span><input type="checkbox" checked={showCity} onChange={e=>setShowCity(e.target.checked)}/></label>
      {error&&<div className="onboarding-error" role="alert">{error}</div>}
      <div className="onboarding-actions"><button className="onboarding-secondary" type="button" disabled={busy} onClick={()=>setStep(0)}>رجوع</button><button className="onboarding-primary" type="button" disabled={busy} onClick={finish}>{busy?"جاري الحفظ...":"ادخل مربوعة"}</button></div>
    </>}
  </section></main>;
}
