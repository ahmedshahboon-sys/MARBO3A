"use client";

import { useEffect, useMemo, useState } from "react";

function savedToken() {
  return localStorage.getItem("marbo3a_token") || sessionStorage.getItem("marbo3a_token") || "";
}

export default function AdminConsole() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [level, setLevel] = useState("");
  const [query, setQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function api(path, options = {}) {
    const token = savedToken();
    if (!token) throw new Error("NO_TOKEN");
    const headers = { ...(options.headers || {}), authorization: `Bearer ${token}` };
    if (options.body) headers["content-type"] = "application/json";
    const res = await fetch(path, { ...options, headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || String(res.status));
    return data;
  }

  async function loadStats() {
    try {
      const data = await api("/api/admin/stats");
      setAllowed(true);
      setStats(data.stats);
    } catch {
      setAllowed(false);
    }
  }

  async function loadLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (level) params.set("level", level);
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "160");
      const data = await api(`/api/admin/logs?${params}`);
      setLogs(data.logs || []);
    } catch {}
    setLoading(false);
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api(`/api/admin/users?q=${encodeURIComponent(userQuery.trim())}`);
      setUsers(data.users || []);
    } catch {}
    setLoading(false);
  }

  async function loadRooms() {
    setLoading(true);
    try { setRooms((await api("/api/admin/rooms")).rooms || []); } catch {}
    setLoading(false);
  }

  async function setUserStatus(user, status) {
    if (user.username === "ahmed") return;
    let reason = "";
    if (status !== "active") reason = window.prompt(status === "banned" ? "سبب الحظر:" : "سبب التجميد:", "") || "";
    if (!window.confirm(status === "active" ? `تفعيل @${user.username}؟` : `${status === "banned" ? "حظر" : "تجميد"} @${user.username}؟`)) return;
    try {
      await api(`/api/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
      await Promise.all([loadUsers(), loadStats(), loadLogs()]);
    } catch (e) { alert(`فشلت العملية: ${e.message}`); }
  }

  async function deleteRoom(room) {
    if (!window.confirm(`حذف غرفة «${room.name}» نهائيًا مع رسائلها؟`)) return;
    try { await api(`/api/admin/rooms/${room.id}`, { method: "DELETE" }); await Promise.all([loadRooms(), loadStats(), loadLogs()]); }
    catch (e) { alert(`تعذر حذف الغرفة: ${e.message}`); }
  }

  useEffect(() => {
    const timer = setTimeout(loadStats, 1200);
    const refresh = setInterval(loadStats, 30000);
    const onStorage = () => loadStats();
    window.addEventListener("storage", onStorage);
    return () => { clearTimeout(timer); clearInterval(refresh); window.removeEventListener("storage", onStorage); };
  }, []);

  useEffect(() => {
    if (!open || !allowed) return;
    if (tab === "overview" || tab === "logs") loadLogs();
    if (tab === "users") loadUsers();
    if (tab === "rooms") loadRooms();
  }, [open, tab, level]);

  const cards = useMemo(() => stats ? [
    ["متصلون الآن", stats.onlineUsers, "●"],
    ["الزوار الآن", stats.onlineVisitors, "◉"],
    ["زوار اليوم", stats.visitorsToday, "↗"],
    ["المسجلون", stats.registeredUsers, "◎"],
    ["جدد اليوم", stats.newUsersToday, "+"],
    ["الغرف", stats.rooms, "#"],
    ["الرسائل", stats.messages, "✦"],
    ["أخطاء اليوم", stats.errorsToday, "!"],
    ["مجمّدون", stats.frozen, "❄"],
    ["محظورون", stats.banned, "⊘"],
  ] : [], [stats]);

  if (!allowed) return null;

  return <>
    <button className="admin-fab" type="button" onClick={() => setOpen(v => !v)} aria-label="لوحة الإدارة"><span>⚙</span>{stats && <b>{stats.onlineUsers}</b>}</button>
    {open && <div className="admin-overlay" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <section className="admin-console" dir="rtl">
        <header className="admin-head"><div><span className="admin-kicker">SUPER ADMIN • @ahmed</span><h2>مركز إدارة مربوعة</h2><p>إحصائيات، المستخدمون، الغرف، الحظر والتشخيص</p></div><button type="button" onClick={() => setOpen(false)}>×</button></header>

        <nav className="admin-tabs">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>الرئيسية</button>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>الحسابات</button>
          <button className={tab === "rooms" ? "active" : ""} onClick={() => setTab("rooms")}>الغرف</button>
          <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>السجل</button>
        </nav>

        {tab === "overview" && <>
          <div className="admin-stats-grid">{cards.map(([label,value,icon]) => <article key={label}><span>{icon}</span><strong>{Number(value || 0).toLocaleString("en-US")}</strong><small>{label}</small></article>)}</div>
          <div className="admin-note">حساب <b>@ahmed</b> هو حساب الإدارة العليا الوحيد. لا يمكن تجميده أو حظره من لوحة التحكم.</div>
        </>}

        {tab === "users" && <>
          <div className="admin-toolbar users-toolbar"><input value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="ابحث بالاسم، @username أو البريد..."/><button onClick={loadUsers}>{loading ? "..." : "بحث"}</button></div>
          <div className="admin-user-list">{users.map(u => <article className="admin-user-card" key={u.id}><div className="admin-user-main"><div className="admin-user-avatar">{u.display_name?.[0] || "م"}</div><div><b>{u.display_name}</b><span>@{u.username} • {u.email}</span><small>{new Date(u.created_at).toLocaleDateString("ar-LY")}</small></div></div><div className="admin-user-actions"><span className={`status-pill ${u.account_status}`}>{u.username === "ahmed" ? "SUPER ADMIN" : u.account_status === "active" ? "نشط" : u.account_status === "frozen" ? "مجمّد" : "محظور"}</span>{u.username !== "ahmed" && <><button onClick={() => setUserStatus(u,"active")}>تفعيل</button><button className="warn" onClick={() => setUserStatus(u,"frozen")}>تجميد</button><button className="danger" onClick={() => setUserStatus(u,"banned")}>حظر</button></>}</div>{u.ban_reason && <p className="admin-reason">السبب: {u.ban_reason}</p>}</article>)}</div>
        </>}

        {tab === "rooms" && <div className="admin-room-list">{rooms.map(r => <article key={r.id}><div><b>{r.name}</b><span>{r.members_count} عضو • المالك {r.owner_username ? `@${r.owner_username}` : "النظام"}</span><small>{r.description}</small></div><button className="danger" onClick={() => deleteRoom(r)}>حذف الغرفة</button></article>)}</div>}

        {tab === "logs" && <>
          <div className="admin-toolbar"><select value={level} onChange={e => setLevel(e.target.value)}><option value="">كل المستويات</option><option value="INFO">INFO</option><option value="WARNING">WARNING</option><option value="ERROR">ERROR</option></select><input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث في العمليات أو المستخدم..."/><button type="button" onClick={loadLogs}>{loading ? "..." : "تحديث"}</button></div>
          <div className="admin-log-list">{logs.length === 0 && <div className="admin-empty">ما فيش سجلات مطابقة توا.</div>}{logs.map(log => <article className={`admin-log ${String(log.level || "").toLowerCase()}`} key={log.id}><div className="admin-log-top"><span>{log.level}</span><b>{log.category}</b><time>{new Date(log.created_at).toLocaleString("ar-LY")}</time></div><strong>{log.action}</strong><div className="admin-log-meta">{log.username && <span>@{log.username}</span>}{log.status_code && <span>HTTP {log.status_code}</span>}{Number.isFinite(log.duration_ms) && <span>{log.duration_ms}ms</span>}{log.ip_address && <span dir="ltr">{log.ip_address}</span>}</div></article>)}</div>
        </>}
      </section>
    </div>}
  </>;
}
