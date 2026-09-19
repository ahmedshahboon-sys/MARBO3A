"use client";
import {useEffect,useState} from "react";
import AppDialog from "./AppDialog";

async function api(path,options={}){
  const headers={"x-marbo3a-session-mode":"cookie",...(options.headers||{})};
  if(options.body&&!(options.body instanceof FormData))headers["content-type"]="application/json";
  const r=await fetch(path,{...options,headers,cache:"no-store",credentials:"same-origin"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(d.error||"REQUEST_FAILED");e.status=r.status;e.data=d;throw e}
  return d;
}
const human=e=>({
  WRONG_PASSWORD:"كلمة المرور الحالية غير صحيحة",
  STEP_UP_REQUIRED:"انتهت صلاحية التحقق الأمني. أعد إدخال كلمة المرور.",
  STEP_UP_EXPIRED:"انتهت صلاحية رمز الأمان",
  STEP_UP_INVALID:"رمز الأمان غير صحيح",
  STEP_UP_TOO_MANY_ATTEMPTS:"محاولات كثيرة. أعد التحقق من البداية.",
  EMAIL_IN_USE:"البريد مستخدم بالفعل",
  EMAIL_UNCHANGED:"هذا هو بريدك الحالي",
  INVALID_EMAIL:"البريد غير صحيح",
  INVALID_CODE:"الرمز غير صحيح",
  CODE_EXPIRED:"انتهت صلاحية رمز البريد",
  EMAIL_CHANGE_TOO_MANY_ATTEMPTS:"محاولات كثيرة. اطلب رمز بريد جديد.",
  EMAIL_NOT_CONFIGURED:"خدمة البريد غير مجهزة",
  EMAIL_SEND_FAILED:"تعذر إرسال البريد الآن",
  ADMIN_CANNOT_DELETE:"حساب الأدمن لا يمكن حذفه من هنا",
  INVALID_PASSWORD:"كلمة المرور الجديدة غير صالحة"
}[e?.message]||e?.message||"تعذر تنفيذ العملية");

export default function AccountSecurityPanel({onChanged}){
  const[security,setSecurity]=useState({twoFactorEnabled:false,recoveryCodesRemaining:0,pendingDeleteAt:null});
  const[currentPassword,setCurrentPassword]=useState(""),[newPassword,setNewPassword]=useState("");
  const[twoPass,setTwoPass]=useState(""),[twoCode,setTwoCode]=useState(""),[twoPending,setTwoPending]=useState(null),[recoveryCodes,setRecoveryCodes]=useState([]);
  const[newEmail,setNewEmail]=useState(""),[emailCode,setEmailCode]=useState(""),[emailGrant,setEmailGrant]=useState("");
  const[sensitivePassword,setSensitivePassword]=useState(""),[stepChallenge,setStepChallenge]=useState(""),[stepCode,setStepCode]=useState(""),[stepAction,setStepAction]=useState("");
  const[deleteOpen,setDeleteOpen]=useState(false),[status,setStatus]=useState("");

  async function refresh(){
    const d=await api("/api/account/security");
    setSecurity({twoFactorEnabled:Boolean(d.twoFactorEnabled),recoveryCodesRemaining:Number(d.recoveryCodesRemaining)||0,pendingDeleteAt:d.pendingDeleteAt||null});
  }
  useEffect(()=>{refresh().catch(e=>setStatus(human(e)))},[]);

  async function changePassword(e){
    e.preventDefault();
    try{
      await api("/api/account/change-password",{method:"POST",body:JSON.stringify({currentPassword,newPassword})});
      setCurrentPassword("");setNewPassword("");setStatus("تم تغيير كلمة المرور وإنهاء الجلسات الأخرى.");
      await refresh();onChanged?.();
    }catch(e){setStatus(human(e))}
  }
  async function request2fa(){
    try{
      const enable=!security.twoFactorEnabled;
      await api("/api/account/2fa/request",{method:"POST",body:JSON.stringify({currentPassword:twoPass,enable})});
      setTwoPending(enable);setStatus("بعثنا رمز أمان إلى بريدك.");
    }catch(e){setStatus(human(e))}
  }
  async function confirm2fa(){
    try{
      const d=await api("/api/account/2fa/confirm",{method:"POST",body:JSON.stringify({code:twoCode})});
      setSecurity(x=>({...x,twoFactorEnabled:Boolean(d.twoFactorEnabled),recoveryCodesRemaining:Array.isArray(d.recoveryCodes)?d.recoveryCodes.length:0}));
      setRecoveryCodes(Array.isArray(d.recoveryCodes)?d.recoveryCodes:[]);
      setTwoPending(null);setTwoCode("");setTwoPass("");
      setStatus(d.twoFactorEnabled?"تم تفعيل المصادقة الثنائية. خزّن رموز الاسترداد في مكان آمن.":"تم إيقاف المصادقة الثنائية.");
      onChanged?.();
    }catch(e){setStatus(human(e))}
  }
  async function copyRecovery(){
    try{await navigator.clipboard.writeText(recoveryCodes.join("\n"));setStatus("تم نسخ رموز الاسترداد.")}catch{setStatus("تعذر نسخ الرموز.")}
  }

  async function performSensitive(action,stepUpToken){
    if(action==="email"){
      const d=await api("/api/account/request-email-change",{method:"POST",body:JSON.stringify({email:newEmail,stepUpToken})});
      setEmailGrant(stepUpToken);setSensitivePassword("");
      setStatus(`بعثنا رمز للبريد الجديد. صالح حوالي ${Math.round((d.expiresIn||600)/60)} دقايق.`);
      return;
    }
    if(action==="delete"){
      const d=await api("/api/account/delete",{method:"POST",body:JSON.stringify({stepUpToken})});
      setDeleteOpen(false);setSensitivePassword("");
      setSecurity(x=>({...x,pendingDeleteAt:d.deleteAt||null}));
      setStatus("تم جدولة حذف الحساب بعد 7 أيام. تقدر تلغي قبل الموعد.");
      onChanged?.();
    }
  }
  async function beginStepUp(action){
    try{
      if(!sensitivePassword)return setStatus("اكتب كلمة المرور الحالية أولًا.");
      const d=await api("/api/account/step-up/request",{method:"POST",body:JSON.stringify({currentPassword:sensitivePassword})});
      if(d.twoFactorRequired){
        setStepAction(action);setStepChallenge(d.challengeId);setStepCode("");
        setDeleteOpen(false);setStatus("بعثنا رمز أمان إلى بريدك لتأكيد العملية.");
      }else await performSensitive(action,d.stepUpToken);
    }catch(e){setStatus(human(e))}
  }
  async function confirmStepUp(){
    try{
      const d=await api("/api/account/step-up/confirm",{method:"POST",body:JSON.stringify({challengeId:stepChallenge,code:stepCode})});
      const action=stepAction;setStepAction("");setStepChallenge("");setStepCode("");
      await performSensitive(action,d.stepUpToken);
    }catch(e){setStatus(human(e))}
  }
  async function confirmEmail(){
    try{
      const d=await api("/api/account/confirm-email-change",{method:"POST",body:JSON.stringify({code:emailCode,stepUpToken:emailGrant})});
      setEmailCode("");setEmailGrant("");setNewEmail("");
      setStatus(`تم تغيير البريد إلى ${d.email} وإنهاء الجلسات الأخرى.`);
      await refresh();onChanged?.();
    }catch(e){setStatus(human(e))}
  }
  async function cancelDelete(){
    try{
      await api("/api/account/cancel-delete",{method:"POST"});
      setSecurity(x=>({...x,pendingDeleteAt:null}));setStatus("تم إلغاء حذف الحساب.");onChanged?.();
    }catch(e){setStatus(human(e))}
  }

  return <div className="account-security-panel">
    <form className="settings-form" onSubmit={changePassword}>
      <h4>تغيير كلمة المرور</h4>
      <input type="password" autoComplete="current-password" placeholder="كلمة المرور الحالية" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/>
      <input type="password" autoComplete="new-password" placeholder="كلمة المرور الجديدة - 8 أحرف على الأقل" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} required/>
      <button>تغيير كلمة المرور</button>
    </form>

    <div className="settings-form">
      <h4>المصادقة الثنائية</h4>
      <p>{security.twoFactorEnabled?`مفعلة — رموز الاسترداد المتبقية: ${security.recoveryCodesRemaining}`:"غير مفعلة"}</p>
      <input type="password" autoComplete="current-password" placeholder="كلمة المرور الحالية" value={twoPass} onChange={e=>setTwoPass(e.target.value)}/>
      {twoPending===null?<button type="button" onClick={request2fa} disabled={!twoPass}>{security.twoFactorEnabled?"إيقاف المصادقة الثنائية":"تفعيل المصادقة الثنائية"}</button>:<>
        <input inputMode="numeric" autoComplete="one-time-code" placeholder="رمز الأمان" value={twoCode} onChange={e=>setTwoCode(e.target.value.replace(/\D/g,"").slice(0,6))}/>
        <button type="button" onClick={confirm2fa} disabled={twoCode.length!==6}>تأكيد الرمز</button>
      </>}
      {recoveryCodes.length>0&&<div className="security-recovery-codes"><strong>رموز الاسترداد — تظهر مرة واحدة</strong><p>خزّنها في مكان آمن. كل رمز يُستعمل مرة واحدة فقط.</p><div>{recoveryCodes.map(code=><code key={code}>{code}</code>)}</div><button type="button" onClick={copyRecovery}>نسخ الرموز</button></div>}
    </div>

    <div className="settings-form">
      <h4>تأكيد العمليات الحساسة</h4>
      <p>تغيير البريد أو جدولة حذف الحساب يحتاج كلمة المرور الحالية، ومع 2FA يحتاج رمز أمان إضافي.</p>
      <input type="password" autoComplete="current-password" placeholder="كلمة المرور الحالية" value={sensitivePassword} onChange={e=>setSensitivePassword(e.target.value)}/>
      {stepChallenge&&<><input inputMode="numeric" autoComplete="one-time-code" placeholder="رمز الأمان" value={stepCode} onChange={e=>setStepCode(e.target.value.replace(/\D/g,"").slice(0,6))}/><button type="button" onClick={confirmStepUp} disabled={stepCode.length!==6}>تأكيد العملية</button></>}
    </div>

    <div className="settings-form">
      <h4>تغيير البريد</h4>
      <input type="email" autoComplete="email" placeholder="البريد الجديد" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/>
      <button type="button" onClick={()=>beginStepUp("email")} disabled={!newEmail||!sensitivePassword}>إرسال رمز للبريد الجديد</button>
      <input inputMode="numeric" autoComplete="one-time-code" placeholder="رمز البريد الجديد" value={emailCode} onChange={e=>setEmailCode(e.target.value.replace(/\D/g,"").slice(0,6))}/>
      <button type="button" onClick={confirmEmail} disabled={emailCode.length!==6||!emailGrant}>تأكيد البريد</button>
    </div>

    {security.pendingDeleteAt?<div className="settings-form danger-zone"><h4>حذف الحساب مجدول</h4><p>موعد الحذف: {new Date(security.pendingDeleteAt).toLocaleString("ar-LY")}</p><button type="button" onClick={cancelDelete}>إلغاء حذف الحساب</button></div>:<button className="danger-setting" type="button" onClick={()=>setDeleteOpen(true)} disabled={!sensitivePassword}>حذف الحساب بعد 7 أيام</button>}
    {status&&<div className="settings-status" role="status" onClick={()=>setStatus("")}>{status}</div>}
    <AppDialog open={deleteOpen} title="حذف الحساب؟" description="سيتم جدولة الحذف النهائي بعد 7 أيام. تقدر تتراجع قبل انتهاء المهلة. العملية تحتاج التحقق الأمني الحالي." danger confirmLabel="جدولة الحذف" onConfirm={()=>beginStepUp("delete")} onClose={()=>setDeleteOpen(false)}/>
  </div>
}
