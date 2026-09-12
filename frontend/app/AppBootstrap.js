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
    /* Service-worker lifecycle is owned by PlatformClient only. */
    let stopped = false;
    async function ping() {
      if (stopped || document.visibilityState === "hidden") return;
      const auth = token();
      try {
        const response=await fetch("/api/telemetry/ping", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(auth&&auth!=="cookie" ? { authorization: `Bearer ${auth}` } : {})
          },
          credentials:"same-origin",
          body: JSON.stringify({ visitorId: visitorId() }),
          keepalive: true
        });
        if(response.ok){
          const data=await response.json().catch(()=>({}));
          window.dispatchEvent(new CustomEvent("marbo3a:presence",{detail:{onlineUsers:Number(data.online||0),at:Date.now()}}));
        }
      } catch {}
    }

    ping();
    const timer = setInterval(ping, 30000);
    const onVisible = () => document.visibilityState === "visible" && ping();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus",ping);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus",ping);
    };
  }, []);

  return null;
}
