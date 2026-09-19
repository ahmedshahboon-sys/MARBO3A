import crypto from "crypto";
import pg from "pg";
import {createClient} from "redis";

const base=process.env.APP_ORIGIN||"http://127.0.0.1:4000";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const redis=createClient({url:process.env.REDIS_URL});
await redis.connect();
const tokenHash=t=>crypto.createHash("sha256").update(t).digest("hex");
async function http(path,{token,method="GET",body,status=200,error}={}){
  const headers={origin:base};if(token)headers.authorization=`Bearer ${token}`;if(body!==undefined)headers["content-type"]="application/json";
  const r=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(r.status!==status)throw new Error(`${method} ${path}: expected ${status}, got ${r.status} ${JSON.stringify(data)}`);
  if(error&&data.error!==error)throw new Error(`${method} ${path}: expected ${error}, got ${JSON.stringify(data)}`);
  return data;
}

async function makeUser(label){
  const suffix=`${label}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  const row=(await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role) VALUES($1,$2,$3,'male','scrypt:00:00','active','user') RETURNING id,username`,[`${suffix}@example.invalid`,suffix,label])).rows[0];
  const token=crypto.randomBytes(32).toString("hex");
  await redis.set(`session:${token}`,String(row.id),{EX:900});
  await pool.query(`INSERT INTO durable_sessions(token_hash,user_id,expires_at,last_seen) VALUES($1,$2,NOW()+INTERVAL '15 minutes',NOW())`,[tokenHash(token),row.id]);
  return{...row,token};
}
function splitPackets(text){return String(text||"").split("\x1e").filter(Boolean)}
class PollSocket{
  constructor({cookie="",queryToken="",authToken=""}={}){this.cookie=cookie;this.queryToken=queryToken;this.authToken=authToken;this.sid="";this.seq=1;this.connected=false}
  url(){
    const q=new URLSearchParams({EIO:"4",transport:"polling",t:String(Date.now())});
    if(this.sid)q.set("sid",this.sid);
    if(this.queryToken)q.set("token",this.queryToken);
    return `${base}/rt-v2/socket.io/?${q}`;
  }
  headers(extra={}){return this.cookie?{cookie:`marbo3a_session=${encodeURIComponent(this.cookie)}`,...extra}:extra}
  async post(body){
    const r=await fetch(this.url(),{method:"POST",headers:this.headers({"content-type":"text/plain;charset=UTF-8"}),body});
    if(!r.ok)throw new Error(`socket POST failed ${r.status}: ${await r.text()}`);
    return r.text();
  }
  async poll(){
    const r=await fetch(this.url(),{headers:this.headers(),signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw new Error(`socket poll failed ${r.status}: ${await r.text()}`);
    const packets=splitPackets(await r.text());
    for(const p of packets)if(p==="2")await this.post("3");
    return packets;
  }
  async open({expectUnauthorized=false}={}){
    const r=await fetch(this.url(),{headers:this.headers(),signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw new Error(`socket handshake failed ${r.status}`);
    const first=await r.text(),open=splitPackets(first).find(x=>x.startsWith("0"));
    if(!open)throw new Error(`missing engine open packet: ${first}`);
    this.sid=JSON.parse(open.slice(1)).sid;
    await this.post(this.authToken?`40${JSON.stringify({token:this.authToken})}`:"40");
    for(let i=0;i<4;i++){
      const packets=await this.poll();
      if(packets.some(x=>x.startsWith("44"))){
        if(expectUnauthorized)return false;
        throw new Error(`socket unauthorized: ${packets.join("|")}`);
      }
      if(packets.some(x=>x.startsWith("40"))){this.connected=true;return true}
    }
    if(expectUnauthorized)return false;
    throw new Error("socket namespace did not connect");
  }
  async emitAck(event,payload){
    const id=this.seq++,prefix=`3${id}`;
    await this.post(`2${id}${JSON.stringify([event,payload])}`);
    for(let i=0;i<6;i++){
      const packets=await this.poll();
      const ack=packets.find(x=>x.startsWith(prefix));
      if(ack){
        const arr=JSON.parse(ack.slice(prefix.length)||"[]");
        return arr[0]??null;
      }
    }
    throw new Error(`missing ack for ${event}`);
  }
  async close(){
    if(!this.sid)return;
    await this.post("41").catch(()=>{});
    this.connected=false;
  }
}

try{
  const A=await makeUser("RT_A"),B=await makeUser("RT_B"),C=await makeUser("RT_C"),T=await makeUser("RT_T");

  const sorted=(x,y)=>[Number(x),Number(y)].sort((a,b)=>a-b);
  const [ab1,ab2]=sorted(A.id,B.id),[bc1,bc2]=sorted(B.id,C.id),[at1,at2]=sorted(A.id,T.id);
  const ab=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) RETURNING id`,[ab1,ab2])).rows[0];
  const bc=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) RETURNING id`,[bc1,bc2])).rows[0];
  const at=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) RETURNING id`,[at1,at2])).rows[0];

  const ownRoom=(await pool.query(`INSERT INTO rooms(name,slug,description,is_public,visibility,join_policy,owner_id) VALUES($1,$2,'',TRUE,'public','open',$3) RETURNING id`,[`RT Own ${Date.now()}`,`rt-own-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,A.id])).rows[0];
  const foreignRoom=(await pool.query(`INSERT INTO rooms(name,slug,description,is_public,visibility,join_policy,owner_id) VALUES($1,$2,'',TRUE,'public','open',$3) RETURNING id`,[`RT Foreign ${Date.now()}`,`rt-foreign-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`,B.id])).rows[0];
  await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'owner')`,[ownRoom.id,A.id,foreignRoom.id,B.id]);

  const queryOnly=new PollSocket({queryToken:A.token});
  if(await queryOnly.open({expectUnauthorized:true}))throw new Error("query token unexpectedly authenticated");
  await queryOnly.close();

  const mobile=new PollSocket({authToken:A.token});
  if(!await mobile.open())throw new Error("handshake auth token did not authenticate");
  await mobile.close();

  await http(`/api/typing/direct/${bc.id}`,{token:A.token,method:"POST",body:{typing:true},status:403,error:"REALTIME_SCOPE_FORBIDDEN"});
  await http(`/api/typing/room/${foreignRoom.id}`,{token:A.token,method:"POST",body:{typing:true},status:403,error:"REALTIME_SCOPE_FORBIDDEN"});
  await http(`/api/typing/direct/${bc.id}`,{token:A.token,status:403,error:"REALTIME_SCOPE_FORBIDDEN"});
  await http(`/api/typing/direct/${ab.id}`,{token:A.token,method:"POST",body:{typing:true}});

  const socket=new PollSocket({cookie:A.token});
  if(!await socket.open())throw new Error("cookie socket did not authenticate");

  let ack=await socket.emitAck("typing",{kind:"direct",scopeId:bc.id,active:true});
  if(ack?.error!=="REALTIME_SCOPE_FORBIDDEN")throw new Error(`foreign chat typing was not denied: ${JSON.stringify(ack)}`);
  if(await redis.get(`typing:direct:${bc.id}:${A.id}`))throw new Error("foreign chat typing wrote Redis presence");

  ack=await socket.emitAck("typing",{kind:"room",scopeId:foreignRoom.id,active:true});
  if(ack?.error!=="REALTIME_SCOPE_FORBIDDEN")throw new Error(`foreign room typing was not denied: ${JSON.stringify(ack)}`);

  ack=await socket.emitAck("typing",{kind:"direct",scopeId:ab.id,active:true});
  if(ack?.ok!==true)throw new Error(`authorized chat typing failed: ${JSON.stringify(ack)}`);
  if(!await redis.get(`typing:direct:${ab.id}:${A.id}`))throw new Error("authorized typing did not write Redis state");

  ack=await socket.emitAck("room:join",foreignRoom.id);
  if(ack?.error!=="REALTIME_SCOPE_FORBIDDEN")throw new Error(`foreign room join was not denied: ${JSON.stringify(ack)}`);
  ack=await socket.emitAck("room:join",ownRoom.id);
  if(ack?.ok!==true)throw new Error(`own room join failed: ${JSON.stringify(ack)}`);

  await pool.query(`INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[B.id,A.id]);
  ack=await socket.emitAck("chat:join",ab.id);
  if(ack?.error!=="REALTIME_SCOPE_FORBIDDEN")throw new Error(`blocked chat join was not denied: ${JSON.stringify(ack)}`);
  ack=await socket.emitAck("presence:watch",{userIds:[B.id]});
  if(ack?.ok!==true||Number(ack.count)!==0)throw new Error(`blocked presence leaked: ${JSON.stringify(ack)}`);
  await pool.query(`DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`,[B.id,A.id]);
  await socket.close();

  const throttle=new PollSocket({cookie:A.token});
  await throttle.open();
  let limited=false;
  for(let i=0;i<40;i++){
    const a=await throttle.emitAck("typing",{kind:"direct",scopeId:at.id,active:Boolean(i%2)});
    if(a?.error==="REALTIME_RATE_LIMITED"){limited=true;break}
    if(a?.ok!==true)throw new Error(`unexpected typing ack before throttle: ${JSON.stringify(a)}`);
  }
  if(!limited)throw new Error("typing burst was not throttled");
  await throttle.close();

  console.log("group2 realtime authorization ok");
}finally{
  await redis.quit().catch(()=>{});
  await pool.end();
}
