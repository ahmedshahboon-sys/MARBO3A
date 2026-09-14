import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");

test("room membership emits realtime system events",()=>{const src=read("routes/core-rooms.mjs");for(const token of ["emitRoom","room:member-event","انضم","غادر","/api/rooms/:id/leave"])assert.ok(src.includes(token),`missing ${token}`)});
test("story mute list and restore endpoints exist",()=>{const src=read("ijkl-experience.mjs");for(const token of ['app.get("/api/stories/mutes"','app.put("/api/stories/mutes/:userId"','app.delete("/api/stories/mutes/:userId"'])assert.ok(src.includes(token),`missing ${token}`)});
