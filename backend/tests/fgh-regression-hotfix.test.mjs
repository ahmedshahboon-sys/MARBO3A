import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
test("FGH regression shield owns feed and profile before legacy wrappers",()=>{const src=read("fgh-regression-hotfix.mjs"),boot=read("bootstrap.mjs");assert.match(src,/app\.get\("\/api\/feed"/);assert.match(src,/app\.get\("\/api\/social\/profile\/:username"/);assert.match(src,/filterVisible/);assert.match(src,/privacy_rule/);assert.ok(boot.lastIndexOf("fgh-regression-hotfix.mjs")>boot.lastIndexOf("fgh-privacy-compat.mjs"));});
