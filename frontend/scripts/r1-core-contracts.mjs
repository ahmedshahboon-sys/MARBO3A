import fs from "node:fs";
import path from "node:path";
const root=process.cwd(),read=f=>fs.readFileSync(path.join(root,f),"utf8"),must=(s,t,l)=>{if(!s.includes(t))throw new Error(`${l}: missing ${t}`)};

const feed=read("app/SocialFeed.js");
for(const t of ["ReactionIcon","reaction-stack","parentCommentId","comment-reaction-picker","مختار لك","غيّر المنشورات","sponsored-ribbon","مموّل","impression","click","seed="])must(feed,t,"smart feed/comments/reactions");
if(/[❤️😂😡😢]/u.test(feed))throw new Error("R1 feed must render MARBO3A reaction SVGs instead of OS emoji");

const reaction=read("app/ReactionIcon.js");
for(const t of ["like","love","laugh","wow","sad","angry","marbo3a-reaction","<svg"])must(reaction,t,"custom reaction set");

const roomRuntime=read("app/RoomVoiceR1Runtime.js");
for(const t of ["voice/leave","visibilitychange","pageshow","room-voice-remote-audio","voice/seats/","voice/moderate","إدارة الصوت","marbo3a_voice_room"])must(roomRuntime,t,"room voice recovery/moderation");
const roomStage=read("app/RoomVoiceStage.js");
for(const t of ["selfForcedMuted","forced_muted","t.enabled=!(mutedRef.current||forced)","المشرف كتم المايكروفون","keepalive:true","SEAT_TAKEN_OR_LOCKED"])must(roomStage,t,"room voice force-mute/re-entry enforcement");

const market=read("app/MarketplaceComingSoon.js"),marketPage=read("app/marketplace/page.js"),home=read("app/home/page.js"),drawer=read("app/SideDrawer.js");
for(const t of ["متاجر إلكترونية داخل المجتمع","محفظة لاحقًا","/marketplace"])must(market,t,"marketplace teaser");
must(marketPage,"ما فيش دفع أو بيع فعلي توا","marketplace preview safety");must(home,"MarketplaceComingSoon","home marketplace teaser");must(drawer,"المتاجر · قريبًا","navigation marketplace teaser");

const admin=read("app/admin/sponsored/page.js");for(const t of ["/api/admin/sponsored-posts","ظهور","نقر","CTR","مموّل"])must(admin,t,"sponsored admin");

const explore=read("app/explore/page.js");for(const t of ["feedSeed","&seed=","واجهة مربوعة الحالية","guest-post-sponsored","/api/public/live","الغرف العامة الشغالة"])must(explore,t,"guest smart feed continuity");

const runtime=read("app/AppRuntime.js");must(runtime,"RoomVoiceR1Runtime","R1 runtime mount");
const layout=read("app/layout.js");must(layout,'import "./r1-core.css"','R1 styles');must(layout,'import "./r1-admin.css"','R1 admin styles');
const imports=[...layout.matchAll(/import\s+["']\.\/(.+?\.css)["'];/g)].map(x=>x[1]);
const expectedTail=["ui-v3-unified-scale.css","ui-contract-lock.css"];
const actualTail=imports.slice(-expectedTail.length);
if(actualTail.join("|")!==expectedTail.join("|"))throw new Error(`Final UI cascade must end with ${expectedTail.join(" -> ")}`);
console.log("R1 core experience frontend contracts OK");
