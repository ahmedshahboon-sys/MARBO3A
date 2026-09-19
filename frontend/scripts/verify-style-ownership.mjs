import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd(),"app");
const layout=fs.readFileSync(path.join(root,"layout.js"),"utf8");
const ownership=fs.readFileSync(path.join(root,"STYLE_OWNERSHIP.md"),"utf8");
const fail=message=>{console.error(`STYLE_CONTRACT_FAILED: ${message}`);process.exitCode=1};
const imports=[...layout.matchAll(/import\s+["']\.\/(.+?\.css)["'];/g)].map(x=>x[1]);

const unifiedIndex=imports.indexOf("ui-v3-unified-scale.css");
const lockIndex=imports.indexOf("ui-contract-lock.css");
if(unifiedIndex<0)fail("ui-v3-unified-scale.css is missing");
if(lockIndex<0)fail("ui-contract-lock.css is missing");
if(!(unifiedIndex<lockIndex))fail("final UI contract order must end unified-scale -> contract-lock");
if(imports.at(-1)!=="ui-contract-lock.css")fail("ui-contract-lock.css must remain the final global CSS import");

const required=["ui-v3.css","ui-v3-messages.css","ui-v3-navigation.css","ui-v3-room-community.css","ui-v3-social-experience.css","ui-v3-unified-scale.css","ui-contract-lock.css"];
for(const file of required)if(!imports.includes(file))fail(`required compatibility/final layer is missing: ${file}`);

const protectedOwners=new Map([
  ["--ui-font","design-system.css"],
  ["--ui-accent","design-system.css"],
  ["--app-header-h","ui-v3-unified-scale.css"],
  ["--app-dock-h","ui-v3-unified-scale.css"],
  ["--v3-header-h","ui-v3-unified-scale.css"],
  ["--v3-dock-h","ui-v3-unified-scale.css"]
]);
const cssFiles=fs.readdirSync(root).filter(name=>name.endsWith(".css")).sort();
const declarationFor=token=>new RegExp(`(?:^|[;{]\\s*)${token}\\s*:`,`gm`);
for(const file of cssFiles){
  const src=fs.readFileSync(path.join(root,file),"utf8");
  for(const [token,owner] of protectedOwners){
    if(declarationFor(token).test(src)&&file!==owner)fail(`${token} is owned by ${owner}, but is redefined in ${file}`);
  }
}

for(const [token,owner] of protectedOwners){
  const src=fs.readFileSync(path.join(root,owner),"utf8");
  if(!declarationFor(token).test(src))fail(`${owner} no longer defines protected token ${token}`);
  if(!ownership.includes(token)||!ownership.includes(owner))fail(`STYLE_OWNERSHIP.md must document ${token} owner ${owner}`);
}

const protectedNamespaces=new Map([
  ["--ui-","design-system.css"],
  ["--app-","ui-v3-unified-scale.css"]
]);
const declarationPrefixFor=prefix=>new RegExp(`(?:^|[;{]\\s*)(${prefix}[a-z0-9_-]+)\\s*:`,`gmi`);
for(const file of cssFiles){
  const src=fs.readFileSync(path.join(root,file),"utf8");
  for(const [prefix,owner] of protectedNamespaces){
    for(const match of src.matchAll(declarationPrefixFor(prefix))){
      const token=match[1];
      if(file!==owner)fail(`${token} belongs to namespace owner ${owner}, but is redefined in ${file}`);
    }
  }
}
for(const [prefix,owner] of protectedNamespaces){
  if(!ownership.includes(`${prefix}*`)||!ownership.includes(owner))fail(`STYLE_OWNERSHIP.md must document namespace ${prefix}* owner ${owner}`);
}

const geometryOwner=fs.readFileSync(path.join(root,"ui-v3-unified-scale.css"),"utf8");
for(const token of ["--app-header-h","--app-dock-h","--v3-header-h","--v3-dock-h"]){
  const count=[...geometryOwner.matchAll(new RegExp(`${token}\\s*:`,`g`))].length;
  if(count!==1)fail(`Group 2 geometry token ${token} must have exactly one declaration; found ${count}`);
}
for(const token of ["--app-page-max","--app-safe-top","--app-safe-bottom","--app-header-total-h","--app-dock-total-h","--app-content-bottom-space","--app-viewport-h"]){
  if(!declarationFor(token).test(geometryOwner))fail(`Group 2 geometry owner is missing ${token}`);
}
if(!geometryOwner.includes("--v3-header-h:var(--app-header-total-h)")||!geometryOwner.includes("--v3-dock-h:var(--app-dock-h)"))fail("legacy V3 header/dock geometry must alias the app geometry source");
const finalContract=fs.readFileSync(path.join(root,"ui-contract-lock.css"),"utf8");
for(const legacy of ["--contract-max","--contract-gutter","--contract-header","--contract-dock","--contract-safe-bottom"]){
  if(finalContract.includes(legacy))fail(`ui-contract-lock.css must consume --app-* geometry directly; found ${legacy}`);
}
for(const file of ["ui-v3-unified-scale.css","ui-contract-lock.css","responsive-round.css"]){
  const src=fs.readFileSync(path.join(root,file),"utf8");
  if(/100vh(?![a-z])/i.test(src))fail(`${file} contains legacy 100vh; use app/visual viewport geometry`);
}
const grandfatheredNames=new Set(["ui-v3-final-audit.css","r1-brand-override.css"]);
for(const file of cssFiles){
  if(/(?:repair|fix|final|override)/i.test(file)&&!grandfatheredNames.has(file))fail(`new repair/fix/final/override layer is forbidden: ${file}`);
}
for(const file of grandfatheredNames)if(!cssFiles.includes(file))fail(`grandfathered compatibility filename disappeared without contract update: ${file}`);

for(const label of ["Tokens / Theme","Header geometry","Bottom Dock geometry","Buttons / Inputs","Feed","Rooms","Direct Chat","Settings / Dialogs","Profile","Admin","Calls / Media Viewer"]){
  if(!ownership.includes(label))fail(`STYLE_OWNERSHIP.md is missing domain owner: ${label}`);
}

if(!process.exitCode)console.log(`Style ownership OK · ${imports.length} ordered layers · ${protectedOwners.size} protected tokens · final owner ${imports.at(-1)}`);
