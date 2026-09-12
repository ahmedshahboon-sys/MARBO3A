import fs from "fs/promises";
import path from "path";
import process from "process";

const root=process.cwd(),appRoot=path.join(root,"app");
async function files(dir,out=[]){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await files(full,out);else out.push(full)}return out}
function escapeRegExp(v){return v.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function routePattern(page){const rel=path.relative(appRoot,path.dirname(page)).split(path.sep).filter(Boolean);if(!rel.length)return /^\/$/;let pattern="";for(const segment of rel){if(/^\[\[\.\.\..+\]\]$/.test(segment)){pattern+="(?:/.*)?";continue}if(/^\[\.\.\..+\]$/.test(segment)){pattern+="/.+";continue}if(/^\[.+\]$/.test(segment)){pattern+="/[^/]+";continue}pattern+=`/${escapeRegExp(segment)}`}return new RegExp(`^${pattern}/?$`)}
const all=await files(appRoot),pages=all.filter(file=>path.basename(file)==="page.js"),patterns=pages.map(routePattern);
const required=["/","/home","/friends","/messages","/rooms","/search","/notifications","/map","/settings","/saved","/blocked","/admin"];
const missingRequired=required.filter(route=>!patterns.some(pattern=>pattern.test(route)));
const literalLinks=new Set();
for(const file of all.filter(file=>file.endsWith(".js"))){const text=await fs.readFile(file,"utf8");for(const re of [/\bhref\s*=\s*["'](\/[^"'#?]*)["']/g,/\bhref\s*=\s*\{\s*["'](\/[^"'#?]*)["']\s*\}/g]){let match;while((match=re.exec(text)))literalLinks.add(match[1]||"/")}}
const unresolved=[...literalLinks].filter(route=>route&&!route.startsWith("/api/")&&!patterns.some(pattern=>pattern.test(route))).sort();
if(missingRequired.length||unresolved.length){if(missingRequired.length)console.error("Missing required app routes:",missingRequired.join(", "));if(unresolved.length)console.error("Unresolved literal href routes:",unresolved.join(", "));process.exit(1)}
console.log(`Route contracts OK: ${pages.length} page routes, ${literalLinks.size} literal links checked.`);
