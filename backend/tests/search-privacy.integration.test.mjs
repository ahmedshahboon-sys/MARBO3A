import test,{after,before} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";

const enabled=Boolean(process.env.INTEGRATION_DATABASE_URL&&process.env.INTEGRATION_REDIS_URL);
if(enabled){
  process.env.NODE_ENV="test";
  process.env.DATABASE_URL=process.env.INTEGRATION_DATABASE_URL;
  process.env.REDIS_URL=process.env.INTEGRATION_REDIS_URL;
}

let pool,redis,server,baseUrl;
const tokens={viewer:"1".repeat(64),owner:"2".repeat(64)};
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");

async function api(token,query){
  const response=await fetch(`${baseUrl}/api/search/advanced?${new URLSearchParams(query)}`,{headers:{authorization:`Bearer ${token}`}});
  const body=await response.text();
  assert.equal(response.status,200,body);
  return JSON.parse(body);
}

before(async()=>{
  if(!enabled)return;
  const runtime=await import("../runtime.mjs");
  ({pool,redis}=runtime);
  await pool.query(`
    CREATE TABLE users(id BIGINT PRIMARY KEY,email TEXT NOT NULL,username TEXT NOT NULL,display_name TEXT NOT NULL,gender TEXT,bio TEXT,avatar_url TEXT,account_status TEXT NOT NULL DEFAULT 'active',ban_reason TEXT,role TEXT NOT NULL DEFAULT 'user',two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE durable_sessions(token_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE profile_privacy(user_id BIGINT PRIMARY KEY,show_city BOOLEAN NOT NULL DEFAULT TRUE,show_online BOOLEAN NOT NULL DEFAULT TRUE,who_can_see_posts TEXT NOT NULL DEFAULT 'everyone');
    CREATE TABLE user_locations(user_id BIGINT PRIMARY KEY,city TEXT);
    CREATE TABLE user_blocks(blocker_id BIGINT NOT NULL,blocked_id BIGINT NOT NULL,PRIMARY KEY(blocker_id,blocked_id));
    CREATE TABLE friendships(id BIGSERIAL PRIMARY KEY,requester_id BIGINT NOT NULL,addressee_id BIGINT NOT NULL,status TEXT NOT NULL);
    CREATE TABLE posts(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,body TEXT,image_url TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),deleted_at TIMESTAMPTZ);
    CREATE TABLE post_likes(post_id BIGINT NOT NULL,user_id BIGINT NOT NULL);
    CREATE TABLE post_comments(id BIGSERIAL PRIMARY KEY,post_id BIGINT NOT NULL,deleted_at TIMESTAMPTZ);
    CREATE TABLE rooms(id BIGSERIAL PRIMARY KEY,name TEXT,slug TEXT,description TEXT,image_url TEXT,is_public BOOLEAN NOT NULL DEFAULT TRUE);
    CREATE TABLE room_members(room_id BIGINT NOT NULL,user_id BIGINT NOT NULL);
  `);
  await pool.query(`INSERT INTO users(id,email,username,display_name,gender,bio) VALUES
    (1,'viewer@test.invalid','viewer','Viewer','male','viewer bio'),
    (2,'blocked@test.invalid','blocked','Blocked Person','female','blocked bio'),
    (3,'hidden@test.invalid','hidden','Hidden City','female','hidden bio'),
    (4,'offline@test.invalid','private-online','Private Presence','female','presence bio'),
    (5,'public@test.invalid','public-owner','Public Owner','male','public bio'),
    (6,'friend@test.invalid','friend-owner','Friend Owner','male','friend bio'),
    (7,'fof@test.invalid','fof-owner','FoF Owner','male','fof bio'),
    (8,'nobody@test.invalid','nobody-owner','Nobody Owner','male','nobody bio'),
    (9,'bridge@test.invalid','bridge','Mutual Bridge','male','bridge bio'),
    (10,'blocked-by-viewer@test.invalid','blocked-by-viewer','Viewer Blocked Target','female','viewer-blocked bio')`);
  await pool.query(`INSERT INTO profile_privacy(user_id,show_city,show_online,who_can_see_posts) VALUES
    (1,TRUE,TRUE,'everyone'),(2,TRUE,TRUE,'everyone'),(3,FALSE,TRUE,'everyone'),
    (4,TRUE,FALSE,'everyone'),(5,TRUE,TRUE,'everyone'),(6,TRUE,TRUE,'friends'),
    (7,TRUE,TRUE,'friends_of_friends'),(8,TRUE,TRUE,'nobody'),(9,TRUE,TRUE,'everyone'),
    (10,TRUE,TRUE,'everyone')`);
  await pool.query(`INSERT INTO user_locations(user_id,city) VALUES(3,'TripoliSecret')`);
  await pool.query(`INSERT INTO user_blocks(blocker_id,blocked_id) VALUES(2,1),(1,10)`);
  await pool.query(`INSERT INTO friendships(requester_id,addressee_id,status) VALUES(1,6,'accepted'),(1,9,'accepted'),(9,7,'accepted')`);
  await pool.query(`INSERT INTO posts(user_id,body) VALUES
    (1,'privacy needle own'),(2,'privacy needle blocked'),(5,'privacy needle public'),
    (6,'privacy needle friend'),(7,'privacy needle fof'),(8,'privacy needle nobody'),
    (10,'privacy needle viewer blocked target')`);
  await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at) VALUES($1,1,NOW()+INTERVAL '1 hour'),($2,5,NOW()+INTERVAL '1 hour')`,[hash(tokens.viewer),hash(tokens.owner)]);
  await runtime.ensureRedis();
  await redis.set(`session:${tokens.viewer}`,"1",{EX:3600});
  await redis.set(`session:${tokens.owner}`,"5",{EX:3600});
  await redis.zAdd("presence:users",[{score:Date.now(),value:"4"}]);

  await import("../experience-v2.mjs");
  const app=express();
  app.use(express.json());
  server=http.createServer(app);
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve)});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async()=>{
  if(!enabled)return;
  await new Promise(resolve=>server.close(resolve));
  if(redis?.isOpen)await redis.quit();
  await pool.end();
});

test("blocked accounts and their posts never appear in advanced search",{skip:!enabled},async()=>{
  const users=await api(tokens.viewer,{q:"Blocked",type:"users"});
  const posts=await api(tokens.viewer,{q:"privacy needle",type:"posts"});
  assert.deepEqual(users.users,[]);
  assert.ok(!posts.posts.some(post=>Number(post.user_id)===2));
});

test("accounts blocked by the viewer and their posts never appear",{skip:!enabled},async()=>{
  const users=await api(tokens.viewer,{q:"Viewer Blocked Target",type:"users"});
  const posts=await api(tokens.viewer,{q:"privacy needle viewer blocked target",type:"posts"});
  assert.deepEqual(users.users,[]);
  assert.ok(!posts.posts.some(post=>Number(post.user_id)===10));
});

test("a hidden city cannot match text search or the city filter",{skip:!enabled},async()=>{
  const text=await api(tokens.viewer,{q:"TripoliSecret",type:"users"});
  const filtered=await api(tokens.viewer,{q:"Hidden",type:"users",city:"TripoliSecret"});
  assert.deepEqual(text.users,[]);
  assert.deepEqual(filtered.users,[]);
});

test("hidden presence is neither exposed nor included by the online filter",{skip:!enabled},async()=>{
  const normal=await api(tokens.viewer,{q:"Private Presence",type:"users"});
  const online=await api(tokens.viewer,{q:"Private Presence",type:"users",online:"1"});
  assert.equal(normal.users.length,1);
  assert.equal(normal.users[0].online,false);
  assert.deepEqual(online.users,[]);
});

test("post search enforces everyone, friends, friends-of-friends, and nobody",{skip:!enabled},async()=>{
  const result=await api(tokens.viewer,{q:"privacy needle",type:"posts"});
  const owners=new Set(result.posts.map(post=>Number(post.user_id)));
  assert.ok(owners.has(1),"viewer must see their own post");
  assert.ok(owners.has(5),"everyone post must be visible");
  assert.ok(owners.has(6),"friend post must be visible");
  assert.ok(owners.has(7),"friends-of-friends post must be visible");
  assert.ok(!owners.has(8),"nobody post must be hidden");
});

test("a post owner can find their own post",{skip:!enabled},async()=>{
  await pool.query(`UPDATE profile_privacy SET who_can_see_posts='nobody' WHERE user_id=5`);
  const result=await api(tokens.owner,{q:"privacy needle public",type:"posts"});
  assert.equal(result.posts.length,1);
  assert.equal(Number(result.posts[0].user_id),5);
});
