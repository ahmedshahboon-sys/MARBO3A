"use client";

import { useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/request-email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.error === "OTP_TOO_SOON") {
          throw new Error(`استنى ${data.retryAfter || 60} ثانية قبل إعادة الإرسال`);
        }
        if (data.error === "OTP_RATE_LIMITED") {
          throw new Error("وصلت للحد المؤقت لإرسال الرموز. جرّب لاحقًا.");
        }
        if (data.error === "INVALID_EMAIL") {
          throw new Error("اكتب بريد إلكتروني صحيح");
        }
        throw new Error("تعذر إرسال رمز التحقق حاليًا");
      }

      setStep("otp");
      setMessage("بعثنالك رمز من 6 أرقام على بريدك");
    } catch (err) {
      setError(err.message || "صار خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.error === "OTP_INVALID") {
          throw new Error(`الرمز غير صحيح${Number.isInteger(data.attemptsLeft) ? ` — باقي ${data.attemptsLeft} محاولات` : ""}`);
        }
        if (data.error === "OTP_EXPIRED") {
          throw new Error("انتهت صلاحية الرمز. اطلب رمز جديد.");
        }
        if (data.error === "OTP_TOO_MANY_ATTEMPTS") {
          throw new Error("تم إيقاف هذا الرمز بعد محاولات كثيرة. اطلب رمز جديد.");
        }
        throw new Error("تعذر التحقق من الرمز");
      }

      setStep("verified");
      setMessage("تم تأكيد بريدك بنجاح");
    } catch (err) {
      setError(err.message || "صار خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl">
      <div className="auth-card">
        <div className="brand-mark">م</div>
        <div className="eyebrow">MARBO3A</div>
        <h1>مربوعة</h1>
        <p className="lead">مكانك للتواصل، الغرف، والأصحاب</p>

        {step === "email" && (
          <form onSubmit={requestOtp} className="form-stack">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="form-stack">
            <div className="email-chip">{email}</div>
            <label htmlFor="otp">رمز التحقق</label>
            <input
              id="otp"
              className="otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <button type="submit" disabled={loading || code.length !== 6}>
              {loading ? "جاري التحقق..." : "تأكيد الرمز"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
                setMessage("");
              }}
            >
              تغيير البريد
            </button>
          </form>
        )}

        {step === "verified" && (
          <div className="verified-box">
            <div className="verified-icon">✓</div>
            <h2>تم التحقق</h2>
            <p>{email}</p>
            <p className="muted">المرحلة التالية: إنشاء بيانات حساب مربوعة.</p>
          </div>
        )}

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}

        <div className="footer-note">لن نطلب منك رمز التحقق خارج هذه الصفحة.</div>
      </div>
    </main>
  );
}
