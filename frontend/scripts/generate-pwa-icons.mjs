import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

const root=process.cwd(),pub=path.join(root,"public");
const official=path.join(pub,"brand","official","marbo3a-mark.svg");
const source=await fs.readFile(official);
const text=source.toString("utf8");
if(!text.includes("<svg")||!text.includes("data:image/webp;base64,"))throw new Error("Official MARBO3A SVG source is invalid");
const base=sharp(source,{density:384,failOn:"error"});
const meta=await base.metadata();
if(meta.format!=="svg"||!meta.width||!meta.height)throw new Error(`Official MARBO3A mark must be a valid SVG, got ${meta.format||"unknown"}`);

await Promise.all([
  sharp(source,{density:384}).resize(192,192,{fit:"cover"}).png({compressionLevel:9}).toFile(path.join(pub,"pwa-192.png")),
  sharp(source,{density:384}).resize(512,512,{fit:"cover"}).png({compressionLevel:9}).toFile(path.join(pub,"pwa-512.png")),
  sharp(source,{density:384}).resize(180,180,{fit:"cover"}).png({compressionLevel:9}).toFile(path.join(pub,"apple-touch-icon.png")),
  sharp(source,{density:384}).resize(384,384,{fit:"contain"}).extend({top:64,bottom:64,left:64,right:64,background:{r:16,g:16,b:18,alpha:1}}).png({compressionLevel:9}).toFile(path.join(pub,"pwa-maskable-512.png"))
]);
for(const name of ["pwa-192.png","pwa-512.png","apple-touch-icon.png","pwa-maskable-512.png"]){const s=await fs.stat(path.join(pub,name));if(s.size<1024)throw new Error(`Generated icon is unexpectedly small: ${name}`)}
console.log(`MARBO3A official-brand PWA PNG assets generated from canonical SVG (${meta.width}x${meta.height})`);
