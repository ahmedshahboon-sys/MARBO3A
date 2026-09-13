import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd(),"app");
const layout=fs.readFileSync(path.join(root,"layout.js"),"utf8");
const manifest=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const finalCss=fs.readFileSync(path.join(root,"ui-v3-unified-scale.css"),"utf8");
const fail=message=>{console.error(`STYLE_CONTRACT_FAILED: ${message}`);process.exitCode=1};

if(!/import\s+["']\.\/styles\.css["']/.test(layout))fail("layout.js must import styles.css");
const directCss=[...layout.matchAll(/import\s+["'](\.\/[^"']+\.css)["']/g)].map(x=>x[1]);
if(directCss.length!==1||directCss[0]!=="./styles.css")fail("layout.js must not import individual global CSS layers");
const imports=[...manifest.matchAll(/@import\s+["']\.\/(.+?\.css)["'];/g)].map(x=>x[1]);
if(imports.at(-1)!=="ui-v3-unified-scale.css")fail("ui-v3-unified-scale.css must be the final global layer");
for(const selector of [".social-dock-track",".messages-v3-page",".notifications-panel",".room-community-"])if(!finalCss.includes(selector))fail(`final V3 contract is missing ${selector}`);

const ignored=new Set(["node_modules",".next"]);
function walk(dir){for(const name of fs.readdirSync(dir)){if(ignored.has(name))continue;const p=path.join(dir,name),st=fs.statSync(p);if(st.isDirectory())walk(p);else if(/\.(js|jsx|mjs|tsx|ts)$/.test(name)){const text=fs.readFileSync(p,"utf8");if(/className\s*=\s*["'`][^"'`]*\bsf-top\b/.test(text))fail(`legacy sf-top rendered by ${path.relative(root,p)}`)}}}
walk(root);

if(!process.exitCode)console.log(`Style ownership OK · ${imports.length} compatibility layers · final owner ${imports.at(-1)}`);
