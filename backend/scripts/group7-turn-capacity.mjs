import fs from "node:fs";

const compose=fs.readFileSync(new URL("../../compose.yml",import.meta.url),"utf8");
const env=fs.readFileSync(new URL("../../.env.example",import.meta.url),"utf8");
const frontend=fs.readFileSync(new URL("../../frontend/app/RoomVoiceStage.js",import.meta.url),"utf8");

const number=(name,fallback)=>Number(env.match(new RegExp("^"+name+"=(\\d+)$","m"))?.[1]||fallback);
const participants=number("ROOM_VOICE_MAX_PARTICIPANTS",24);
const speakers=number("ROOM_VOICE_MAX_SPEAKERS",6);
const liveViewers=8;
const simultaneousCallReserve=16;

if(!frontend.includes('new RTCPeerConnection')||!frontend.includes('p.role==="speaker"'))throw new Error("RoomVoiceStage P2P topology contract changed; recalculate TURN capacity");
if(speakers>participants)throw new Error("speaker policy exceeds participant policy");

const speakerListener=speakers*(participants-speakers);
const speakerMesh=speakers*(speakers-1)/2;
const voicePeerConnections=speakerListener+speakerMesh;
const voiceAllocations=voicePeerConnections*2;
const liveAllocations=liveViewers*2;
const callAllocations=simultaneousCallReserve*2;
const baseline=voiceAllocations+liveAllocations+callAllocations;
const required=Math.ceil(baseline*1.5);

const min=Number(compose.match(/--min-port=(\d+)/)?.[1]);
const max=Number(compose.match(/--max-port=(\d+)/)?.[1]);
if(!Number.isInteger(min)||!Number.isInteger(max)||max<min)throw new Error("TURN relay range missing from compose.yml");
const available=max-min+1;
for(const proto of ["udp","tcp"]){
 const mapping=`${min}-${max}:${min}-${max}/${proto}`;
 if(!compose.includes(mapping))throw new Error("TURN Docker mapping does not match coturn "+proto+" relay range");
}
if(available<required)throw new Error(`TURN relay capacity too small: ${available} available, ${required} required`);
if(available>1024)throw new Error("TURN relay range expanded beyond reviewed Group 7 bound");

console.log(JSON.stringify({
 participants,speakers,voicePeerConnections,voiceAllocations,liveAllocations,
 simultaneousCallReserve,callAllocations,headroomPercent:50,required,
 relayRange:`${min}-${max}`,available
},null,2));
console.log("Group 7 TURN capacity contract OK");
