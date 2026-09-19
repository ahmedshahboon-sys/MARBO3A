import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const excluded=new Set([".git","node_modules",".next","dist","build","coverage",".runtime",".deploy-backups"]);
const codeExt=new Set([".js",".mjs",".cjs",".ts",".tsx",".jsx"]);
const files=[];
function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(excluded.has(ent.name))continue;
    const full=path.join(dir,ent.name);
    if(ent.isDirectory())walk(full);
    else if(codeExt.has(path.extname(ent.name)))files.push(full);
  }
}
walk(root);
const issues=[];
const rel=f=>path.relative(root,f).replaceAll(path.sep,"/");
const add=(file,line,rule)=>issues.push({file:rel(file),line,rule});
const lineOf=(src,index)=>src.slice(0,index).split("\n").length;

for(const file of files){
  const name=rel(file),src=fs.readFileSync(file,"utf8");
  const production=!/(^|\/)(tests?|scripts)(\/|$)/.test(name);

  for(const pair of [["eval",/(^|[^\w])eval\s*\(/g],["new-function",/new\s+Function\s*\(/g]]){
    const rule=pair[0],re=pair[1];
    for(const m of src.matchAll(re))if(production)add(file,lineOf(src,m.index),rule);
  }

  if(production&&/(?:from\s+["']node:child_process["']|require\(["'](?:node:)?child_process["']\))/.test(src))add(file,1,"child-process-production");

  const storage=/\b(localStorage|sessionStorage)\.setItem\s*\(([^\n;]+)\)/g;
  for(const m of src.matchAll(storage)){
    const call=m[0],args=m[2],keyExpr=String(args).split(",",1)[0]||"";
    if(!/(?:token|jwt|secret|auth[_-]?token|session[_-]?token)/i.test(keyExpr))continue;
    if(/marbo3a_token["']\s*,\s*["']cookie["']/.test(call))continue;
    add(file,lineOf(src,m.index),"browser-secret-storage");
  }

  const filePath=/path\.(?:join|resolve)\s*\([^;\n]*(?:req\.(?:body|query|params)|request\.(?:body|query|params))/g;
  for(const m of src.matchAll(filePath))if(production)add(file,lineOf(src,m.index),"request-controlled-file-path");

  const adminRoute=/app\.(?:get|post|put|patch|delete)\s*\(\s*["']\/api\/admin\//g;
  for(const m of src.matchAll(adminRoute)){
    const slice=src.slice(m.index,Math.min(src.length,m.index+1600));
    const directGuard=/(requireAdmin|requireSuperAdmin|adminGuard|requireRole|admin)\s*\(/.test(slice);
    const authRoleGuard=/requireAuth\s*\(/.test(slice)&&/isAdmin\s*\(/.test(slice);
    if(!directGuard&&!authRoleGuard)add(file,lineOf(src,m.index),"admin-route-without-visible-guard");
  }

  const query=/\b(?:pool|client|db)\.query\s*\(\s*`([\s\S]*?)`/g;
  for(const m of src.matchAll(query)){
    const sql=m[1];
    const expressions=[...sql.matchAll(/\$\{([^}]+)\}/g)].map(x=>x[1].trim());
    for(const expr of expressions){
      const reviewed =
        /^[A-Z][A-Z0-9_]*$/.test(expr) ||
        /^(?:mediaSql|postSql|savedVisibilitySql|visibilitySql|feedVisibilitySql|sortSql|orderSql|orderBy|order|friendsOnly|reactionSql\(.+\)|durationSql\(\)|blockedClause\(.+\)|pollVisibility\(\)|spec\[[01]\])$/.test(expr);
      if(reviewed)continue;
      add(file,lineOf(src,m.index),"dynamic-sql-template");
      break;
    }
  }
}

if(issues.length){
  for(const x of issues)console.error(x.file+":"+x.line+" ["+x.rule+"]");
  console.error("Static security gate failed with "+issues.length+" finding(s). Values are intentionally not printed.");
  process.exit(1);
}
console.log("Group 10 static security gate OK · scanned "+files.length+" code files");
