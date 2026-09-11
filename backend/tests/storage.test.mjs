import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("local storage writes and deletes an object", async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"marbo3a-storage-"));
  process.env.STORAGE_DRIVER="local";
  process.env.STORAGE_LOCAL_DIR=root;
  process.env.STORAGE_PUBLIC_PREFIX="/api/uploads";
  const mod=await import(`../storage.mjs?test=${Date.now()}`);
  const saved=await mod.saveObject({buffer:Buffer.from("hello"),extension:"txt",contentType:"text/plain"});
  assert.equal(saved.driver,"local");
  assert.equal(saved.size,5);
  assert.match(saved.url,/^\/api\/uploads\//);
  assert.equal(await fs.readFile(path.join(root,saved.key),"utf8"),"hello");
  assert.equal(await mod.deleteObject(saved.key),true);
  await assert.rejects(fs.stat(path.join(root,saved.key)));
  await fs.rm(root,{recursive:true,force:true});
});
