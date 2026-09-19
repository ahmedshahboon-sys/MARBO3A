import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
function must(file,tokens,label){const text=read(file);for(const token of tokens)if(!text.includes(token))throw new Error(`${label}: missing ${token} in ${file}`)}
must("app/LiveEntryRuntime.js",["مباشر","/live/new","marbo3a-live-composer-mount","marbo3a-live-feed-mount","live-story-person","/audience","setInterval(sync,1500)"],"live entry runtime");
must("app/AppRuntime.js",["LiveEntryRuntime","<LiveEntryRuntime/>","immersiveLive","!immersiveLive&&<PremiumChrome/>","app&&!immersiveLive"],"live immersive chrome policy");
must("app/SideDrawer.js",["/live","اللايفات"],"live drawer entry");
must("app/live/new/page.js",["liveRef","viewersRef","pendingIce","startLoops","live_host_","router.push(\"/live\")"],"live host rtc lifecycle");
must("app/live/[id]/page.js",["pendingIce","flushIce","scheduleReconnect","live_viewer_","live-exit-x","router.push(\"/live\")"],"live viewer rtc lifecycle");
must("app/layout.js",["./live.css","./live-entry.css","./live-round-a.css","./live-guest-polish.css","./tv-admin-extra.css"],"live and tv styles");
must("app/live-round-a.css",[".live-immersive",".live-watch-chat",".live-exit-x","orientation:landscape"],"live immersive styles");
must("app/live-guest-polish.css",[".install-nudge",".guest-now-strip",".guest-live-section",".live-watch-chat","orientation:landscape"],"live guest polish styles");
must("app/ui-contract-lock.css",["Final immersive live ownership",".live-immersive .live-watch-chat",".live-immersive .live-studio-controls",".install-nudge","orientation:landscape"],"final live UI ownership");
must("app/PlatformClient.js",["marbo3a_install_nudge_until","dismissInstall(7)","installRouteAllowed"],"install nudge persistence");
must("app/explore/page.js",["/api/public/live","guest-now-strip","guest-live-section","setInterval(refresh,12000)"],"guest live sync");
must("public/sw.js",["marbo3a-shell-v20-guest-pwa-safety","cache:\"no-store\"","SKIP_WAITING"],"fresh pwa shell");
must("app/admin/tv/page.js",["/api/admin/tv/test-source","/api/admin/tv/channels/","جرّب المصدر","اختبار"],"tv admin completion");
console.log("live-entry contracts: ok");
