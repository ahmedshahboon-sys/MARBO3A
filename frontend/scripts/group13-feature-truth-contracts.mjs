import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const appRoot=path.join(root,"app");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const exists=p=>fs.existsSync(path.join(root,p));
const fail=m=>{console.error("GROUP13_FEATURE_TRUTH_FAILED: "+m);process.exitCode=1};

function walk(dir,out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full,out);else out.push(full);
  }
  return out;
}

const jsFiles=walk(appRoot).filter(f=>f.endsWith(".js"));
for(const file of jsFiles){
  const src=fs.readFileSync(file,"utf8");
  const rel=path.relative(root,file);
  if(/\b(?:TODO|FIXME)\b/.test(src))fail(rel+" contains TODO/FIXME product code");
  if(/href\s*=\s*["']#["']/.test(src))fail(rel+" contains href=# dead link");
  if(/href\s*=\s*["']javascript:/i.test(src))fail(rel+" contains javascript: link");
  for(const m of src.matchAll(/<button\b([^>]*)>/g)){
    const attrs=m[1]||"";
    if(/type\s*=\s*["']button["']/.test(attrs)&&
       !/onClick\s*=|onPointer(?:Down|Up)\s*=|onMouseDown\s*=|disabled(?:\s|=|>|$)/.test(attrs)){
      fail(rel+" contains type=button without an action handler");
    }
  }
}

const marketplaceTruth=read("app/product-feature-truth.js");
const marketplaceCard=read("app/MarketplaceComingSoon.js");
const marketplacePage=read("app/marketplace/page.js");
const drawer=read("app/SideDrawer.js");
const home=read("app/home/page.js");
for(const [src,needle,label] of [
  [marketplaceTruth,'status:"preview"',"marketplace registry"],
  [marketplaceTruth,'navLabel:"المتاجر · قريبًا"',"marketplace registry"],
  [marketplaceTruth,'availability:"غير متاح للبيع أو الدفع حاليًا"',"marketplace registry"],
  [marketplaceCard,'data-feature-status={truth.status}',"marketplace card"],
  [marketplaceCard,'البيع والدفع مش متاحين حاليًا',"marketplace card"],
  [marketplaceCard,'شوف الخطة',"marketplace card CTA"],
  [marketplacePage,'MARBO3A MARKET · PREVIEW',"marketplace page"],
  [marketplacePage,'الميزة تحت البناء',"marketplace page"],
  [marketplacePage,'ما فيش دفع أو بيع فعلي توا',"marketplace page"],
  [drawer,'marketplaceTruth.navLabel',"drawer marketplace label"],
  [home,'<MarketplaceComingSoon compact/>',"home marketplace preview"]
]) if(!src.includes(needle)) fail(label+" missing truth marker: "+needle);

const featureContracts=[
  ["auth","app/page.js",["/api/auth/login","/api/auth/register"]],
  ["profile","app/u/[username]/page.js",["/api/social/profile/","/api/chats/with/"]],
  ["feed-posts-media","app/SocialFeed.js",["/api/feed","/api/uploads/video"]],
  ["friends","app/friends/page.js",["/api/friends","/api/friends/request"]],
  ["search","app/search/page.js",["/api/search/advanced"]],
  ["notifications","app/notifications/page.js",["/api/notifications"]],
  ["direct-messages","app/messages/page.js",["/api/chats"]],
  ["message-requests","app/messages/page.js",["/api/message-requests"]],
  ["blocks","app/blocked/page.js",["/api/blocks"]],
  ["privacy","app/PrivacySettingsPanel.js",["/api/privacy"]],
  ["rooms","app/rooms/page.js",["/api/rooms"]],
  ["voice-rooms","app/RoomVoiceStage.js",["/voice/"]],
  ["calls","app/CallCenter.js",["/api/calls"]],
  ["live","app/live/page.js",["/api/live"]],
  ["reports","app/SafetyMenu.js",["/api/reports"]],
  ["admin-moderation","app/admin/advanced/AdvancedAdmin.js",["/api/admin/advanced/moderation"]]
];
for(const [name,file,needles] of featureContracts){
  if(!exists(file)){fail(name+" surface missing: "+file);continue}
  const src=read(file);
  for(const needle of needles)if(!src.includes(needle))fail(name+" missing runtime contract "+needle+" in "+file);
}
for(const file of ["public/manifest.webmanifest","public/sw.js"])if(!exists(file))fail("PWA runtime asset missing: "+file);

if(!process.exitCode)console.log("Group 13 feature truth OK · core social surfaces wired · marketplace explicit preview · no dead literal CTAs");
