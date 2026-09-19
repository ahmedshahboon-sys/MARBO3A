import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const excluded=new Set([".git","node_modules",".next","dist","build","coverage",".runtime",".deploy-backups"]);
const textExt=new Set([".js",".mjs",".cjs",".ts",".tsx",".jsx",".json",".yml",".yaml",".sh",".md",".txt",".toml",".conf",".example"]);
const files=[];
function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    if(excluded.has(ent.name))continue;
    const full=path.join(dir,ent.name);
    if(ent.isDirectory())walk(full);
    else if(ent.name===".env.example"||textExt.has(path.extname(ent.name)))files.push(full);
  }
}
walk(root);

const highConfidence=[
  ["private-key",/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
  ["github-token",/\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["aws-access-key",/\bAKIA[0-9A-Z]{16}\b/],
  ["openai-key",/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["slack-token",/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["google-api-key",/\bAIza[0-9A-Za-z_-]{35}\b/],
  ["stripe-live-secret",/\bsk_live_[0-9A-Za-z]{16,}\b/]
];
const generic=/(?:^|\s)([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*[:=]\s*["']?([^"'\s#]{12,})/i;
const safeValue=/CHANGE_ME|YOUR_|REPLACE_ME|PLACEHOLDER|EXAMPLE|DUMMY|TEST|CI_|NOT_FOR_PRODUCTION|LOCALHOST|\$\{\{|process\.env|secrets\.|\*\*\*/i;
const findings=[];
const rel=f=>path.relative(root,f).replaceAll(path.sep,"/");

for(const file of files){
  let src;
  try{src=fs.readFileSync(file,"utf8")}catch{continue}
  const lines=src.split("\n");
  lines.forEach((line,i)=>{
    for(const pair of highConfidence)if(pair[1].test(line))findings.push({file:rel(file),line:i+1,rule:pair[0]});
    const m=line.match(generic);
    if(m&&!safeValue.test(m[2]))findings.push({file:rel(file),line:i+1,rule:"literal-secret-assignment"});
  });
}

if(findings.length){
  for(const x of findings)console.error(x.file+":"+x.line+" ["+x.rule+"]");
  console.error("Secret scanning gate failed with "+findings.length+" finding(s). Secret values are redacted by design.");
  process.exit(1);
}
console.log("Group 10 secret scanning gate OK · scanned "+files.length+" text files");
