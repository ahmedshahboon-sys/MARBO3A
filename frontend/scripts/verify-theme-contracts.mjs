import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const fail=m=>{console.error("THEME_CONTRACT_FAILED: "+m);process.exitCode=1};
const layout=read("app/layout.js"),design=read("app/design-system.css"),theme=read("app/ThemeRuntime.js"),font=read("app/SiteFontRuntime.js"),lock=read("app/ui-contract-lock.css");
for(const token of ["appearanceBootstrap","marbo3a_theme","marbo3a_site_font","data-theme=\"dark\"","data-site-font=\"readex\"","suppressHydrationWarning"])if(!layout.includes(token))fail("layout prepaint bootstrap missing "+token);
if(layout.indexOf("<head><script")<0||layout.indexOf("<head><script")>layout.indexOf("<body"))fail("appearance bootstrap must run in head before body");
for(const token of ['--font-app:var(--font-readex)','html[data-site-font="readex"]','html[data-site-font="cairo"]','--ui-font:var(--font-app)'])if(!design.includes(token))fail("font contract missing "+token);
if(!theme.includes("dataset.themePreference")||!font.includes("dataset.siteFont"))fail("runtime must reconcile bootstrap datasets");
for(const token of ['html[data-theme="light"]','prefers-reduced-motion:reduce'])if(!lock.includes(token))fail("final theme contract missing "+token);
for(const file of ["app/ui-v3-admin.css","app/ui-v3-profile.css"]){
 const src=read(file);
 if(src.includes("background:#0d1319")||src.includes("linear-gradient(145deg,#151b23,#0d1218)"))fail(file+" still contains known dark-only shared surface");
}
if(!process.exitCode)console.log("Theme contracts OK · prepaint theme/font · Readex default · Cairo compatibility · light parity · reduced motion");
