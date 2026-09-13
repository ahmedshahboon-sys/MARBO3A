import fs from "fs/promises";
import path from "path";

const root=process.cwd(),pub=path.join(root,"public");
const expected=[
  "pwa-192.png",
  "pwa-512.png",
  "apple-touch-icon.png",
  "pwa-maskable-512.png",
  "favicon-16.png",
  "favicon-32.png",
  "brand/official/marbo3a-mark.png",
  "brand/official/marbo3a-app-icon.png",
  "brand/official/marbo3a-maskable.png"
];
for(const name of expected){
  const file=path.join(pub,...name.split("/")),buf=await fs.readFile(file);
  const valid=buf.length>250&&buf[0]===0x89&&buf.subarray(1,4).toString()==="PNG";
  if(!valid)throw new Error(`Invalid committed MARBO3A PNG asset: ${name}`);
}
console.log("MARBO3A committed PNG identity and PWA icons verified");
