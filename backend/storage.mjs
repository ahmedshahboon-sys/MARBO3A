import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
const driver=String(process.env.STORAGE_DRIVER||"local").toLowerCase();
const root=path.resolve(process.env.STORAGE_LOCAL_DIR||process.env.UPLOAD_DIR||"/app/uploads");
const publicPrefix=String(process.env.STORAGE_PUBLIC_PREFIX||"/api/uploads").replace(/\/$/,"");
export function storageInfo(){return{driver,local:driver==="local",publicPrefix}}
export async function saveObject({buffer,extension="bin",contentType="application/octet-stream"}){if(driver!=="local")throw new Error("STORAGE_DRIVER_NOT_CONFIGURED");await fs.mkdir(root,{recursive:true});const ext=String(extension||"bin").replace(/[^a-z0-9]/gi,"").toLowerCase()||"bin",name=`${Date.now()}-${crypto.randomBytes(14).toString("hex")}.${ext}`;await fs.writeFile(path.join(root,name),buffer,{flag:"wx"});return{key:name,url:`${publicPrefix}/${name}`,type:contentType,size:buffer.length,driver}}
export async function deleteObject(key){if(driver!=="local")throw new Error("STORAGE_DRIVER_NOT_CONFIGURED");const safe=path.basename(String(key||""));if(!safe)return false;await fs.unlink(path.join(root,safe)).catch(e=>{if(e.code!=="ENOENT")throw e});return true}
