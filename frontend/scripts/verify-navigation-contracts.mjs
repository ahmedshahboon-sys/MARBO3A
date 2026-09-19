import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const fail=m=>{console.error("NAVIGATION_CONTRACT_FAILED: "+m);process.exitCode=1};
const policy=read("app/navigation-policy.js");
for(const token of ["getNavigationPolicy","showHeader","showDock","showDrawer","isImmersivePath","isConversationPath"])if(!policy.includes(token))fail("navigation policy missing "+token);
if(!policy.includes('/^\\/live\\/(?!new'))fail("immersive live policy missing");
for(const file of ["PremiumChrome.js","SocialDock.js","SideDrawer.js"]){
 const src=read("app/"+file);
 if(!src.includes("getNavigationPolicy"))fail(file+" must consume route policy");
 if(src.includes("isAppShellPath"))fail(file+" still owns shell visibility directly");
}
const runtime=read("app/NavigationRuntime.js");
for(const key of ["data","navHeader","navDock","navImmersive"])if(!runtime.includes(key))fail("NavigationRuntime missing policy dataset "+key);
const dock=read("app/SocialDock.js");
for(const label of ["المزيد","الأصحاب","الرئيسية","الرسائل","الغرف"])if(!dock.includes(label))fail("dock missing "+label);
const mobile=read("app/ui-v3-mobile-components.css");
if(/:has\([^)]*\) \.v3-global-header/.test(mobile))fail("mobile CSS still decides global-header existence with :has()");
const lock=read("app/ui-contract-lock.css");
if(!lock.includes('data-nav-header="hidden"')||!lock.includes('data-nav-dock="hidden"'))fail("final navigation fallback contract missing");
if(!process.exitCode)console.log("Navigation contracts OK · explicit route policy · five-slot dock · immersive chrome suppression");
