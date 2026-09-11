import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import {S3Client,PutObjectCommand,DeleteObjectCommand} from "@aws-sdk/client-s3";

const driver=String(process.env.STORAGE_DRIVER||"local").trim().toLowerCase();
const root=path.resolve(process.env.STORAGE_LOCAL_DIR||process.env.UPLOAD_DIR||"/app/uploads");
const publicPrefix=String(process.env.STORAGE_PUBLIC_PREFIX||"/api/uploads").replace(/\/$/,"");
const s3Bucket=String(process.env.S3_BUCKET||"").trim();
const s3Region=String(process.env.S3_REGION||"auto").trim();
const s3Endpoint=String(process.env.S3_ENDPOINT||"").trim();
const s3PublicBase=String(process.env.S3_PUBLIC_BASE_URL||"").replace(/\/$/,"");
const s3Prefix=String(process.env.S3_KEY_PREFIX||"marbo3a").replace(/^\/+|\/+$/g,"");
let client=null;

function safeExt(value){return String(value||"bin").replace(/[^a-z0-9]/gi,"").toLowerCase()||"bin"}
function objectName(ext){return `${new Date().toISOString().slice(0,10)}/${Date.now()}-${crypto.randomBytes(14).toString("hex")}.${safeExt(ext)}`}
function publicS3Url(key){if(!s3PublicBase)throw new Error("S3_PUBLIC_URL_MISSING");return `${s3PublicBase}/${key.split("/").map(encodeURIComponent).join("/")}`}
function s3(){if(client)return client;if(!s3Bucket||!s3PublicBase)throw new Error("STORAGE_DRIVER_NOT_CONFIGURED");const accessKeyId=String(process.env.S3_ACCESS_KEY_ID||"").trim(),secretAccessKey=String(process.env.S3_SECRET_ACCESS_KEY||"").trim();client=new S3Client({region:s3Region,endpoint:s3Endpoint||undefined,forcePathStyle:String(process.env.S3_FORCE_PATH_STYLE||"").toLowerCase()==="true",credentials:accessKeyId&&secretAccessKey?{accessKeyId,secretAccessKey}:undefined});return client}
export function storageInfo(){return{driver,local:driver==="local",s3:driver==="s3",publicPrefix:driver==="local"?publicPrefix:s3PublicBase,configured:driver==="local"?true:Boolean(s3Bucket&&s3PublicBase)}}

export async function saveObject({buffer,extension="bin",contentType="application/octet-stream"}){
  const rel=objectName(extension);
  if(driver==="local"){
    await fs.mkdir(path.join(root,path.dirname(rel)),{recursive:true});
    await fs.writeFile(path.join(root,rel),buffer,{flag:"wx"});
    return{key:rel,url:`${publicPrefix}/${rel}`,type:contentType,size:buffer.length,driver};
  }
  if(driver==="s3"){
    const key=s3Prefix?`${s3Prefix}/${rel}`:rel;
    await s3().send(new PutObjectCommand({Bucket:s3Bucket,Key:key,Body:buffer,ContentType:contentType,CacheControl:"public,max-age=31536000,immutable"}));
    return{key,url:publicS3Url(key),type:contentType,size:buffer.length,driver};
  }
  throw new Error("STORAGE_DRIVER_NOT_CONFIGURED");
}

export async function deleteObject(key){
  const value=String(key||"").replace(/^\/+/,"");if(!value)return false;
  if(driver==="local"){
    const resolved=path.resolve(root,value);if(!resolved.startsWith(root+path.sep))throw new Error("INVALID_STORAGE_KEY");
    await fs.unlink(resolved).catch(e=>{if(e.code!=="ENOENT")throw e});return true;
  }
  if(driver==="s3"){await s3().send(new DeleteObjectCommand({Bucket:s3Bucket,Key:value}));return true}
  throw new Error("STORAGE_DRIVER_NOT_CONFIGURED");
}
