import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const root=process.cwd(),pub=path.join(root,"public");
const icon=path.join(pub,"pwa-icon.svg"),mask=path.join(pub,"pwa-maskable.svg");
await Promise.all([
  sharp(icon).resize(192,192).png().toFile(path.join(pub,"pwa-192.png")),
  sharp(icon).resize(512,512).png().toFile(path.join(pub,"pwa-512.png")),
  sharp(icon).resize(180,180).png().toFile(path.join(pub,"apple-touch-icon.png")),
  sharp(mask).resize(512,512).png().toFile(path.join(pub,"pwa-maskable-512.png"))
]);
for(const name of ["pwa-192.png","pwa-512.png","apple-touch-icon.png","pwa-maskable-512.png"]){const s=await fs.stat(path.join(pub,name));if(s.size<1024)throw new Error(`Generated icon is unexpectedly small: ${name}`)}
console.log("MARBO3A PWA PNG assets generated");
