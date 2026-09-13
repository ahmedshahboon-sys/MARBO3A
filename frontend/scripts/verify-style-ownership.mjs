import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd(),"app");
const layout=fs.readFileSync(path.join(root,"layout.js"),"utf8");
const ownership=fs.readFileSync(path.join(root,"STYLE_OWNERSHIP.md"),"utf8");
const fail=message=>{console.error(`STYLE_CONTRACT_FAILED: ${message}`);process.exitCode=1};
const imports=[...layout.matchAll(/import\s+["']\.\/(.+?\.css)["'];/g)].map(x=>x[1]);
if(imports.at(-1)!=="ui-v3-unified-scale.css")fail("ui-v3-unified-scale.css must remain the final global CSS import");
if(!ownership.includes("ui-v3-unified-scale.css")||!ownership.includes("Bottom navigation")||!ownership.includes("Messages")||!ownership.includes("Notifications")||!ownership.includes("Room/community"))fail("STYLE_OWNERSHIP.md must document final V3 ownership");
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name),st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|jsx|mjs|tsx|ts)$/.test(name)){const text=fs.readFileSync(p,"utf8");if(/className\s*=\s*["'`][^"'`]*\bsf-top\b/.test(text))fail(`legacy sf-top rendered by ${path.relative(root,p)}`)}}}
walk(root);
if(!process.exitCode)console.log(`Style ownership OK · ${imports.length} ordered layers · final owner ${imports.at(-1)}`);
