import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const fail=m=>{console.error("ADMIN_SECONDARY_CONTRACT_FAILED: "+m);process.exitCode=1};

const advanced=read("app/admin/advanced/AdvancedAdmin.module.css");
if(advanced.includes("--contract-"))fail("Advanced Admin still consumes retired --contract-* geometry");
for(const token of ["min-height:44px","overflow-x:auto","scroll-snap-type:x proximity","@media(max-width:520px)"])if(!advanced.includes(token))fail("Advanced Admin missing "+token);

const admin=read("app/ui-v3-admin.css");
for(const token of ["z-index:var(--ui-z-sticky)","overflow-x:auto!important","scroll-snap-type:x proximity!important","min-height:44px!important"])if(!admin.includes(token))fail("Admin shell missing "+token);

const tv=read("app/tv-admin-extra.css");
if(/min-height:(?:3[0-9]|4[0-3])px/.test(tv))fail("TV Admin still has an interactive height below 44px");
if(!tv.includes("@media(max-width:720px)"))fail("TV Admin mobile stacking breakpoint missing");

const settings=read("app/ui-v3-settings.css");
for(const token of ["var(--app-content-bottom-space)","var(--app-dock-total-h)","var(--ui-z-sticky)","var(--ui-z-toast)"])if(!settings.includes(token))fail("Settings route missing "+token);
if(settings.includes("--v3-dock-h"))fail("Settings route still consumes legacy V3 dock geometry");

const lock=read("app/ui-contract-lock.css");
for(const token of [".debug-toolbar{display:flex!important","overflow-x:auto!important",".permissions-card{width:min(560px","@media(max-width:520px)"])if(!lock.includes(token))fail("Secondary screen lock missing "+token);

const advancedJs=read("app/admin/advanced/AdvancedAdmin.js");
const tvJs=read("app/admin/tv/page.js");
for(const [file,src] of [["AdvancedAdmin.js",advancedJs],["admin/tv/page.js",tvJs]]){
 if(!src.includes("AppDialog"))fail(file+" must keep dangerous actions behind AppDialog");
 if(/window\.(?:prompt|confirm|alert)\(/.test(src))fail(file+" uses a browser-native dialog");
}

if(!process.exitCode)console.log("Admin/secondary contracts OK · 320px-safe controls · local tab/tool overflow · dangerous-action dialogs preserved");
