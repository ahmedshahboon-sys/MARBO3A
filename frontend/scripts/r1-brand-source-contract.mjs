import fs from "fs/promises";
const source=await fs.readFile("app/brand-source.js","utf8");
for(const token of ["MARBO3A_BRAND","/brand/official/marbo3a-mark.png","/brand/official/marbo3a-app-icon.png","/brand/official/marbo3a-maskable.png","مربوعة","MARBO3A","أقرب الناس .. دايمًا معك"]){if(!source.includes(token))throw new Error(`Missing centralized brand token: ${token}`)}
console.log("R1 centralized final PNG brand source OK.");
