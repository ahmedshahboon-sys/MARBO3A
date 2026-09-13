import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd(),"app");
const layout=fs.readFileSync(path.join(root,"layout.js"),"utf8");
const ownership=fs.readFileSync(path.join(root,"STYLE_OWNERSHIP.md"),"utf8");
const fail=message=>{console.error(`STYLE_CONTRACT_FAILED: ${message}`);process.exitCode=1};
const imports=[...layout.matchAll(/import\s+["']\.\/(.+?\.css)["'];/g)].map(x=>x[1]);
if(imports.at(-1)!=="ui-v3-unified-scale.css")fail("ui-v3-unified-scale.css must remain the final global CSS import");
if(!ownership.includes("ui-v3-unified-scale.css")||!ownership.includes("Bottom navigation")||!ownership.includes("Messages")||!ownership.includes("Notifications")||!ownership.includes("Room/community"))fail("STYLE_OWNERSHIP.md must document final V3 ownership");
const required=["ui-v3.css","ui-v3-messages.css","ui-v3-navigation.css","ui-v3-room-community.css","ui-v3-social-experience.css","ui-v3-unified-scale.css"];
for(const file of required)if(!imports.includes(file))fail(`required compatibility/final layer is missing: ${file}`);
if(!process.exitCode)console.log(`Style ownership OK · ${imports.length} ordered layers · final owner ${imports.at(-1)}`);
