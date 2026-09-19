import fs from "node:fs";
import path from "node:path";

const root=path.resolve(process.cwd());
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const exists=(p)=>fs.existsSync(path.join(root,p));

function lineOf(source,index){return source.slice(0,index).split("\n").length}

function bootstrapOrder(){
  const source=read("bootstrap.mjs");
  const modules=[...source.matchAll(/"\.\/([^"]+\.mjs)"/g)].map((m)=>m[1]);
  // Each compatibility module wraps the previous http.createServer.
  // The last imported wrapper executes first when server-v3 creates the server.
  return modules.reverse();
}

function explicitOrder(){
  const source=read("routes/index.mjs");
  const imports=new Map(
    [...source.matchAll(/import\s+\{(\w+)\}\s+from\s+"\.\/([^"]+)"/g)]
      .map((m)=>[m[1],`routes/${m[2]}`])
  );
  return [...source.matchAll(/^\s*(register\w+)\(app\);/gm)]
    .map((m)=>imports.get(m[1]))
    .filter(Boolean);
}

const runtimeFiles=[...bootstrapOrder(),...explicitOrder(),"server-v3.mjs"];
const seen=new Set();
const orderedFiles=runtimeFiles.filter((file)=>{
  if(seen.has(file))return false;
  seen.add(file);
  return true;
});

const routeRx=/\bapp\.(get|post|put|patch|delete|options|head|use)\(\s*(["'`])([^"'\`]+)\2/g;
const inventory=[];
for(let order=0;order<orderedFiles.length;order++){
  const file=orderedFiles[order];
  if(!exists(file))throw new Error(`Runtime owner file missing: ${file}`);
  const source=read(file);
  let match;
  while((match=routeRx.exec(source))){
    inventory.push({
      order,
      method:match[1].toUpperCase(),
      path:match[3],
      file,
      line:lineOf(source,match.index)
    });
  }
}

const ownershipMethods=new Set(["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"]);
const grouped=new Map();
for(const route of inventory){
  if(!ownershipMethods.has(route.method))continue;
  const key=`${route.method} ${route.path}`;
  const items=grouped.get(key)||[];
  items.push(route);
  grouped.set(key,items);
}

const duplicates=[...grouped.entries()]
  .filter(([,items])=>items.length>1)
  .map(([route,items])=>({
    route,
    winner:items[0],
    owners:items.map(({file,line,order})=>({file,line,order}))
  }))
  .sort((a,b)=>a.route.localeCompare(b.route));

const allowlistPath="route-compatibility-allowlist.json";
const allowlist=JSON.parse(read(allowlistPath));
const approved=allowlist.duplicates||{};
const problems=[];

for(const duplicate of duplicates){
  const expected=approved[duplicate.route];
  const actual=[...new Set(duplicate.owners.map((x)=>x.file))];
  if(!expected){
    problems.push({type:"UNDECLARED_DUPLICATE",route:duplicate.route,actual});
    continue;
  }
  const a=[...actual].sort(),e=[...expected].sort();
  if(JSON.stringify(a)!==JSON.stringify(e)){
    problems.push({type:"OWNER_SET_CHANGED",route:duplicate.route,expected:e,actual:a});
  }
}

for(const [route,owners] of Object.entries(approved)){
  const actual=duplicates.find((x)=>x.route===route);
  if(!actual)problems.push({type:"STALE_ALLOWLIST_ENTRY",route,expected:owners});
}

const report={
  generatedAt:new Date().toISOString(),
  compositionRoot:"server-v3.mjs",
  registrationModel:"reverse bootstrap wrappers, then explicit route registry, then server-v3 direct routes",
  runtimeFiles:orderedFiles,
  routeCount:inventory.length,
  duplicateCount:duplicates.length,
  routes:inventory,
  duplicates
};

const out=process.env.ROUTE_INVENTORY_OUT||path.join("/tmp","marbo3a-runtime-route-inventory.json");
fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
console.log(`Runtime route inventory: ${inventory.length} registrations, ${duplicates.length} duplicate ownership keys`);
console.log(`Inventory written to ${out}`);
if(duplicates.length)console.log(JSON.stringify({duplicates},null,2));

if(process.argv.includes("--check")&&problems.length){
  console.error("Route ownership guard failed:");
  console.error(JSON.stringify(problems,null,2));
  process.exit(1);
}
