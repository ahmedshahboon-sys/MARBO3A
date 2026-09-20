"use client";
import {createContext,useContext,useMemo,useState} from "react";

const AdminStepUpContext=createContext(null);

async function api(path,options={}){
  const headers={"x-marbo3a-session-mode":"cookie",...(options.headers||{})};
  if(options.body)headers["content-type"]="application/json";
  const r=await fetch(path,{...options,headers,credentials:"same-origin",cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.error||"REQUEST_FAILED");e.status=r.status;e.data=d;throw e}
  return d;
}
const human=e=>({
  ADMIN_2FA_REQUIRED:"فعّل المصادقة الثنائية من إعدادات الأمان قبل تنفيذ عمليات الإدارة الحساسة.",
  ADMIN_STEP_UP_REQUIRED:"جلسة الأمان غير مفعلة أو انتهت. أعد التحقق.",
  WRONG_PASSWORD:"كلمة المرور الحالية غير صحيحة.",
  STEP_UP_EXPIRED:"انتهت صلاحية رمز الأمان.",
  STEP_UP_INVALID:"رمز الأمان غير صحيح.",
  STEP_UP_TOO_MANY_ATTEMPTS:"محاولات كثيرة. أعد التحقق من البداية.",
  EMAIL_NOT_CONFIGURED:"خدمة البريد غير مجهزة لإرسال رمز الأمان.",
  EMAIL_SEND_FAILED:"تعذر إرسال رمز الأمان الآن."
}[e?.message]||e?.message||"تعذر فتح جلسة الأمان.");

export function AdminStepUpProvider({children}){
  const[grant,setGrant]=useState("");
  const[expiresAt,setExpiresAt]=useState(0);
  const[challenge,setChallenge]=useState("");
  const[password,setPassword]=useState("");
  const[code,setCode]=useState("");
  const[status,setStatus]=useState("");

  const active=Boolean(grant&&expiresAt>Date.now());
  function clear(){setGrant("");setExpiresAt(0);setChallenge("");setPassword("");setCode("")}
  function headers(){
    if(!active)return{};
    return{"x-marbo3a-step-up":grant};
  }
  async function begin(){
    try{
      setStatus("");
      if(!password)return setStatus("اكتب كلمة المرور الحالية.");
      const d=await api("/api/account/step-up/request",{method:"POST",body:JSON.stringify({currentPassword:password})});
      if(d.twoFactorRequired){
        setChallenge(d.challengeId||"");setCode("");
        setStatus("بعثنا رمز أمان إلى بريدك. أدخله لإكمال التحقق.");
        return;
      }
      setGrant(d.stepUpToken||"");setExpiresAt(Date.now()+Number(d.expiresIn||600)*1000);
      setPassword("");setStatus("جلسة الأمان مفعلة.");
    }catch(e){clear();setStatus(human(e))}
  }
  async function confirm(){
    try{
      setStatus("");
      const d=await api("/api/account/step-up/confirm",{method:"POST",body:JSON.stringify({challengeId:challenge,code})});
      setGrant(d.stepUpToken||"");setExpiresAt(Date.now()+Number(d.expiresIn||600)*1000);
      setChallenge("");setCode("");setPassword("");
      setStatus("جلسة الأمان مفعلة لمدة قصيرة.");
    }catch(e){setStatus(human(e))}
  }
  const value=useMemo(()=>({active,headers,clear,status,setStatus,password,setPassword,challenge,code,setCode,begin,confirm,expiresAt}),[active,grant,expiresAt,status,password,challenge,code]);
  return <AdminStepUpContext.Provider value={value}>{children}</AdminStepUpContext.Provider>;
}

export function useAdminStepUp(){
  const value=useContext(AdminStepUpContext);
  if(!value)throw new Error("AdminStepUpProvider missing");
  return value;
}

export function AdminStepUpPanel(){
  const s=useAdminStepUp();
  return <section className="admin-stepup-panel" aria-label="جلسة أمان الإدارة">
    <div><b>جلسة أمان الإدارة</b><span>{s.active?"مفعلة للعمليات الحساسة":"مطلوبة للحظر والصلاحيات والإعدادات والوصول للرسائل المُبلّغ عنها"}</span></div>
    {s.active?<button type="button" onClick={s.clear}>إنهاء جلسة الأمان</button>:<>
      <input type="password" autoComplete="current-password" value={s.password} onChange={e=>s.setPassword(e.target.value)} placeholder="كلمة المرور الحالية" aria-label="كلمة مرور جلسة أمان الإدارة"/>
      {!s.challenge?<button type="button" onClick={s.begin} disabled={!s.password}>تحقق</button>:<>
        <input inputMode="numeric" autoComplete="one-time-code" value={s.code} onChange={e=>s.setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="رمز 2FA" aria-label="رمز المصادقة الثنائية للإدارة"/>
        <button type="button" onClick={s.confirm} disabled={s.code.length!==6}>تأكيد</button>
      </>}
    </>}
    {s.status&&<small role="status">{s.status}</small>}
  </section>;
}
