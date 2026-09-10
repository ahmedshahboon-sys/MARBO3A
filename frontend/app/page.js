"use client";

import { useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [createdUser, setCreatedUser] = useState(null);

  async function requestOtp(event) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/request-email-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "OTP_TOO_SOON") throw new Error(`استنى ${data.retryAfter || 60} ثانية قبل إعادة الإرسال`);
        if (data.error === "OTP_RATE_LIMITED") throw new Error("وصلت للحد المؤقت لإرسال الرموز. جرّب لاحقًا.");
        if (data.error === "EMAIL_ALREADY_REGISTERED") throw new Error("هذا البريد مسجل بالفعل.");
        if (data.error === "INVALID_EMAIL") throw new Error("اكتب بريد إلكتروني صحيح");
        throw new Error("تعذر إرسال رمز التحقق حاليًا");
      }
      setStep("otp"); setMessage("بعثنالك رمز من 6 أرقام على بريدك");
    } catch (err) { setError(err.message || "صار خطأ غير متوقع"); } finally { setLoading(false); }
  }

  async function verifyOtp(event) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/verify-email-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "OTP_INVALID") throw new Error(`الرمز غير صحيح${Number.isInteger(data.attemptsLeft) ? ` — باقي ${data.attemptsLeft} محاولات` : ""}`);
        if (data.error === "OTP_EXPIRED") throw new Error("انتهت صلاحية الرمز. اطلب رمز جديد.");
        if (data.error === "OTP_TOO_MANY_ATTEMPTS") throw new Error("تم إيقاف هذا الرمز بعد محاولات كثيرة. اطلب رمز جديد.");
        throw new Error("تعذر التحقق من الرمز");
      }
      setStep("account"); setMessage("تم تأكيد بريدك. كمل بيانات الحساب.");
    } catch (err) { setError(err.message || "صار خطأ غير متوقع"); } finally { setLoading(false); }
  }

  async function register(event) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      if (password !== confirmPassword) throw new Error("كلمتا المرور غير متطابقتين");
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, displayName, username, gender, password }) });
      const data = await response.json();
      if (!response.ok) {
        const errors = {
          INVALID_USERNAME: "اسم المستخدم لازم يكون 3 إلى 24 حرف إنجليزي أو رقم.",
          INVALID_DISPLAY_NAME: "الاسم الظاهر لازم يكون بين حرفين و50 حرف.",
          INVALID_GENDER: "اختار الجنس لإكمال التسجيل.",
          WEAK_PASSWORD: "كلمة المرور لازم تكون 8 أحرف على الأقل.",
          EMAIL_NOT_VERIFIED: "انتهت مهلة تأكيد البريد. اطلب رمز جديد.",
          USERNAME_TAKEN: "اسم المستخدم مستخدم بالفعل.",
          EMAIL_ALREADY_REGISTERED: "هذا البريد مسجل بالفعل."
        };
        throw new Error(errors[data.error] || "تعذر إنشاء الحساب حاليًا");
      }
      sessionStorage.setItem("marbo3a_token", data.token);
      setCreatedUser(data.user); setStep("created"); setMessage("تم إنشاء حساب مربوعة بنجاح");
    } catch (err) { setError(err.message || "صار خطأ غير متوقع"); } finally { setLoading(false); }
  }

  return (
    <main dir="rtl"><div className="auth-card">
      <div className="brand-mark">م</div><div className="eyebrow">MARBO3A</div><h1>مربوعة</h1><p className="lead">مكانك للتواصل، الغرف، والأصحاب</p>

      {step === "email" && <form onSubmit={requestOtp} className="form-stack">
        <label htmlFor="email">البريد الإلكتروني</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        <button type="submit" disabled={loading}>{loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}</button>
      </form>}

      {step === "otp" && <form onSubmit={verifyOtp} className="form-stack">
        <div className="email-chip">{email}</div><label htmlFor="otp">رمز التحقق</label>
        <input id="otp" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
        <button type="submit" disabled={loading || code.length !== 6}>{loading ? "جاري التحقق..." : "تأكيد الرمز"}</button>
        <button type="button" className="text-button" onClick={() => { setStep("email"); setCode(""); setError(""); setMessage(""); }}>تغيير البريد</button>
      </form>}

      {step === "account" && <form onSubmit={register} className="form-stack">
        <div className="email-chip">{email}</div>
        <label htmlFor="displayName">الاسم الظاهر</label><input id="displayName" type="text" maxLength={50} placeholder="مثال: أحمد شهبون" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
        <label htmlFor="username">اسم المستخدم</label><input id="username" type="text" maxLength={24} placeholder="ahmed" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))} required />
        <label>الجنس</label><div className="gender-grid">
          <button type="button" className={gender === "male" ? "gender-option selected" : "gender-option"} onClick={() => setGender("male")}>راجل</button>
          <button type="button" className={gender === "female" ? "gender-option selected" : "gender-option"} onClick={() => setGender("female")}>مرا</button>
        </div>
        <label htmlFor="password">كلمة المرور</label><input id="password" type="password" minLength={8} maxLength={128} placeholder="8 أحرف على الأقل" value={password} onChange={e => setPassword(e.target.value)} required />
        <label htmlFor="confirmPassword">تأكيد كلمة المرور</label><input id="confirmPassword" type="password" minLength={8} maxLength={128} placeholder="أعد كتابة كلمة المرور" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        <button type="submit" disabled={loading || !gender}>{loading ? "جاري إنشاء الحساب..." : "إنشاء حسابي"}</button>
      </form>}

      {step === "created" && <div className="verified-box"><div className="verified-icon">✓</div><h2>حسابك جاهز</h2><p>{createdUser?.display_name}</p><p className="muted">@{createdUser?.username} — {createdUser?.gender === "male" ? "راجل" : "مرا"}</p><p className="muted">تم تسجيل دخولك. الخطوة الجاية الواجهة الرئيسية.</p></div>}

      {message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}
      <div className="footer-note">لن نطلب منك رمز التحقق خارج هذه الصفحة.</div>
    </div></main>
  );
}
