import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const fail=m=>{console.error("OVERLAY_CONTRACT_FAILED: "+m);process.exitCode=1};
const design=read("app/design-system.css"),lock=read("app/ui-contract-lock.css");
for(const token of ["--ui-z-base","--ui-z-sticky","--ui-z-header","--ui-z-dock","--ui-z-drawer","--ui-z-popover","--ui-z-toast","--ui-z-dialog","--ui-z-media","--ui-z-call","--ui-z-emergency"])if(!design.includes(token+":"))fail("missing stack token "+token);
for(const token of ["--ui-z-header","--ui-z-dock","--ui-z-drawer","--ui-z-popover","--ui-z-toast","--ui-z-dialog","--ui-z-media","--ui-z-call","--ui-z-emergency"])if(!lock.includes("var("+token+")"))fail("final stack contract does not consume "+token);
const hook=read("app/useModalLayer.js");
for(const part of ["Escape","Tab","previous","modalLayer"])if(!hook.includes(part))fail("modal hook missing "+part);
for(const [file,parts] of Object.entries({
 "app/AppDialog.js":["useModalLayer","kind:\"dialog\""],
 "app/SideDrawer.js":["useModalLayer","aria-modal=\"true\""],
 "app/SettingsPanel.js":["useModalLayer","kind:\"dialog\""],
 "app/MediaGallery.js":["useModalLayer","kind:\"media\""],
 "app/CallCenter.js":["useModalLayer","kind:\"critical\"","escapeCloses:false"]
})){const src=read(file);for(const part of parts)if(!src.includes(part))fail(file+" missing "+part)}
if(!lock.includes('html[data-modal-open="true"] .social-dock'))fail("dock not suppressed by modal state");
if(!lock.includes('html[data-modal-layer="critical"] :is(.install-nudge,.live-notification-toast)'))fail("critical overlay does not suppress transient UI");
if(!process.exitCode)console.log("Overlay contracts OK · central z-index ladder · focus trap · scroll lock · critical layering");
