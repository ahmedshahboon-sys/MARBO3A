import fs from "fs/promises";
const source=await fs.readFile("app/brand-source.js","utf8");
for(const token of ["MARBO3A_BRAND","/brand/official/marbo3a-mark.svg","مربوعة","MARBO3A"]){if(!source.includes(token))throw new Error(`Missing centralized brand token: ${token}`)}
console.log("R1 centralized brand source OK.");
