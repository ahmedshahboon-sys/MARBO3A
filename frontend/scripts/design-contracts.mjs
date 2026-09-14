import fs from "fs/promises";
let failed=false;
async function must(file,tokens){let src="";try{src=await fs.readFile(file,"utf8")}catch(e){console.error(`Missing UI contract file: ${file}`);failed=true;return}for(const token of tokens){if(!src.includes(token)){console.error(`Missing UI contract in ${file}: ${token}`);failed=true}}}
await must("app/design-system.css",[
  "--ui-font:var(--font-app)","--ui-page-title:22px","--ui-section-title:18px","--ui-body:14px",
  "--ui-btn-h:42px","--ui-input-h:44px","--ui-card-radius:18px","--ui-accent:#ff7a00",
  'html[data-theme="light"]'
]);
await must("app/ui-contract-lock.css",[
  "FINAL MARBO3A UI CONTRACT",".v3-audience-stats","body.story-overlay-open .v3-global-header",
  ".chat-stream>*{position:relative", ".chat-bubble{position:relative", ".social-dock"
]);
await must("app/layout.js",[
  'import "./ui-v3-unified-scale.css"','import "./ui-contract-lock.css"','import "./ui-contract-additions.css"',
  'data-site-font="readex"'
]);
await must("app/PremiumChrome.js",["/api/public/site-stats","v3-audience-stats","totalVisitors","onlineNow"]);
await must("app/admin/debug/page.js",["groupEvents","debug-duplicate-count","<details>"]);
if(failed)process.exit(1);
console.log("MARBO3A locked design contracts OK.");
