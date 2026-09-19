import fs from "node:fs";
import path from "node:path";

const root=process.cwd(),wfDir=path.join(root,".github","workflows");
const workflows=fs.readdirSync(wfDir).filter(x=>/\.ya?ml$/.test(x));
let failed=false;
const fail=m=>{console.error(m);failed=true};

for(const name of workflows){
  const src=fs.readFileSync(path.join(wfDir,name),"utf8");
  for(const line of src.split("\n")){
    const m=line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
    if(!m||m[1].startsWith("./"))continue;
    const at=m[1].lastIndexOf("@"),ref=at>=0?m[1].slice(at+1):"";
    if(!/^[a-f0-9]{40}$/i.test(ref))fail(name+": unpinned action "+m[1]);
  }
  if(/git\s+reset\s+--hard\s+origin\/main/.test(src))fail(name+": moving origin/main reset is forbidden");
  if(/ssh-keyscan/.test(src))fail(name+": ssh-keyscan runtime trust is forbidden");
}

for(const name of ["ci.yml","backend-foundation.yml","ops-contracts.yml","security.yml"]){
  const src=fs.readFileSync(path.join(wfDir,name),"utf8");
  if(!src.includes("git rev-parse HEAD")||!src.includes("GITHUB_SHA"))fail(name+": exact GITHUB_SHA verification missing");
}

const deploy=fs.readFileSync(path.join(wfDir,"deploy.yml"),"utf8");
for(const token of ["release_sha:","MARBO3A_DEPLOY_KNOWN_HOSTS","StrictHostKeyChecking=yes","git merge-base --is-ancestor","RELEASE_SHA","environment: production"]){
  if(!deploy.includes(token))fail("deploy.yml: missing "+token);
}
if(deploy.includes("ssh-keyscan"))fail("deploy.yml: runtime ssh-keyscan forbidden");

const security=fs.readFileSync(path.join(wfDir,"security.yml"),"utf8");
for(const token of ["codeql-action/init@","codeql-action/analyze@","npm audit --audit-level=high","group10-secret-scan.mjs","group10-static-security.mjs"]){
  if(!security.includes(token))fail("security.yml: missing "+token);
}

const dep=fs.readFileSync(path.join(root,".github","dependabot.yml"),"utf8");
for(const token of ['package-ecosystem: "npm"','directory: "/backend"','directory: "/frontend"','package-ecosystem: "github-actions"']){
  if(!dep.includes(token))fail("dependabot.yml: missing "+token);
}

const script=fs.readFileSync(path.join(root,"ops","deploy-production.sh"),"utf8");
for(const token of ["REQUESTED_RELEASE_SHA","git rev-parse HEAD",'git reset --hard "$PREVIOUS"',"ROLLBACK_HEAD"]){
  if(!script.includes(token))fail("deploy-production.sh: missing "+token);
}

if(failed)process.exit(1);
console.log("Group 10 supply-chain contracts OK · "+workflows.length+" workflows pinned and immutable deploy enforced");
