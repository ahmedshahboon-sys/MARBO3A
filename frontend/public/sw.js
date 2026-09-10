const VERSION="marbo3a-shell-v4";
const OFFLINE="/offline.html";
const SHELL=[OFFLINE,"/manifest.webmanifest","/logo.svg"];

self.addEventListener("install",event=>{event.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting();});

self.addEventListener("fetch",event=>{
  const req=event.request;if(req.method!=="GET")return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/uploads/"))return;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).catch(()=>caches.match(OFFLINE)));
    return;
  }
  const cacheable=url.pathname.startsWith("/_next/static/")||/\.(?:css|js|svg|png|jpg|jpeg|webp|woff2?)$/i.test(url.pathname);
  if(!cacheable)return;
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok&&res.type==="basic"){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy)).catch(()=>{});}return res;})));
});

self.addEventListener("push",event=>{
  let data={};try{data=event.data?.json()||{};}catch{data={title:"مربوعة",body:event.data?.text()||"عندك تنبيه جديد"};}
  event.waitUntil((async()=>{if("setAppBadge" in self.navigator&&Number.isFinite(Number(data.badgeCount)))self.navigator.setAppBadge(Number(data.badgeCount)).catch(()=>{});await self.registration.showNotification(data.title||"مربوعة",{body:data.body||"عندك تنبيه جديد",icon:"/logo.svg",badge:"/logo.svg",dir:"rtl",lang:"ar",data:{url:data.url||"/home"},tag:data.tag||`marbo3a-${Date.now()}`,renotify:Boolean(data.renotify)});})());
});
self.addEventListener("notificationclick",event=>{event.notification.close();const url=event.notification.data?.url||"/home";event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{for(const c of list){if("focus" in c){c.navigate?.(url);return c.focus();}}return clients.openWindow(url);}));});
