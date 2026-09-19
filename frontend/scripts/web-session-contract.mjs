import fs from "fs";
import path from "path";

const root=new URL("../app/",import.meta.url);
const offenders=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(entry.isFile()&&/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)){
      const src=fs.readFileSync(full,"utf8");
      if(/\bBearer\b|headers\.authorization|authorization\s*:/.test(src))offenders.push(path.relative(path.fileURLToPath(root),full));
      const secretWrite=src.match(/(?:localStorage|sessionStorage)\.setItem\(\s*["']marbo3a_token["']\s*,\s*([^\n;)]+)/g)||[];
      for(const write of secretWrite)if(!/["']cookie["']/.test(write))offenders.push(path.relative(path.fileURLToPath(root),full)+"#token-write");
    }
  }
}
walk(path.fileURLToPath(root));
if(offenders.length){
  console.error("Cookie-only web session contract failed:");
  for(const item of [...new Set(offenders)].sort())console.error(" -",item);
  process.exit(1);
}
console.log("cookie-only web session contract OK");
