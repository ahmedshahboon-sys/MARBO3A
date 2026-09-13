import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const root=process.cwd(),pub=path.join(root,"public");
const official=path.join(pub,"brand","official","marbo3a-mark.png");
const source=await fs.readFile(official);
const meta=await sharp(source,{failOn:"error"}).metadata();
if(meta.format!=="png"||meta.width!==512||meta.height!==512)throw new Error(`Official MARBO3A mark must be a valid 512x512 PNG, got ${meta.format||"unknown"} ${meta.width||0}x${meta.height||0}`);

await Promise.all([
  sharp(source).resize(192,192,{fit:"cover"}).png({compressionLevel:9}).toFile(path.join(pub,"pwa-192.png")),
  sharp(source).resize(512,512,{fit:"cover"}).png({compressionLevel:9}).toFile(path.join(pub,"pwa-512.png")),
  sharp(source).resize(180,180,{fit:"cover"}).png({compressionLevel:9}).toFile(path.join(pub,"apple-touch-icon.png")),
  sharp(source).resize(384,384,{fit:"contain"}).extend({top:64,bottom:64,left:64,right:64,background:{r:16,g:16,b:18,alpha:1}}).png({compressionLevel:9}).toFile(path.join(pub,"pwa-maskable-512.png"))
]);
for(const name of ["pwa-192.png","pwa-512.png","apple-touch-icon.png","pwa-maskable-512.png"]){const s=await fs.stat(path.join(pub,name));if(s.size<1024)throw new Error(`Generated icon is unexpectedly small: ${name}`)}
console.log("MARBO3A official-brand PWA PNG assets generated from validated canonical 512x512 PNG");
