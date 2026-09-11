import test from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ||= "postgresql://u:p@127.0.0.1:5432/x";
process.env.REDIS_URL ||= "redis://127.0.0.1:6379";
const {tokenFrom,isAdmin,turnConfig}=await import("../runtime.mjs");
test("token parser accepts only 64 hex bearer tokens",()=>{const good="a".repeat(64);assert.equal(tokenFrom({headers:{authorization:`Bearer ${good}`}}),good);assert.equal(tokenFrom({headers:{authorization:"Bearer nope"}}),"")});
test("admin identity remains explicit",()=>{assert.equal(isAdmin({username:"Ahmed"}),true);assert.equal(isAdmin({username:"user"}),false)});
test("TURN credentials are ephemeral and never expose the shared secret",()=>{const old={host:process.env.TURN_HOST,secret:process.env.TURN_SECRET};process.env.TURN_HOST="turn.example.test";process.env.TURN_SECRET="unit-test-secret";const cfg=turnConfig(7);assert.equal(cfg.turnConfigured,true);assert.ok(cfg.iceServers.some(x=>x.username&&x.credential));assert.equal(JSON.stringify(cfg).includes("unit-test-secret"),false);if(old.host===undefined)delete process.env.TURN_HOST;else process.env.TURN_HOST=old.host;if(old.secret===undefined)delete process.env.TURN_SECRET;else process.env.TURN_SECRET=old.secret});
