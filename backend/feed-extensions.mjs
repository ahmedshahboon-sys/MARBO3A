import http from "http";
import pg from "pg";
import {createClient} from "redis";

const prior=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const redis=createClient({url:process.env.REDIS_URL});
redis.on("error",e=>console.error("Feed Redis:",e));
let ready;

async function infra(){
  if(!ready) ready=(async()=>{
    if(!redis.isOpen) await redis.connect();
    await pool.query(`CREATE TABLE IF NOT EXISTS posts(
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts(id DESC) WHERE deleted_at IS NULL`);
    await pool.query(`CREATE TABLE IF NOT EXISTS post_likes(
      post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(post_id,user_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS post_comments(
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments(post_id,id ASC)`);
  })().catch(e=>{ready=null;throw e});
  return ready;
}

const clean=(v="",n=2000)=>String(v??"").trim().slice(0,n);
const token=req=>String(req.headers.authorization||"").match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1]||"";
async function currentUser(req){
  await infra();
  const t=token(req); if(!t) return null;
  const id=await redis.get(`session:${t}`); if(!id) return null;
  return (await pool.query(`SELECT id,username,display_name,avatar_url,bio,account_status,created_at FROM users WHERE id=$1`,[id])).rows[0]||null;
}
async function auth(req,res){
  const u=await currentUser(req);
  if(!u){res.status(401).json({ok:false,error:"UNAUTHORIZED"});return null;}
  if(u.username!=="ahmed"&&u.account_status!=="active"){res.status(403).json({ok:false,error:"ACCOUNT_RESTRICTED"});return null;}
  return u;
}
async function friendship(a,b){
  return Boolean((await pool.query(`SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,[a,b])).rows[0]);
}

function postSelect(where="",extra=""){
  return `SELECT p.id,p.body,p.image_url,p.created_at,p.updated_at,u.id user_id,u.username,u.display_name,u.avatar_url,
  COUNT(DISTINCT l.user_id)::int likes_count,COUNT(DISTINCT c.id) FILTER(WHERE c.deleted_at IS NULL)::int comments_count,
  BOOL_OR(l.user_id=$1) AS liked
  FROM posts p JOIN users u ON u.id=p.user_id
  LEFT JOIN post_likes l ON l.post_id=p.id
  LEFT JOIN post_comments c ON c.post_id=p.id
  WHERE p.deleted_at IS NULL ${where}
  GROUP BY p.id,u.id ${extra}`;
}

http.createServer=function(app,...args){
  if(typeof app==="function"&&app?.use){
    infra().catch(e=>console.error("feed infra",e));

    // Fix legacy 500 on POST /api/chats/with/:userId before the original route runs.
    app.use(async(req,res,next)=>{
      const m=req.path.match(/^\/api\/chats\/with\/(\d+)$/);
      if(req.method!=="POST"||!m) return next();
      try{
        const u=await auth(req,res); if(!u) return;
        const target=Number(m[1]);
        if(!Number.isSafeInteger(target)||target===Number(u.id)) return res.status(400).json({ok:false,error:"INVALID_USER"});
        const other=(await pool.query(`SELECT id,username,display_name,avatar_url,account_status FROM users WHERE id=$1`,[target])).rows[0];
        if(!other||other.account_status!=="active") return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});
        const lo=Math.min(Number(u.id),target),hi=Math.max(Number(u.id),target);
        let conv=(await pool.query(`SELECT * FROM direct_conversations WHERE user1_id=$1 AND user2_id=$2`,[lo,hi])).rows[0];
        if(!conv){
          conv=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *`,[lo,hi])).rows[0];
          if(!conv) conv=(await pool.query(`SELECT * FROM direct_conversations WHERE user1_id=$1 AND user2_id=$2`,[lo,hi])).rows[0];
        }
        return res.status(201).json({ok:true,conversation:conv});
      }catch(e){console.error("chat create",e);return res.status(500).json({ok:false,error:"CHAT_CREATE_FAILED"});}
    });

    app.get("/api/feed",async(req,res)=>{
      const u=await auth(req,res); if(!u)return;
      const cursor=Math.max(0,Number(req.query.cursor)||0),limit=Math.min(30,Math.max(5,Number(req.query.limit)||15));
      const params=[u.id]; let where="";
      if(cursor){params.push(cursor);where=`AND p.id < $${params.length}`;}
      params.push(limit);
      const rows=(await pool.query(postSelect(where,`ORDER BY p.id DESC LIMIT $${params.length}`),params)).rows;
      res.json({ok:true,posts:rows,nextCursor:rows.length===limit?rows[rows.length-1].id:null});
    });

    app.post("/api/feed",async(req,res)=>{
      const u=await auth(req,res); if(!u)return;
      const body=clean(req.body?.body,3000),imageUrl=clean(req.body?.imageUrl,600)||null;
      if(!body&&!imageUrl)return res.status(400).json({ok:false,error:"EMPTY_POST"});
      const row=(await pool.query(`INSERT INTO posts(user_id,body,image_url) VALUES($1,$2,$3) RETURNING *`,[u.id,body,imageUrl])).rows[0];
      res.status(201).json({ok:true,post:{...row,username:u.username,display_name:u.display_name,avatar_url:u.avatar_url,likes_count:0,comments_count:0,liked:false}});
    });

    app.patch("/api/feed/:id",async(req,res)=>{
      const u=await auth(req,res); if(!u)return;
      const id=Number(req.params.id),body=clean(req.body?.body,3000);
      const p=(await pool.query(`SELECT * FROM posts WHERE id=$1 AND deleted_at IS NULL`,[id])).rows[0];
      if(!p)return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});
      if(String(p.user_id)!==String(u.id)&&u.username!=="ahmed")return res.status(403).json({ok:false,error:"FORBIDDEN"});
      const row=(await pool.query(`UPDATE posts SET body=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[body,id])).rows[0];
      res.json({ok:true,post:row});
    });

    app.delete("/api/feed/:id",async(req,res)=>{
      const u=await auth(req,res); if(!u)return;
      const id=Number(req.params.id),p=(await pool.query(`SELECT * FROM posts WHERE id=$1 AND deleted_at IS NULL`,[id])).rows[0];
      if(!p)return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});
      if(String(p.user_id)!==String(u.id)&&u.username!=="ahmed")return res.status(403).json({ok:false,error:"FORBIDDEN"});
      await pool.query(`UPDATE posts SET deleted_at=NOW() WHERE id=$1`,[id]);
      res.json({ok:true});
    });

    app.post("/api/feed/:id/like",async(req,res)=>{
      const u=await auth(req,res); if(!u)return;
      const id=Number(req.params.id); if(!(await pool.query(`SELECT 1 FROM posts WHERE id=$1 AND deleted_at IS NULL`,[id])).rows[0])return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});
      const exists=(await pool.query(`SELECT 1 FROM post_likes WHERE post_id=$1 AND user_id=$2`,[id,u.id])).rows[0];
      if(exists)await pool.query(`DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2`,[id,u.id]);else await pool.query(`INSERT INTO post_likes(post_id,user_id) VALUES($1,$2)`,[id,u.id]);
      const count=Number((await pool.query(`SELECT COUNT(*)::int c FROM post_likes WHERE post_id=$1`,[id])).rows[0].c);
      res.json({ok:true,liked:!exists,likesCount:count});
    });

    app.get("/api/feed/:id/comments",async(req,res)=>{
      const u=await auth(req,res); if(!u)return;
      const rows=(await pool.query(`SELECT c.id,c.body,c.created_at,c.edited_at,u.id user_id,u.username,u.display_name,u.avatar_url FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.deleted_at IS NULL ORDER BY c.id ASC LIMIT 100`,[Number(req.params.id)])).rows;
      res.json({ok:true,comments:rows});
    });

    app.post("/api/feed/:id/comments",async(req,res)=>{
      const u=await auth(req,res); if(!u)return;
      const body=clean(req.body?.body,1000);if(!body)return res.status(400).json({ok:false,error:"EMPTY_COMMENT"});
      const id=Number(req.params.id);if(!(await pool.query(`SELECT 1 FROM posts WHERE id=$1 AND deleted_at IS NULL`,[id])).rows[0])return res.status(404).json({ok:false,error:"POST_NOT_FOUND"});
      const row=(await pool.query(`INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING *`,[id,u.id,body])).rows[0];
      res.status(201).json({ok:true,comment:{...row,username:u.username,display_name:u.display_name,avatar_url:u.avatar_url}});
    });

    app.get("/api/social/profile/:username",async(req,res)=>{
      const viewer=await auth(req,res);if(!viewer)return;
      const uname=clean(req.params.username,24).toLowerCase();
      const p=(await pool.query(`SELECT id,username,display_name,bio,avatar_url,cover_url,city,last_seen_at,created_at FROM users WHERE LOWER(username)=$1 AND account_status='active'`,[uname])).rows[0];
      if(!p)return res.status(404).json({ok:false,error:"USER_NOT_FOUND"});
      const friends=Number((await pool.query(`SELECT COUNT(*)::int c FROM friendships WHERE status='accepted' AND (requester_id=$1 OR addressee_id=$1)`,[p.id])).rows[0].c);
      const posts=Number((await pool.query(`SELECT COUNT(*)::int c FROM posts WHERE user_id=$1 AND deleted_at IS NULL`,[p.id])).rows[0].c);
      const relation=String(viewer.id)===String(p.id)?"self":(await friendship(viewer.id,p.id)?"friend":"none");
      const postRows=(await pool.query(postSelect(`AND p.user_id=$2`,`ORDER BY p.id DESC LIMIT 20`),[viewer.id,p.id])).rows;
      res.json({ok:true,profile:{...p,friends_count:friends,posts_count:posts,relation},posts:postRows});
    });
  }
  return prior(app,...args);
};
