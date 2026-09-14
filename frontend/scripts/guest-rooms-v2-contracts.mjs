import fs from "node:fs";
import path from "node:path";
const root=path.resolve(process.cwd()),read=file=>fs.readFileSync(path.join(root,file),"utf8"),must=(src,token,label)=>{if(!src.includes(token))throw new Error(`${label}: missing ${token}`)},reject=(src,token,label)=>{if(src.includes(token))throw new Error(`${label}: forbidden ${token}`)};

const entry=read("app/GuestBrowseEntry.js");
for(const t of ["دخول كزائر","الغرف","اسمع الصوت","/explore"])must(entry,t,"guest landing entry");

const explore=read("app/explore/page.js");
for(const t of ["/api/public/guest/session","/api/public/guest/activity","PublicRoomRail","guestOnly","الغرف العامة الشغالة","/api/public/live","guest-now-strip","guest-live-section","setInterval(refresh,12000)"] )must(explore,t,"guest explore");

const rail=read("app/PublicRoomRail.js");
for(const t of ["/api/public/rooms-v2","active_total","speaker_seat_count","speakers_count","listeners_count","/guest/room/"])must(rail,t,"public rooms rail");

const guestRoom=read("app/guest/room/[id]/page.js");
for(const t of ["RoomVoiceStage","/messages","/presence/join","/presence/heartbeat","للقراءة فقط كزائر","سجل حسابك باش تكتب"] )must(guestRoom,t,"guest room");
reject(guestRoom,'method:"POST",body:JSON.stringify({body:',"guest room cannot send messages");

const voice=read("app/RoomVoiceStage.js");
for(const t of ["room-seat-grid","seatCount","seatIndex","GUEST_LISTEN_ONLY","guestSignals","/api/public/rooms-v2/","marbo3a:permissions-open","زوار"] )must(voice,t,"room voice v2");

const permissions=read("app/PermissionsCenter.js");
for(const t of ["getUserMedia","navigator.geolocation","Notification.requestPermission","navigator.permissions","microphone","camera","location","notifications","marbo3a:onboarding-complete","marbo3a:permissions-open"] )must(permissions,t,"permissions center");

const home=read("app/home/page.js");must(home,"PublicRoomRail","home room discovery");
const manage=read("app/room/manage/[id]/page.js");for(const t of ["uploadMedia","imageUrl","speakerSeatCount","4 كراسي","8 كراسي","12 كرسي","16 كرسي","/experience"] )must(manage,t,"room management v2");
const shared=read("app/r/[slug]/page.js");for(const t of ["/api/public/guest/session","/guest/room/","دخول كزائر واستماع"] )must(shared,t,"shared public room guest flow");
const settings=read("app/settings/page.js");must(settings,"/settings/permissions","permissions settings entry");
const runtime=read("app/AppRuntime.js");must(runtime,"PermissionsCenter","permissions runtime");
console.log("Guest + Rooms V2 + Permissions Center frontend contracts OK");
