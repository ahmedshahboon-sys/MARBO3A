import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd(),"app");
const layout=fs.readFileSync(path.join(root,"layout.js"),"utf8");
const finalCss=fs.readFileSync(path.join(root,"ui-v3-unified-scale.css"),"utf8");
const fail=message=>{console.error(`STYLE_CONTRACT_FAILED: ${message}`);process.exitCode=1};
const imports=[...layout.matchAll(/import\s+["']\.\/(.+?\.css)["'];/g)].map(x=>x[1]);
if(imports.at(-1)!=="ui-v3-unified-scale.css")fail("ui-v3-unified-scale.css must remain the final global CSS import");
for(const selector of [".social-dock-track",".messages-v3-page",".notifications-panel",".room-community-"])if(!finalCss.includes(selector))fail(`final V3 contract is missing ${selector}`);
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name),st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|jsx|mjs|tsx|ts)$/.test(name)){const text=fs.readFileSync(p,"utf8");if(/className\s*=\s*["'`][^"'`]*\bsf-top\b/.test(text))fail(`legacy sf-top rendered by ${path.relative(root,p)}`)}}}
walk(root);
if(!process.exitCode)console.log(`Style ownership OK · ${imports.length} ordered layers · final owner ${imports.at(-1)}`);
