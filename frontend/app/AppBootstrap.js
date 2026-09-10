"use client";

import { useEffect } from "react";

function token() {
  return localStorage.getItem("marbo3a_token") || sessionStorage.getItem("marbo3a_token") || "";
}

function visitorId() {
  let id = localStorage.getItem("marbo3a_visitor_id");
  if (!id) {
    id = `v_${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem("marbo3a_visitor_id", id);
  }
  return id;
}

export default function AppBootstrap() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    let stopped = false;
    async function ping() {
      if (stopped || document.visibilityState === "hidden") return;
      const auth = token();
      try {
        await fetch("/api/telemetry/ping", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(auth ? { authorization: `Bearer ${auth}` } : {})
          },
          body: JSON.stringify({ visitorId: visitorId() }),
          keepalive: true
        });
      } catch {}
    }

    ping();
    const timer = setInterval(ping, 45000);
    const onVisible = () => document.visibilityState === "visible" && ping();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
