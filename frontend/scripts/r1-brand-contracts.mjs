import fs from "fs/promises";
const read=file=>fs.readFile(file,"utf8");
let failed=false;
const must=async(file,tokens)=>{let src="";try{src=await read(file)}catch{console.error(`Missing brand file: ${file}`);failed=true;return}for(const token of tokens){if(!src.includes(token)){console.error(`Missing brand contract in ${file}: ${token}`);failed=true}}};
try{
  const svg=await fs.readFile("public/brand/official/marbo3a-mark.svg","utf8");
  const required=["<svg","viewBox=\"0 0 1254 1254\"","مربوعة","#26323d","#ff6900"];
  if(svg.length<2500||required.some(token=>!svg.includes(token))||svg.includes("data:image/"))throw new Error("invalid canonical vector SVG");
}catch(e){console.error(`Invalid canonical brand SVG: ${e.message}`);failed=true}
await must("app/brand-source.js",["/brand/official/marbo3a-mark.svg","أقرب الناس .. دايمًا معك"]);
await must("app/PremiumChrome.js",["/brand/official/marbo3a-mark.svg"]);
await must("app/opengraph-image.js",["/brand/official/marbo3a-mark.svg"]);
await must("app/ui-v3-brand.css",["/brand/official/marbo3a-mark.svg"]);
await must("app/r1-brand-override.css",["/brand/official/marbo3a-mark.svg","marbo3a-app-icon.svg","marbo3a-symbol-orange.svg"]);
await must("app/layout.js",["/brand/official/marbo3a-mark.svg",'import "./r1-brand-override.css"']);
await must("app/onboarding/page.js",["/brand/official/marbo3a-mark.svg"]);
await must("app/PlatformClient.js",["/brand/official/marbo3a-mark.svg"]);
await must("public/offline.html",["/brand/official/marbo3a-mark.svg"]);
await must("public/manifest.webmanifest",["/pwa-192.png","/pwa-512.png","/pwa-maskable-512.png"]);
await must("scripts/generate-pwa-icons.mjs",["brand","official","marbo3a-mark.svg","canonical vector SVG"]);
// Do not inspect repository-level ops/ or compose.yml here: this script runs inside the frontend Docker build context.
// Repository-level deployment/maintenance contracts are validated by the operations checks outside the frontend image.
if(failed)process.exit(1);
console.log("R1 official brand frontend contracts OK.");
