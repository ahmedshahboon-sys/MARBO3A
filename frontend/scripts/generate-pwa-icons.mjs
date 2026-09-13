import fs from "fs/promises";
import path from "path";

const root=process.cwd(),pub=path.join(root,"public");
const expected=[
  "pwa-192.png",
  "pwa-512.png",
  "apple-touch-icon.png",
  "pwa-maskable-512.png",
  path.join("brand","official","marbo3a-mark.png"),
  path.join("brand","official","marbo3a-app-icon.png")
];
for(const name of expected){
  const file=path.join(pub,name),buf=await fs.readFile(file);
  const valid=buf.length>1024&&buf[0]===0x89&&buf.subarray(1,4).toString()==="PNG";
  if(!valid)throw new Error(`Invalid committed MARBO3A PNG asset: ${name}`);
}
console.log("MARBO3A Phase 1 committed PNG identity assets verified");
