import fs from "fs/promises";
const required=["app/SocialFeed.js","app/RoomVoiceR1Runtime.js","app/ReactionIcon.js","app/MarketplaceComingSoon.js","app/brand-source.js","app/r1-core.css","app/r1-admin.css","public/brand/official/marbo3a-mark.svg"];
for(const file of required){await fs.access(file)}
console.log("R1 file surface present.");
