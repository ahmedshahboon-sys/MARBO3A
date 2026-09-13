import fs from "fs/promises";
const read=file=>fs.readFile(file,"utf8");
let failed=false;
const must=async(file,tokens)=>{let src="";try{src=await read(file)}catch{console.error(`Missing brand file: ${file}`);failed=true;return}for(const token of tokens){if(!src.includes(token)){console.error(`Missing brand contract in ${file}: ${token}`);failed=true}}};
const pngs=[
  "public/brand/official/marbo3a-mark.png",
  "public/brand/official/marbo3a-app-icon.png",
  "public/pwa-192.png",
  "public/pwa-512.png",
  "public/pwa-maskable-512.png",
  "public/apple-touch-icon.png"
];
for(const file of pngs){try{const buf=await fs.readFile(file);const valid=buf.length>1024&&buf[0]===0x89&&buf.subarray(1,4).toString()==="PNG";if(!valid)throw new Error("invalid PNG")}catch(e){console.error(`Invalid brand PNG ${file}: ${e.message}`);failed=true}}
await must("app/brand-source.js",["/brand/official/marbo3a-mark.png","/brand/official/marbo3a-app-icon.png","أقرب الناس .. دايمًا معك"]);
await must("app/PremiumChrome.js",["/brand/official/marbo3a-app-icon.png"]);
await must("app/r1-brand-override.css",["/brand/official/marbo3a-mark.png","marbo3a-app-icon.svg","marbo3a-symbol-orange.svg","marbo3a-mark.svg"]);
await must("app/layout.js",["/pwa-192.png","/pwa-512.png","/apple-touch-icon.png",'import "./r1-brand-override.css"']);
await must("public/manifest.webmanifest",["/pwa-192.png","/pwa-512.png","/pwa-maskable-512.png"]);
await must("scripts/generate-pwa-icons.mjs",["marbo3a-mark.png","marbo3a-app-icon.png","Phase 1 committed PNG identity assets verified"]);
if(failed)process.exit(1);
console.log("R1 Phase 1 PNG brand contracts OK.");
