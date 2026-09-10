"use client";

import { useEffect, useMemo, useState } from "react";

function savedToken() {
  return localStorage.getItem("marbo3a_token") || sessionStorage.getItem("marbo3a_token") || "";
}

export default function AdminConsole() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  async function api(path) {
    const token = savedToken();
    if (!token) throw new Error("NO_TOKEN");
    const res = await fetch(path, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
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
      params.set("limit", "120");
      const data = await api(`/api/admin/logs?${params}`);
      setLogs(data.logs || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    const timer = setTimeout(loadStats, 1200);
    const refresh = setInterval(loadStats, 30000);
    const onStorage = () => loadStats();
    window.addEventListener("storage", onStorage);
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (open && allowed) loadLogs();
  }, [open, level]);

  const cards = useMemo(() => stats ? [
    ["متصلون الآن", stats.onlineUsers, "●"],
    ["الزوار الآن", stats.onlineVisitors, "◉"],
    ["زوار اليوم", stats.visitorsToday, "↗"],
    ["المسجلون", stats.registeredUsers, "◎"],
    ["جدد اليوم", stats.newUsersToday, "+"],
    ["الغرف", stats.rooms, "#"],
    ["الرسائل", stats.messages, "✦"],
    ["أخطاء اليوم", stats.errorsToday, "!"],
  ] : [], [stats]);

  if (!allowed) return null;

  return (
    <>
      <button className="admin-fab" type="button" onClick={() => setOpen(v => !v)} aria-label="لوحة الإدارة">
        <span>⚙</span>
        {stats && <b>{stats.onlineUsers}</b>}
      </button>

      {open && (
        <div className="admin-overlay" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
          <section className="admin-console" dir="rtl">
            <header className="admin-head">
              <div>
                <span className="admin-kicker">خاص بالإدارة</span>
                <h2>مركز مراقبة مربوعة</h2>
                <p>إحصائيات مباشرة + سجل العمليات والأخطاء</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>×</button>
            </header>

            <div className="admin-stats-grid">
              {cards.map(([label, value, icon]) => (
                <article key={label}>
                  <span>{icon}</span>
                  <strong>{Number(value || 0).toLocaleString("en-US")}</strong>
                  <small>{label}</small>
                </article>
              ))}
            </div>

            <div className="admin-toolbar">
              <select value={level} onChange={e => setLevel(e.target.value)}>
                <option value="">كل المستويات</option>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
              </select>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث في العمليات أو المستخدم..." />
              <button type="button" onClick={loadLogs}>{loading ? "..." : "تحديث"}</button>
            </div>

            <div className="admin-log-list">
              {logs.length === 0 && <div className="admin-empty">ما فيش سجلات مطابقة توا.</div>}
              {logs.map(log => (
                <article className={`admin-log ${String(log.level || "").toLowerCase()}`} key={log.id}>
                  <div className="admin-log-top">
                    <span>{log.level}</span>
                    <b>{log.category}</b>
                    <time>{new Date(log.created_at).toLocaleString("ar-LY")}</time>
                  </div>
                  <strong>{log.action}</strong>
                  <div className="admin-log-meta">
                    {log.username && <span>@{log.username}</span>}
                    {log.status_code && <span>HTTP {log.status_code}</span>}
                    {Number.isFinite(log.duration_ms) && <span>{log.duration_ms}ms</span>}
                    {log.ip_address && <span dir="ltr">{log.ip_address}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
