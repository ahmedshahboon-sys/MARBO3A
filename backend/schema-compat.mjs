import http from "http";
import pg from "pg";

const previous=http.createServer.bind(http);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
let ready;

async function ensureCompat(){
  if(!ready) ready=(async()=>{
    /* Base tables are created by server boot. On a fresh install this guard can
       be retried by the first API request after boot; every statement is idempotent. */
    const exists=async name=>Boolean((await pool.query(`SELECT to_regclass($1) AS t`,[`public.${name}`])).rows[0]?.t);

    if(await exists("user_locations")){
      await pool.query(`ALTER TABLE user_locations ADD COLUMN IF NOT EXISTS share_precise BOOLEAN NOT NULL DEFAULT FALSE`);
      await pool.query(`ALTER TABLE user_locations ADD COLUMN IF NOT EXISTS share_map BOOLEAN NOT NULL DEFAULT FALSE`);
      /* Old map opt-in remains respected while newer exact-location opt-in is kept separate. */
      await pool.query(`UPDATE user_locations SET share_map=TRUE WHERE share_precise=TRUE AND share_map=FALSE`).catch(()=>{});
    }

    if(await exists("room_bans")){
      await pool.query(`ALTER TABLE room_bans ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id) ON DELETE SET NULL`);
      await pool.query(`ALTER TABLE room_bans ADD COLUMN IF NOT EXISTS banned_by BIGINT REFERENCES users(id) ON DELETE SET NULL`);
    }

    if(await exists("user_settings")){
      await pool.query(`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ar'`);
    }

    if(await exists("rooms")){
      await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pinned_message_id BIGINT`);
      await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url TEXT`);
      await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'open'`);
      await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS rules TEXT NOT NULL DEFAULT ''`);
      await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_members INT NOT NULL DEFAULT 500`);
    }

    if(await exists("direct_messages")){
      await pool.query(`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT`);
      await pool.query(`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
      await pool.query(`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
    }

    if(await exists("messages")){
      await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT`);
      await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
      await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
      await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    }
  })().catch(e=>{ready=null;throw e});
  return ready;
}

http.createServer=function schemaCompatCreateServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.use(async(_req,res,next)=>{
      try{await ensureCompat();next()}
      catch(e){
        console.error("schema compatibility",e.message);
        if(!res.headersSent)res.status(503).json({ok:false,error:"SCHEMA_NOT_READY"});
      }
    });
  }
  return previous(app,...args);
};
