import {randomUUID} from "node:crypto";
import {pool,requireAuth} from "../runtime.mjs";

function isAdmin(u){return u?.role==='admin'}
const tickets=new Map();
function pruneTickets(){const now=Date.now();for(const[k,v]of tickets){if(v.expires<=now)tickets.delete(k)}while(tickets.size>12000){tickets.delete(tickets.keys().next().value)}}
function ticketFor(target,ttl=4*60*60*1000){pruneTickets();const id=randomUUID().replaceAll('-','');tickets.set(id,{target,expires:Date.now()+ttl});return id}
function takeTicket(id){pruneTickets();const row=tickets.get(String(id||''));return row&&row.expires>Date.now()?row:null}
function safeHttp(value){try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)?u:null}catch{return null}}
function parseM3u(text=''){
  const lines=String(text).replace(/\r/g,'').split('\n'),out=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line.startsWith('#EXTINF:'))continue;
    let next='';for(let j=i+1;j<Math.min(lines.length,i+5);j++){const c=lines[j].trim();if(c&&!c.startsWith('#')){next=c;break}}
    if(!safeHttp(next))continue;
    const name=(line.split(',').slice(1).join(',').trim()||'قناة');
    const logo=(line.match(/tvg-logo="([^"]*)"/i)||[])[1]||'';
    const group=(line.match(/group-title="([^"]*)"/i)||[])[1]||'أخرى';
    out.push({name,logo_url:logo,group_title:group,stream_url:next});
  }
  return out;
}
async function replaceChannels(rows){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('DELETE FROM tv_channels');
    let order=0;
    for(const c of rows.slice(0,10000))await client.query(`INSERT INTO tv_channels(name,logo_url,group_title,stream_url,sort_order) VALUES($1,$2,$3,$4,$5)`,[c.name,c.logo_url||null,c.group_title||'أخرى',c.stream_url,order++]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
function rewritePlaylist(text,sourceUrl){
  return String(text).replace(/\r/g,'').split('\n').map(line=>{const value=line.trim();if(!value||value.startsWith('#'))return line;try{const target=new URL(value,sourceUrl).toString();if(!safeHttp(target))return line;return `/api/tv/proxy?t=${encodeURIComponent(ticketFor(target))}`}catch{return line}}).join('\n');
}
async function proxyTarget(target,res){
  const url=safeHttp(target);if(!url)return res.status(400).end();
  let upstream;try{upstream=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(20000),headers:{'user-agent':'MARBO3A-TV/1.0'}})}catch{return res.status(502).end()}
  if(!upstream.ok)return res.status(upstream.status).end();
  const type=String(upstream.headers.get('content-type')||'').toLowerCase(),finalUrl=upstream.url||url.toString();
  if(type.includes('mpegurl')||/\.m3u8?(\?|$)/i.test(finalUrl)){
    const text=await upstream.text();res.setHeader('content-type','application/vnd.apple.mpegurl; charset=utf-8');res.setHeader('cache-control','private, no-store');return res.send(rewritePlaylist(text,finalUrl));
  }
  const len=upstream.headers.get('content-length'),range=upstream.headers.get('content-range'),acceptRanges=upstream.headers.get('accept-ranges');if(type)res.setHeader('content-type',type);if(len)res.setHeader('content-length',len);if(range)res.setHeader('content-range',range);if(acceptRanges)res.setHeader('accept-ranges',acceptRanges);res.setHeader('cache-control','private, no-store');
  const buf=Buffer.from(await upstream.arrayBuffer());return res.status(upstream.status).send(buf);
}
export function registerTv(app){
  app.get('/api/tv/channels',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;const rows=(await pool.query(`SELECT id,name,logo_url,group_title,stream_url FROM tv_channels WHERE enabled=TRUE ORDER BY sort_order,id`)).rows;res.json({ok:true,channels:rows.map(({stream_url,...c})=>({...c,play_url:`/api/tv/stream/${c.id}?t=${ticketFor(stream_url)}`}))})});
  app.get('/api/tv/stream/:id',async(req,res)=>{const row=takeTicket(req.query.t);if(!row)return res.status(401).json({ok:false,error:'STREAM_TICKET_EXPIRED'});return proxyTarget(row.target,res)});
  app.get('/api/tv/proxy',async(req,res)=>{const row=takeTicket(req.query.t);if(!row)return res.status(401).end();return proxyTarget(row.target,res)});
  app.get('/api/admin/tv/source',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});const s=(await pool.query(`SELECT id,kind,base_url,username,m3u_url,enabled,updated_at FROM tv_sources ORDER BY id DESC LIMIT 1`)).rows[0]||null;const count=(await pool.query(`SELECT COUNT(*)::int c FROM tv_channels`)).rows[0].c;res.json({ok:true,source:s,channels:count})});
  app.put('/api/admin/tv/source',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});const kind=['m3u','xtream'].includes(req.body?.kind)?req.body.kind:'m3u';const base=String(req.body?.baseUrl||'').trim(),username=String(req.body?.username||'').trim(),password=String(req.body?.password||'').trim(),m3u=String(req.body?.m3uUrl||'').trim();if(base&&!safeHttp(base))return res.status(400).json({ok:false,error:'INVALID_SOURCE_URL'});if(m3u&&!safeHttp(m3u))return res.status(400).json({ok:false,error:'INVALID_SOURCE_URL'});const current=(await pool.query(`SELECT * FROM tv_sources ORDER BY id DESC LIMIT 1`)).rows[0];if(current){await pool.query(`UPDATE tv_sources SET kind=$1,base_url=$2,username=$3,password=CASE WHEN $4='' THEN password ELSE $4 END,m3u_url=$5,updated_at=NOW() WHERE id=$6`,[kind,base||null,username||null,password,m3u||null,current.id])}else{await pool.query(`INSERT INTO tv_sources(kind,base_url,username,password,m3u_url) VALUES($1,$2,$3,$4,$5)`,[kind,base||null,username||null,password||null,m3u||null])}res.json({ok:true})});
  app.post('/api/admin/tv/import-m3u',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});const rows=parseM3u(req.body?.content||'');if(!rows.length)return res.status(400).json({ok:false,error:'NO_CHANNELS'});await replaceChannels(rows);res.json({ok:true,count:rows.length})});
  app.post('/api/admin/tv/refresh',async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;if(!isAdmin(u))return res.status(403).json({ok:false,error:'FORBIDDEN'});const s=(await pool.query(`SELECT * FROM tv_sources ORDER BY id DESC LIMIT 1`)).rows[0];if(!s)return res.status(400).json({ok:false,error:'SOURCE_NOT_CONFIGURED'});let rows=[];
    if(s.kind==='m3u'){
      if(!s.m3u_url)return res.status(400).json({ok:false,error:'M3U_URL_REQUIRED'});const source=safeHttp(s.m3u_url);if(!source)return res.status(400).json({ok:false,error:'INVALID_SOURCE_URL'});
      const r=await fetch(source,{signal:AbortSignal.timeout(15000),headers:{'user-agent':'MARBO3A-TV/1.0'}});if(!r.ok)return res.status(502).json({ok:false,error:'SOURCE_FETCH_FAILED'});rows=parseM3u(await r.text());
    }else{
      if(!s.base_url||!s.username||!s.password)return res.status(400).json({ok:false,error:'XTREAM_CONFIG_REQUIRED'});const base=s.base_url.replace(/\/$/,'');if(!safeHttp(base))return res.status(400).json({ok:false,error:'INVALID_SOURCE_URL'});const url=`${base}/player_api.php?username=${encodeURIComponent(s.username)}&password=${encodeURIComponent(s.password)}&action=get_live_streams`;const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'user-agent':'MARBO3A-TV/1.0'}});if(!r.ok)return res.status(502).json({ok:false,error:'SOURCE_FETCH_FAILED'});const data=await r.json();rows=(Array.isArray(data)?data:[]).map((x,i)=>({name:x.name||`قناة ${i+1}`,logo_url:x.stream_icon||'',group_title:String(x.category_name||x.category_id||'أخرى'),stream_url:`${base}/live/${encodeURIComponent(s.username)}/${encodeURIComponent(s.password)}/${x.stream_id}.m3u8`}));
    }
    if(!rows.length)return res.status(400).json({ok:false,error:'NO_CHANNELS'});await replaceChannels(rows);res.json({ok:true,count:rows.length});
  });
}
