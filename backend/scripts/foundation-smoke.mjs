import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();

const expect=async(path,{status=200,headers={},method="GET",body}={})=>{
  const r=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(r.status!==status)throw new Error(`${method} ${path}: expected ${status}, got ${r.status}: ${JSON.stringify(data)}`);
  return data;
};

try{
  const suffix=Date.now().toString(36);
  const user=(await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male','scrypt:00:00','active','user') RETURNING id,username`,[`foundation-${suffix}@example.invalid`,`foundation_${suffix}`,"Foundation User"])).rows[0];
  const admin=(await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male','scrypt:00:00','active','admin') RETURNING id`,[`foundation-admin-${suffix}@example.invalid`,`foundation_admin_${suffix}`,"Foundation Admin"])).rows[0];
  const userToken="a".repeat(32)+Number(user.id).toString(16).padStart(32,"0").slice(-32);
  const adminToken="b".repeat(32)+Number(admin.id).toString(16).padStart(32,"0").slice(-32);
  await redis.set(`session:${userToken}`,String(user.id),{EX:600});
  await redis.set(`session:${adminToken}`,String(admin.id),{EX:600});
  const tokenHash=token=>crypto.createHash("sha256").update(token).digest("hex");
  await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+make_interval(secs=>600),NOW()),($3,$4,NOW()+make_interval(secs=>600),NOW())`,[tokenHash(userToken),user.id,tokenHash(adminToken),admin.id]);

  const cookieMe=await expect("/api/auth/me",{headers:{cookie:`marbo3a_session=${userToken}`}});
  if(Number(cookieMe.user?.id)!==Number(user.id))throw new Error("HttpOnly cookie auth did not resolve the expected user");

  const auth={authorization:`Bearer ${userToken}`,"content-type":"application/json"};
  const identity=await expect("/api/profile/identity",{method:"PATCH",headers:auth,body:{displayName:"Foundation Parsed",username:user.username}});
  if(identity.user?.display_name!=="Foundation Parsed")throw new Error("JSON parser did not reach profile identity route");

  const post=(await pool.query(`INSERT INTO posts(user_id,body) VALUES($1,'foundation post') RETURNING id`,[user.id])).rows[0];
  const reaction=await expect(`/api/feed/${post.id}/reaction`,{method:"PUT",headers:auth,body:{reaction:"laugh"}});
  if(reaction.reaction!=="laugh")throw new Error("Reaction body parsing failed");
  const storedReaction=(await pool.query(`SELECT reaction FROM post_reactions WHERE post_id=$1 AND user_id=$2`,[post.id,user.id])).rows[0]?.reaction;
  if(storedReaction!=="laugh")throw new Error("Reaction was not persisted");

  const room=(await pool.query(`INSERT INTO rooms(name,slug,description,is_public,owner_id) VALUES($1,$2,'',TRUE,$3) RETURNING id`,[`Foundation ${suffix}`,`foundation-${suffix}`,user.id])).rows[0];
  await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'owner')`,[room.id,user.id]);
  const message=(await pool.query(`INSERT INTO messages(room_id,user_id,body) VALUES($1,$2,'before') RETURNING id`,[room.id,user.id])).rows[0];
  const edited=await expect(`/api/rooms/${room.id}/messages/${message.id}`,{method:"PATCH",headers:auth,body:{body:"after"}});
  if(edited.message?.body!=="after")throw new Error("Room message body parsing failed");

  await expect("/api/admin/users",{status:403,headers:{authorization:`Bearer ${userToken}`}});
  const adminUsers=await expect("/api/admin/users",{headers:{authorization:`Bearer ${adminToken}`}});
  if(!Array.isArray(adminUsers.users))throw new Error("Role-based admin access did not return users");

  await expect("/api/health",{status:403,headers:{origin:"https://evil.example"}});
  await expect("/api/health",{status:200,headers:{origin:new URL(base).origin}});

  console.log("foundation smoke ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
