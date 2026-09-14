import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
function must(file,tokens,label){const text=read(file);for(const token of tokens)if(!text.includes(token))throw new Error(`${label}: missing ${token} in ${file}`)}
must("app/LiveEntryRuntime.js",["مباشر","/live/new","marbo3a-live-feed-mount","live-story-person","/audience"],"live entry runtime");
must("app/AppRuntime.js",["LiveEntryRuntime","<LiveEntryRuntime/>"],"live runtime mount");
must("app/layout.js",["./live.css","./live-entry.css","./tv-admin-extra.css"],"live and tv styles");
must("app/admin/tv/page.js",["/api/admin/tv/test-source","/api/admin/tv/channels/","جرّب المصدر","اختبار"],"tv admin completion");
console.log("live-entry contracts: ok");
