import {pool,requireAuth} from "../runtime.mjs";

let ready=false;
async function ensureTv(){
  if(ready)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS tv_sources(
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'm3u',
    base_url TEXT,
    username TEXT,
    password TEXT,
    m3u_url TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tv_channels(
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    logo_url TEXT,
    group_title TEXT,
    stream_url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  ready=true;
}
function isAdmin(u){return u?.role==='admin'}
function parseM3u(text=''){
  const lines=String(text).replace(/\r/g,'').split('\n'),out=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line.startsWith('#EXTINF:'))continue;
    const next=(lines[i+1]||'').trim();if(!next||next.startsWith('#'))continue;
    const name=(line.split(',').slice(1).join(',').trim()||'قناة');
    const logo=(line.match(/tvg-logo="([^"]*)"/i)||[])[1]||'';
    const group=(line.match(/group-title="([^"]*)"/i)||[])[1]||'أخرى';
    out.push({name,logo_url:logo,group_title:group,stream_url:next});
  }
  return out;
}
async function replaceChannels(rows){
  await pool.query('BEGIN');
  try{
    await pool.query('DELETE FROM tv_channels');
    let order=0;
    for(const c of rows.slice(0,10000)){
      await pool.query(`INSERT INTO tv_channels(name,logo_url,group_title,stream_url,sort_order) VALUES($1,$2,$3,$4,$5)`,[c.name,c.logo_url||null,c.group_title||'أخرى',c.stream_url,order++]);
    }
    await pool.query('COMMIT');
  }catch(e){await pool.query('ROLLBACK');throw e}
}
export function registerTv(app){
  app.get('/api/tv/channels',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;await ensureTv();const rows=(await pool.query(`SELECT id,name,logo_url,group_title,stream_url FROM tv_channels WHERE enabled=TRUE ORDER BY sort_order,id`)).rows;res.json({ok:true,channels:rows})});
  app.get('/api/admin/tv/source',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});await ensureTv();const s=(await pool.query(`SELECT id,kind,base_url,username,m3u_url,enabled,updated_at FROM tv_sources ORDER BY id DESC LIMIT 1`)).rows[0]||null;const count=(await pool.query(`SELECT COUNT(*)::int c FROM tv_channels`)).rows[0].c;res.json({ok:true,source:s,channels:count})});
  app.put('/api/admin/tv/source',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});await ensureTv();const kind=['m3u','xtream'].includes(req.body?.kind)?req.body.kind:'m3u';const base=String(req.body?.baseUrl||'').trim(),username=String(req.body?.username||'').trim(),password=String(req.body?.password||'').trim(),m3u=String(req.body?.m3uUrl||'').trim();const current=(await pool.query(`SELECT * FROM tv_sources ORDER BY id DESC LIMIT 1`)).rows[0];if(current){await pool.query(`UPDATE tv_sources SET kind=$1,base_url=$2,username=$3,password=CASE WHEN $4='' THEN password ELSE $4 END,m3u_url=$5,updated_at=NOW() WHERE id=$6`,[kind,base||null,username||null,password,m3u||null,current.id])}else{await pool.query(`INSERT INTO tv_sources(kind,base_url,username,password,m3u_url) VALUES($1,$2,$3,$4,$5)`,[kind,base||null,username||null,password||null,m3u||null])}res.json({ok:true})});
  app.post('/api/admin/tv/import-m3u',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});await ensureTv();const rows=parseM3u(req.body?.content||'');if(!rows.length)return res.status(400).json({ok:false,error:'NO_CHANNELS'});await replaceChannels(rows);res.json({ok:true,count:rows.length})});
  app.post('/api/admin/tv/refresh',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});await ensureTv();const s=(await pool.query(`SELECT * FROM tv_sources ORDER BY id DESC LIMIT 1`)).rows[0];if(!s)return res.status(400).json({ok:false,error:'SOURCE_NOT_CONFIGURED'});let rows=[];
    if(s.kind==='m3u'){
      if(!s.m3u_url)return res.status(400).json({ok:false,error:'M3U_URL_REQUIRED'});
      const r=await fetch(s.m3u_url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('SOURCE_FETCH_FAILED');rows=parseM3u(await r.text());
    }else{
      if(!s.base_url||!s.username||!s.password)return res.status(400).json({ok:false,error:'XTREAM_CONFIG_REQUIRED'});
      const base=s.base_url.replace(/\/$/,'');const url=`${base}/player_api.php?username=${encodeURIComponent(s.username)}&password=${encodeURIComponent(s.password)}&action=get_live_streams`;const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('SOURCE_FETCH_FAILED');const data=await r.json();rows=(Array.isArray(data)?data:[]).map((x,i)=>({name:x.name||`قناة ${i+1}`,logo_url:x.stream_icon||'',group_title:String(x.category_name||x.category_id||'أخرى'),stream_url:`${base}/live/${encodeURIComponent(s.username)}/${encodeURIComponent(s.password)}/${x.stream_id}.m3u8`}));
    }
    if(!rows.length)return res.status(400).json({ok:false,error:'NO_CHANNELS'});await replaceChannels(rows);res.json({ok:true,count:rows.length});
  });
}
