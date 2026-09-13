import fs from "fs/promises";
const required=["app/SocialFeed.js","app/RoomVoiceR1Runtime.js","app/ReactionIcon.js","app/MarketplaceComingSoon.js","app/brand-source.js","app/r1-core.css","app/r1-admin.css","public/brand/official/marbo3a-mark.png","public/brand/official/marbo3a-app-icon.png","public/pwa-192.png","public/pwa-512.png","public/pwa-maskable-512.png","public/apple-touch-icon.png","public/favicon-16.png","public/favicon-32.png"];
for(const file of required){await fs.access(file)}
console.log("R1 file surface and final MARBO3A identity present.");
