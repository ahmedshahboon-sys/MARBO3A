const base=String(process.env.E2E_BASE_URL||"").replace(/\/$/,"");
if(!/^https?:\/\//.test(base)){console.error("E2E_BASE_URL is required");process.exit(2)}
const checks=[];
async function check(name,path,{status=200,json}={}){
 const started=Date.now();let result={name,path,status:"FAIL"};
 try{const r=await fetch(base+path,{redirect:"manual",headers:{"User-Agent":"MARBO3A-Group14-QA/1.0"}});const text=await r.text();result={...result,httpStatus:r.status,durationMs:Date.now()-started,requestId:r.headers.get("x-request-id")||null};if(r.status!==status)throw new Error(`expected ${status}, got ${r.status}`);if(json){const body=JSON.parse(text);json(body)}result.status="PASS"}catch(e){result.error=String(e?.message||e)}checks.push(result);console.log(JSON.stringify(result))
}
await check("public-home","/",{status:200});
await check("api-health","/api/health",{status:200,json:b=>{if(b?.ok!==true)throw new Error("health ok!=true")}});
await check("maintenance-state","/api/system/maintenance",{status:200,json:b=>{if(b?.ok!==true||typeof b?.active!=="boolean")throw new Error("invalid maintenance contract")}});
await check("guest-auth-boundary","/api/me",{status:401});
const failed=checks.filter(x=>x.status!=="PASS");
console.log(JSON.stringify({group:14,base,passed:checks.length-failed.length,failed:failed.length,total:checks.length}));
if(failed.length)process.exit(1);
