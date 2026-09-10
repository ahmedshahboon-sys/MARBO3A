"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function saveToken(token) { localStorage.setItem("marbo3a_token", token); sessionStorage.removeItem("marbo3a_token"); }
function getToken() { return localStorage.getItem("marbo3a_token") || sessionStorage.getItem("marbo3a_token") || ""; }
function clearToken() { localStorage.removeItem("marbo3a_token"); sessionStorage.removeItem("marbo3a_token"); }

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const response = await fetch(path, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch {}
  if (response.status === 401) { clearToken(); throw new Error("SESSION_EXPIRED"); }
  if (!response.ok) { const err = new Error(data.error || "REQUEST_FAILED"); err.data = data; throw err; }
  return data;
}

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [step, setStep] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [tab, setTab] = useState("rooms");
  const [stats, setStats] = useState({ rooms: 0, friends: 0, pendingRequests: 0, unreadNotifications: 0 });
  const [rooms, setRooms] = useState([]);
  const [roomSearch, setRoomSearch] = useState("");
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [friendsData, setFriendsData] = useState({ friends: [], incoming: [], suggestions: [] });
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleResults, setPeopleResults] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const scrollRef = useRef(null);

  function resetAlerts() { setError(""); setMessage(""); }
  function humanError(err) {
    const map = {
      INVALID_LOGIN: "بيانات الدخول غير صحيحة",
      SESSION_EXPIRED: "انتهت جلسة الدخول. سجل دخولك من جديد.",
      USERNAME_TAKEN: "اسم المستخدم مستخدم بالفعل",
      EMAIL_ALREADY_REGISTERED: "هذا البريد مسجل بالفعل",
      INVALID_ROOM_NAME: "اسم الغرفة قصير أو غير صحيح",
      OWNER_CANNOT_LEAVE: "مالك الغرفة ما يقدرش يطلع منها قبل نقل الملكية",
      MESSAGE_RATE_LIMIT: "بعثت رسائل بسرعة كبيرة. استنى شوية.",
      RELATION_EXISTS: "في طلب أو صداقة موجودة بالفعل"
    };
    return map[err?.message] || err?.message || "صار خطأ غير متوقع";
  }

  async function refreshDashboard() {
    const data = await api("/api/dashboard");
    setStats(data.stats);
  }
  async function loadRooms(q = roomSearch) {
    const data = await api(`/api/rooms?q=${encodeURIComponent(q)}`);
    setRooms(data.rooms || []);
  }
  async function loadFriends() {
    const data = await api("/api/friends");
    setFriendsData(data);
  }
  async function loadNotifications(markRead = false) {
    const data = await api("/api/notifications");
    setNotifications(data.notifications || []);
    if (markRead) {
      await api("/api/notifications/read", { method: "POST" });
      setStats(s => ({ ...s, unreadNotifications: 0 }));
    }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) { setBooting(false); return; }
    api("/api/auth/me").then(data => {
      setUser(data.user); setProfileName(data.user.display_name); setProfileBio(data.user.bio || ""); setStep("home");
      return Promise.all([refreshDashboard(), loadRooms("")]);
    }).catch(() => { clearToken(); setStep("login"); }).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user || step !== "home") return;
    const timer = setInterval(() => refreshDashboard().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [user, step]);

  useEffect(() => {
    if (!activeRoom) return;
    let alive = true;
    async function pull() {
      try {
        const data = await api(`/api/rooms/${activeRoom.id}/messages`);
        if (alive) setMessages(data.messages || []);
      } catch {}
    }
    pull();
    const timer = setInterval(pull, 2500);
    return () => { alive = false; clearInterval(timer); };
  }, [activeRoom?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (tab !== "rooms" || !user) return;
    const timer = setTimeout(() => loadRooms(roomSearch).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [roomSearch, tab, user]);

  useEffect(() => {
    if (tab === "friends" && user) loadFriends().catch(() => {});
    if (tab === "notifications" && user) loadNotifications(true).catch(() => {});
  }, [tab, user]);

  useEffect(() => {
    if (tab !== "friends" || peopleSearch.trim().length < 2) { setPeopleResults([]); return; }
    const timer = setTimeout(() => api(`/api/users/search?q=${encodeURIComponent(peopleSearch)}`).then(d => setPeopleResults(d.users || [])).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [peopleSearch, tab]);

  function switchMode(mode) { resetAlerts(); setAuthMode(mode); setStep(mode === "login" ? "login" : "email"); }

  async function requestOtp(e) {
    e.preventDefault(); setLoading(true); resetAlerts();
    try {
      const data = await api("/api/auth/request-email-otp", { method: "POST", body: JSON.stringify({ email }) });
      setStep("otp"); setMessage(`بعثنالك رمز من 6 أرقام. صالح ${Math.round(data.expiresIn / 60)} دقايق.`);
    } catch (err) {
      if (err.message === "OTP_TOO_SOON") setError(`استنى ${err.data?.retryAfter || 60} ثانية قبل إعادة الإرسال`);
      else if (err.message === "EMAIL_ALREADY_REGISTERED") setError("هذا البريد مسجل بالفعل. اختار تسجيل الدخول.");
      else setError(humanError(err));
    } finally { setLoading(false); }
  }

  async function verifyOtp(e) {
    e.preventDefault(); setLoading(true); resetAlerts();
    try {
      await api("/api/auth/verify-email-otp", { method: "POST", body: JSON.stringify({ email, code }) });
      setStep("account"); setMessage("تم تأكيد بريدك. كمل بيانات الحساب.");
    } catch (err) {
      if (err.message === "OTP_INVALID") setError(`الرمز غير صحيح — باقي ${err.data?.attemptsLeft ?? ""} محاولات`);
      else if (err.message === "OTP_EXPIRED") setError("انتهت صلاحية الرمز. اطلب رمز جديد.");
      else setError(humanError(err));
    } finally { setLoading(false); }
  }

  async function register(e) {
    e.preventDefault(); setLoading(true); resetAlerts();
    try {
      if (password !== confirmPassword) throw new Error("كلمتا المرور غير متطابقتين");
      const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, displayName, username, gender, password }) });
      saveToken(data.token); setUser(data.user); setProfileName(data.user.display_name); setProfileBio(""); setStep("home");
      await Promise.all([refreshDashboard(), loadRooms("")]);
    } catch (err) { setError(humanError(err)); } finally { setLoading(false); }
  }

  async function login(e) {
    e.preventDefault(); setLoading(true); resetAlerts();
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword }) });
      saveToken(data.token); setUser(data.user); setProfileName(data.user.display_name); setProfileBio(data.user.bio || ""); setStep("home"); setLoginPassword("");
      await Promise.all([refreshDashboard(), loadRooms("")]);
    } catch (err) { setError(humanError(err)); } finally { setLoading(false); }
  }

  async function logout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch {}
    clearToken(); setUser(null); setStep("login"); setAuthMode("login"); setActiveRoom(null); resetAlerts();
  }

  async function createRoom(e) {
    e.preventDefault(); setLoading(true); resetAlerts();
    try {
      const data = await api("/api/rooms", { method: "POST", body: JSON.stringify({ name: newRoomName, description: newRoomDescription }) });
      setNewRoomOpen(false); setNewRoomName(""); setNewRoomDescription(""); await loadRooms(); await refreshDashboard(); setActiveRoom(data.room);
    } catch (err) { setError(humanError(err)); } finally { setLoading(false); }
  }

  async function joinRoom(room) {
    try {
      if (!room.joined) await api(`/api/rooms/${room.id}/join`, { method: "POST" });
      setActiveRoom({ ...room, joined: true }); await Promise.all([loadRooms(), refreshDashboard()]);
    } catch (err) { setError(humanError(err)); }
  }

  async function leaveRoom() {
    if (!activeRoom) return;
    try {
      await api(`/api/rooms/${activeRoom.id}/leave`, { method: "POST" }); setActiveRoom(null); setMessages([]); await Promise.all([loadRooms(), refreshDashboard()]);
    } catch (err) { setError(humanError(err)); }
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = messageText.trim(); if (!body || !activeRoom) return;
    setMessageText("");
    try {
      const data = await api(`/api/rooms/${activeRoom.id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      setMessages(prev => [...prev, data.message]);
    } catch (err) { setError(humanError(err)); }
  }

  async function addFriend(userId) {
    try { await api("/api/friends/request", { method: "POST", body: JSON.stringify({ userId }) }); await loadFriends(); if (peopleSearch) setPeopleResults((await api(`/api/users/search?q=${encodeURIComponent(peopleSearch)}`)).users || []); }
    catch (err) { setError(humanError(err)); }
  }

  async function respondFriend(requestId, action) {
    try { await api(`/api/friends/${requestId}/respond`, { method: "POST", body: JSON.stringify({ action }) }); await Promise.all([loadFriends(), refreshDashboard()]); }
    catch (err) { setError(humanError(err)); }
  }

  async function saveProfile(e) {
    e.preventDefault(); setLoading(true); resetAlerts();
    try {
      const data = await api("/api/profile", { method: "PATCH", body: JSON.stringify({ displayName: profileName, bio: profileBio }) });
      setUser(data.user); setMessage("تم حفظ بيانات حسابك");
    } catch (err) { setError(humanError(err)); } finally { setLoading(false); }
  }

  const roomList = useMemo(() => rooms, [rooms]);

  if (booting) return <main dir="rtl"><div className="splash-card"><div className="brand-mark">م</div><div className="eyebrow">MARBO3A</div><div className="loading-line">جاري فتح مربوعة...</div></div></main>;

  if (step === "home" && user) {
    if (activeRoom) return (
      <main className="home-shell" dir="rtl"><div className="app-frame chat-frame">
        <header className="chat-header"><button className="icon-button" onClick={() => { setActiveRoom(null); setMessages([]); }}>←</button><div><h2>{activeRoom.name}</h2><span>{activeRoom.members_count || 0} عضو</span></div><button className="danger-link" onClick={leaveRoom}>خروج</button></header>
        <div className="messages-box" ref={scrollRef}>
          {!messages.length && <div className="empty-state">ابدأ أول رسالة في الغرفة 👋</div>}
          {messages.map(m => <div key={m.id} className={`message-bubble ${String(m.user_id) === String(user.id) ? "mine" : ""}`}><div className="message-meta"><b>{m.display_name}</b><span>@{m.username}</span></div><p>{m.body}</p><small>{new Date(m.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</small></div>)}
        </div>
        <form className="composer" onSubmit={sendMessage}><input value={messageText} onChange={e => setMessageText(e.target.value)} maxLength={1000} placeholder="اكتب رسالتك..." /><button disabled={!messageText.trim()}>إرسال</button></form>
        {error && <div className="floating-error" onClick={() => setError("")}>{error}</div>}
      </div></main>
    );

    return <main className="home-shell" dir="rtl"><div className="app-frame">
      <header className="topbar"><div className="brand-row"><div className="mini-mark">م</div><div><strong>مربوعة</strong><span>MARBO3A</span></div></div><button className="avatar-button" onClick={() => setTab("profile")}>{user.display_name?.[0] || "م"}</button></header>
      <section className="welcome-strip"><div><span className="tiny-label">هلا بيك</span><h1>{user.display_name}</h1><p>@{user.username}</p></div><div className="online-pill"><i /> متصل</div></section>
      <div className="stats-grid"><button onClick={() => setTab("rooms")}><b>{stats.rooms}</b><span>غرفي</span></button><button onClick={() => setTab("friends")}><b>{stats.friends}</b><span>أصحابي</span></button><button onClick={() => setTab("friends")}><b>{stats.pendingRequests}</b><span>طلبات</span></button><button onClick={() => setTab("notifications")}><b>{stats.unreadNotifications}</b><span>جديد</span></button></div>
      <nav className="home-tabs"><button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}>الغرف</button><button className={tab === "friends" ? "active" : ""} onClick={() => setTab("friends")}>الأصحاب</button><button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}>التنبيهات{stats.unreadNotifications > 0 && <em>{stats.unreadNotifications}</em>}</button><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>حسابي</button></nav>

      {tab === "rooms" && <section className="panel-section">
        <div className="section-head"><div><span className="tiny-label">دردشة حقيقية</span><h2>الغرف العامة</h2></div><button className="small-primary" onClick={() => setNewRoomOpen(v => !v)}>+ غرفة</button></div>
        {newRoomOpen && <form className="inline-form" onSubmit={createRoom}><input placeholder="اسم الغرفة" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} maxLength={60} required /><input placeholder="وصف مختصر" value={newRoomDescription} onChange={e => setNewRoomDescription(e.target.value)} maxLength={180} /><button disabled={loading}>إنشاء</button></form>}
        <div className="search-wrap"><span>⌕</span><input value={roomSearch} onChange={e => setRoomSearch(e.target.value)} placeholder="ابحث في الغرف..." /></div>
        <div className="room-list">{roomList.map(room => <article className="room-card" key={room.id}><div className="room-icon">#</div><div className="room-copy"><div className="room-title-row"><h3>{room.name}</h3>{room.joined && <span>مشترك</span>}</div><p>{room.description}</p><small>{room.members_count} عضو</small></div><button className="join-button" onClick={() => joinRoom(room)}>{room.joined ? "دخول" : "انضم"}</button></article>)}{!roomList.length && <div className="empty-state">ما لقيناش غرف.</div>}</div>
      </section>}

      {tab === "friends" && <section className="panel-section">
        <div className="section-head"><div><span className="tiny-label">تواصل</span><h2>الأصحاب</h2></div><span className="count-chip">{friendsData.friends?.length || 0}</span></div>
        <div className="search-wrap"><span>⌕</span><input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="ابحث بالاسم أو @username..." /></div>
        {peopleResults.length > 0 && <div className="people-list"><h3>نتائج البحث</h3>{peopleResults.map(p => <div className="person-row" key={p.id}><div className="person-avatar">{p.display_name?.[0]}</div><div><b>{p.display_name}</b><span>@{p.username}</span></div><button disabled={p.relation !== "none"} onClick={() => addFriend(p.id)}>{p.relation === "friends" ? "صديق" : p.relation === "outgoing" ? "تم الطلب" : p.relation === "incoming" ? "طلب وارد" : "+ إضافة"}</button></div>)}</div>}
        {friendsData.incoming?.length > 0 && <div className="people-list"><h3>طلبات واردة</h3>{friendsData.incoming.map(p => <div className="person-row" key={p.request_id}><div className="person-avatar">{p.display_name?.[0]}</div><div><b>{p.display_name}</b><span>@{p.username}</span></div><div className="row-actions"><button onClick={() => respondFriend(p.request_id,"accept")}>قبول</button><button className="muted-btn" onClick={() => respondFriend(p.request_id,"reject")}>رفض</button></div></div>)}</div>}
        <div className="people-list"><h3>أصحابي</h3>{friendsData.friends?.map(p => <div className="person-row" key={p.id}><div className="person-avatar">{p.display_name?.[0]}</div><div><b>{p.display_name}</b><span>@{p.username}</span></div><span className="green-text">صديق</span></div>)}{!friendsData.friends?.length && <div className="empty-state">ما عندكش أصحاب توا. ابحث وأضف ناس.</div>}</div>
        {friendsData.suggestions?.length > 0 && <div className="people-list"><h3>اقتراحات</h3>{friendsData.suggestions.map(p => <div className="person-row" key={p.id}><div className="person-avatar">{p.display_name?.[0]}</div><div><b>{p.display_name}</b><span>@{p.username}</span></div><button onClick={() => addFriend(p.id)}>+ إضافة</button></div>)}</div>}
      </section>}

      {tab === "notifications" && <section className="panel-section"><div className="section-head"><div><span className="tiny-label">آخر الأحداث</span><h2>التنبيهات</h2></div></div><div className="notification-list">{notifications.map(n => <article className={n.read_at ? "notification-card" : "notification-card unread"} key={n.id}><div>🔔</div><div><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString("ar")}</small></div></article>)}{!notifications.length && <div className="empty-state">ما عندكش تنبيهات توا.</div>}</div></section>}

      {tab === "profile" && <section className="panel-section profile-panel"><div className="profile-hero"><div className="profile-avatar">{user.display_name?.[0]}</div><h2>{user.display_name}</h2><p>@{user.username}</p></div><form className="form-stack" onSubmit={saveProfile}><label>الاسم الظاهر</label><input value={profileName} onChange={e => setProfileName(e.target.value)} maxLength={50} /><label>نبذة</label><textarea value={profileBio} onChange={e => setProfileBio(e.target.value)} maxLength={160} placeholder="اكتب نبذة بسيطة عنك..." /><button disabled={loading}>حفظ التعديلات</button></form><div className="profile-grid"><div><span>البريد</span><b>{user.email}</b></div><div><span>الجنس</span><b>{user.gender === "male" ? "راجل" : "مرا"}</b></div><div><span>الحالة</span><b className="green-text">مفعّل</b></div></div><button className="logout-button" onClick={logout}>تسجيل الخروج</button></section>}

      {message && <div className="notice success">{message}</div>}{error && <div className="notice error" onClick={() => setError("")}>{error}</div>}
      <footer className="app-footer">مربوعة • marbo3a.ly</footer>
    </div></main>;
  }

  return <main dir="rtl"><div className="auth-card"><div className="brand-mark">م</div><div className="eyebrow">MARBO3A</div><h1>مربوعة</h1><p className="lead">مكانك للتواصل، الغرف، والأصحاب</p>
    <div className="auth-tabs"><button className={authMode === "register" ? "active" : ""} onClick={() => switchMode("register")}>حساب جديد</button><button className={authMode === "login" ? "active" : ""} onClick={() => switchMode("login")}>تسجيل الدخول</button></div>
    {step === "login" && <form onSubmit={login} className="form-stack"><label>البريد أو اسم المستخدم</label><input value={loginIdentifier} onChange={e => setLoginIdentifier(e.target.value)} autoComplete="username" required /><label>كلمة المرور</label><input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} autoComplete="current-password" required /><button disabled={loading}>{loading ? "جاري الدخول..." : "دخول إلى مربوعة"}</button></form>}
    {step === "email" && <form onSubmit={requestOtp} className="form-stack"><label>البريد الإلكتروني</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /><button disabled={loading}>{loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}</button></form>}
    {step === "otp" && <form onSubmit={verifyOtp} className="form-stack"><div className="email-chip">{email}</div><label>رمز التحقق</label><input className="otp-input" inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} required /><button disabled={loading || code.length !== 6}>تأكيد الرمز</button></form>}
    {step === "account" && <form onSubmit={register} className="form-stack"><div className="email-chip">{email}</div><label>الاسم الظاهر</label><input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={50} required /><label>اسم المستخدم</label><input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g,""))} maxLength={24} required /><label>الجنس</label><div className="gender-grid"><button type="button" className={gender === "male" ? "gender-option selected" : "gender-option"} onClick={() => setGender("male")}>راجل</button><button type="button" className={gender === "female" ? "gender-option selected" : "gender-option"} onClick={() => setGender("female")}>مرا</button></div><label>كلمة المرور</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required /><label>تأكيد كلمة المرور</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} minLength={8} required /><button disabled={loading || !gender}>إنشاء حسابي</button></form>}
    {message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}<div className="footer-note">لن نطلب منك رمز التحقق خارج هذه الصفحة.</div>
  </div></main>;
}
