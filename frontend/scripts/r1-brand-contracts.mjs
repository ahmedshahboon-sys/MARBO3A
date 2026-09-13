import fs from "fs/promises";
const read=file=>fs.readFile(file,"utf8");
let failed=false;
const must=async(file,tokens)=>{let src="";try{src=await read(file)}catch{console.error(`Missing brand file: ${file}`);failed=true;return}for(const token of tokens){if(!src.includes(token)){console.error(`Missing brand contract in ${file}: ${token}`);failed=true}}};
try{const png=await fs.readFile("public/brand/official/marbo3a-mark.png");if(png.length<10000||png[0]!==0x89||png.subarray(1,4).toString()!=="PNG")throw new Error("invalid PNG")}catch(e){console.error(`Invalid canonical brand PNG: ${e.message}`);failed=true}
await must("app/brand-source.js",["/brand/official/marbo3a-mark.png","أقرب الناس .. دايمًا معك"]);
await must("app/PremiumChrome.js",["/brand/official/marbo3a-mark.png"]);
await must("app/opengraph-image.js",["/brand/official/marbo3a-mark.png"]);
await must("app/ui-v3-brand.css",["/brand/official/marbo3a-mark.png"]);
await must("app/layout.js",["/brand/official/marbo3a-mark.png"]);
await must("scripts/generate-pwa-icons.mjs",["brand","official","marbo3a-mark.png","512x512"]);
await must("../ops/maintenance/index.html",["/brand/official/marbo3a-mark.png"]);
await must("../compose.yml",["./frontend/public/brand/official:/usr/share/nginx/html/brand/official:ro"]);
if(failed)process.exit(1);
console.log("R1 official brand contracts OK.");
