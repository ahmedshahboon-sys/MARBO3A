"use client";

import { useEffect, useMemo, useState } from "react";

const starterRooms = [
  { id: 1, name: "مربوعة العامة", description: "تعرف على ناس جدد وشارك الحديث", members: 1, badge: "عامة" },
  { id: 2, name: "شباب ليبيا", description: "دردشة ومواضيع يومية", members: 0, badge: "عامة" },
  { id: 3, name: "السيارات", description: "سيارات، تعديلات وتجارب", members: 0, badge: "عامة" }
];

function saveToken(token) {
  localStorage.setItem("marbo3a_token", token);
  sessionStorage.removeItem("marbo3a_token");
}

function getSavedToken() {
  return localStorage.getItem("marbo3a_token") || sessionStorage.getItem("marbo3a_token") || "";
}

function clearToken() {
  localStorage.removeItem("marbo3a_token");
  sessionStorage.removeItem("marbo3a_token");
}

export default function Home() {
  const [authMode, setAuthMode] = useState("register");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [user, setUser] = useState(null);
  const [homeTab, setHomeTab] = useState("rooms");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const token = getSavedToken();
    if (!token) {
      setBooting(false);
      return;
    }

    fetch("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` }
    })
      .then(async response => {
        if (!response.ok) throw new Error("SESSION_INVALID");
        return response.json();
      })
      .then(data => {
        if (data?.user) {
          saveToken(token);
          setUser(data.user);
          setStep("home");
        }
      })
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return starterRooms;
    return starterRooms.filter(room => `${room.name} ${room.description}`.toLowerCase().includes(q));
  }, [search]);

  function resetAlerts() {
    setError("");
    setMessage("");
  }

  function switchMode(mode) {
    resetAlerts();
    setAuthMode(mode);
    setStep(mode === "login" ? "login" : "email");
  }

  async function requestOtp(event) {
    event.preventDefault();
    setLoading(true);
    resetAlerts();
    try {
      const response = await fetch("/api/auth/request-email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "OTP_TOO_SOON") throw new Error(`استنى ${data.retryAfter || 60} ثانية قبل إعادة الإرسال`);
        if (data.error === "OTP_RATE_LIMITED") throw new Error("وصلت للحد المؤقت لإرسال الرموز. جرّب لاحقًا.");
        if (data.error === "EMAIL_ALREADY_REGISTERED") throw new Error("هذا البريد مسجل بالفعل. اختار تسجيل الدخول.");
        if (data.error === "INVALID_EMAIL") throw new Error("اكتب بريد إلكتروني صحيح");
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
    resetAlerts();
    try {
      const response = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code })
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "OTP_INVALID") throw new Error(`الرمز غير صحيح${Number.isInteger(data.attemptsLeft) ? ` — باقي ${data.attemptsLeft} محاولات` : ""}`);
        if (data.error === "OTP_EXPIRED") throw new Error("انتهت صلاحية الرمز. اطلب رمز جديد.");
        if (data.error === "OTP_TOO_MANY_ATTEMPTS") throw new Error("تم إيقاف هذا الرمز بعد محاولات كثيرة. اطلب رمز جديد.");
        throw new Error("تعذر التحقق من الرمز");
      }
      setStep("account");
      setMessage("تم تأكيد بريدك. كمل بيانات الحساب.");
    } catch (err) {
      setError(err.message || "صار خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function register(event) {
    event.preventDefault();
    setLoading(true);
    resetAlerts();
    try {
      if (password !== confirmPassword) throw new Error("كلمتا المرور غير متطابقتين");
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, username, gender, password })
      });
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
      saveToken(data.token);
      setUser(data.user);
      setStep("home");
      setMessage("");
    } catch (err) {
      setError(err.message || "صار خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    resetAlerts();
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        if (["INVALID_LOGIN", "INVALID_CREDENTIALS"].includes(data.error)) throw new Error("بيانات الدخول غير صحيحة");
        throw new Error("تعذر تسجيل الدخول حاليًا");
      }
      saveToken(data.token);
      setUser(data.user);
      setStep("home");
      setLoginPassword("");
    } catch (err) {
      setError(err.message || "صار خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const token = getSavedToken();
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` }
        });
      }
    } catch {}
    clearToken();
    setUser(null);
    setEmail("");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setAuthMode("login");
    setStep("login");
    resetAlerts();
  }

  if (booting) {
    return (
      <main dir="rtl">
        <div className="splash-card">
          <div className="brand-mark">م</div>
          <div className="eyebrow">MARBO3A</div>
          <div className="loading-line">جاري فتح مربوعة...</div>
        </div>
      </main>
    );
  }

  if (step === "home" && user) {
    return (
      <main className="home-shell" dir="rtl">
        <div className="app-frame">
          <header className="topbar">
            <div className="brand-row">
              <div className="mini-mark">م</div>
              <div>
                <strong>مربوعة</strong>
                <span>MARBO3A</span>
              </div>
            </div>
            <button className="avatar-button" type="button" onClick={() => setHomeTab("profile")} aria-label="الملف الشخصي">
              {user.display_name?.trim()?.[0] || "م"}
            </button>
          </header>

          <section className="welcome-strip">
            <div>
              <span className="tiny-label">هلا بيك</span>
              <h1>{user.display_name}</h1>
              <p>@{user.username}</p>
            </div>
            <div className="online-pill"><i /> متصل</div>
          </section>

          <div className="search-wrap">
            <span>⌕</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في مربوعة..." />
          </div>

          <nav className="home-tabs" aria-label="التنقل الرئيسي">
            <button className={homeTab === "rooms" ? "active" : ""} onClick={() => setHomeTab("rooms")}>الغرف</button>
            <button className={homeTab === "friends" ? "active" : ""} onClick={() => setHomeTab("friends")}>الأصحاب</button>
            <button className={homeTab === "notifications" ? "active" : ""} onClick={() => setHomeTab("notifications")}>التنبيهات</button>
            <button className={homeTab === "profile" ? "active" : ""} onClick={() => setHomeTab("profile")}>حسابي</button>
          </nav>

          {homeTab === "rooms" && (
            <section className="panel-section">
              <div className="section-head">
                <div><span className="tiny-label">ابدأ من هنا</span><h2>الغرف العامة</h2></div>
                <span className="count-chip">{filteredRooms.length}</span>
              </div>
              <div className="room-list">
                {filteredRooms.map(room => (
                  <article className="room-card" key={room.id}>
                    <div className="room-icon">#</div>
                    <div className="room-copy">
                      <div className="room-title-row"><h3>{room.name}</h3><span>{room.badge}</span></div>
                      <p>{room.description}</p>
                      <small>{room.members} متصل الآن</small>
                    </div>
                    <button type="button" className="join-button" disabled>قريبًا</button>
                  </article>
                ))}
                {!filteredRooms.length && <div className="empty-state">ما لقيناش غرفة بالاسم هذا.</div>}
              </div>
            </section>
          )}

          {homeTab === "friends" && (
            <section className="panel-section center-panel">
              <div className="big-emoji">👥</div>
              <h2>الأصحاب</h2>
              <p>قائمة أصحابك وطلبات الإضافة بتكون هنا. ربطها الحقيقي هو الجولة الجاية.</p>
              <button className="primary-action" type="button" disabled>البحث عن أصحاب — قريبًا</button>
            </section>
          )}

          {homeTab === "notifications" && (
            <section className="panel-section center-panel">
              <div className="big-emoji">🔔</div>
              <h2>التنبيهات</h2>
              <p>ما عندكش تنبيهات جديدة توا.</p>
            </section>
          )}

          {homeTab === "profile" && (
            <section className="panel-section profile-panel">
              <div className="profile-hero">
                <div className="profile-avatar">{user.display_name?.trim()?.[0] || "م"}</div>
                <h2>{user.display_name}</h2>
                <p>@{user.username}</p>
              </div>
              <div className="profile-grid">
                <div><span>البريد</span><b>{user.email}</b></div>
                <div><span>الجنس</span><b>{user.gender === "male" ? "راجل" : "مرا"}</b></div>
                <div><span>الحالة</span><b className="green-text">مفعّل</b></div>
              </div>
              <button className="logout-button" type="button" onClick={logout}>تسجيل الخروج</button>
            </section>
          )}

          <footer className="app-footer">مربوعة • نسخة تجريبية أولى</footer>
        </div>
      </main>
    );
  }

  return (
    <main dir="rtl">
      <div className="auth-card">
        <div className="brand-mark">م</div>
        <div className="eyebrow">MARBO3A</div>
        <h1>مربوعة</h1>
        <p className="lead">مكانك للتواصل، الغرف، والأصحاب</p>

        <div className="auth-tabs">
          <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => switchMode("register")}>حساب جديد</button>
          <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => switchMode("login")}>تسجيل الدخول</button>
        </div>

        {step === "login" && (
          <form onSubmit={login} className="form-stack">
            <label htmlFor="loginIdentifier">البريد أو اسم المستخدم</label>
            <input id="loginIdentifier" type="text" autoComplete="username" placeholder="ahmed أو name@example.com" value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)} required />
            <label htmlFor="loginPassword">كلمة المرور</label>
            <input id="loginPassword" type="password" autoComplete="current-password" placeholder="كلمة المرور" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
            <button type="submit" disabled={loading}>{loading ? "جاري الدخول..." : "دخول إلى مربوعة"}</button>
            <button type="button" className="text-button" onClick={() => switchMode("register")}>ما عندكش حساب؟ سجل توا</button>
          </form>
        )}

        {step === "email" && (
          <form onSubmit={requestOtp} className="form-stack">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            <button type="submit" disabled={loading}>{loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}</button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="form-stack">
            <div className="email-chip">{email}</div>
            <label htmlFor="otp">رمز التحقق</label>
            <input id="otp" className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
            <button type="submit" disabled={loading || code.length !== 6}>{loading ? "جاري التحقق..." : "تأكيد الرمز"}</button>
            <button type="button" className="text-button" onClick={() => { setStep("email"); setCode(""); resetAlerts(); }}>تغيير البريد</button>
          </form>
        )}

        {step === "account" && (
          <form onSubmit={register} className="form-stack">
            <div className="email-chip">{email}</div>
            <label htmlFor="displayName">الاسم الظاهر</label>
            <input id="displayName" type="text" maxLength={50} placeholder="مثال: أحمد شهبون" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
            <label htmlFor="username">اسم المستخدم</label>
            <input id="username" type="text" maxLength={24} placeholder="ahmed" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))} required />
            <label>الجنس</label>
            <div className="gender-grid">
              <button type="button" className={gender === "male" ? "gender-option selected" : "gender-option"} onClick={() => setGender("male")}>راجل</button>
              <button type="button" className={gender === "female" ? "gender-option selected" : "gender-option"} onClick={() => setGender("female")}>مرا</button>
            </div>
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" placeholder="8 أحرف على الأقل" value={password} onChange={e => setPassword(e.target.value)} required />
            <label htmlFor="confirmPassword">تأكيد كلمة المرور</label>
            <input id="confirmPassword" type="password" minLength={8} maxLength={128} autoComplete="new-password" placeholder="أعد كتابة كلمة المرور" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            <button type="submit" disabled={loading || !gender}>{loading ? "جاري إنشاء الحساب..." : "إنشاء حسابي"}</button>
          </form>
        )}

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}
        <div className="footer-note">لن نطلب منك رمز التحقق خارج هذه الصفحة.</div>
      </div>
    </main>
  );
}
