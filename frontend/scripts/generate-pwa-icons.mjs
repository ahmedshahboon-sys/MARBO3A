import fs from "fs/promises";
import path from "path";

const root=process.cwd(),pub=path.join(root,"public");
const expected=["pwa-192.png","pwa-512.png","apple-touch-icon.png","pwa-maskable-512.png"];
for(const name of expected){
  const file=path.join(pub,name),buf=await fs.readFile(file);
  const valid=buf.length>1024&&buf[0]===0x89&&buf.subarray(1,4).toString()==="PNG";
  if(!valid)throw new Error(`Invalid committed PWA icon: ${name}`);
}
const svg=await fs.readFile(path.join(pub,"brand","official","marbo3a-mark.svg"),"utf8");
const required=["<svg","viewBox=\"0 0 1254 1254\"","مربوعة","#26323d","#ff6900"];
if(svg.length<2500||required.some(token=>!svg.includes(token))||svg.includes("data:image/"))throw new Error("Invalid canonical MARBO3A vector source");
console.log("MARBO3A committed PWA icons and canonical vector SVG verified");
