import fs from "fs/promises";
import path from "path";
import webpush from "web-push";
const envPath=path.resolve(process.argv[2]||"../.env");let text="";try{text=await fs.readFile(envPath,"utf8")}catch(e){if(e.code!=="ENOENT")throw e}
const has=k=>new RegExp(`^${k}=.+$`,`m`).test(text);if(has("VAPID_PUBLIC_KEY")&&has("VAPID_PRIVATE_KEY")){console.log("VAPID already configured");process.exit(0)}const keys=webpush.generateVAPIDKeys();const set=(k,v)=>{const re=new RegExp(`^${k}=.*$`,`m`);text=re.test(text)?text.replace(re,`${k}=${v}`):`${text.trimEnd()}\n${k}=${v}\n`};set("VAPID_PUBLIC_KEY",keys.publicKey);set("VAPID_PRIVATE_KEY",keys.privateKey);if(!has("VAPID_SUBJECT"))set("VAPID_SUBJECT","mailto:admin@marbo3a.ly");await fs.writeFile(envPath,text,{mode:0o600});await fs.chmod(envPath,0o600);console.log("VAPID configured securely (private key not printed)");
