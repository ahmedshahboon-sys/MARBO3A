import http from "http";
import {pool,requireAuth,isAdmin,clean,redis,ensureRedis,emitChat,emitRoom} from "./runtime.mjs";
const prior=http.createServer.bind(http);
async function auth(req,res){return requireAuth(req,res)}
const admin=u=>isAdmin(u);async function inChat(id,u){return Boolean((await pool.query(`SELECT 1 FROM direct_conversations WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,[id,u.id])).rows[0])}async function inRoom(id,u){return Boolean((await pool.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2`,[id,u.id])).rows[0])}
async function pendingIncoming(id,u){const c=(await pool.query(`SELECT user1_id,user2_id FROM direct_conversations WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,[id,u.id])).rows[0];if(!c)return false;const peer=String(c.user1_id)===String(u.id)?c.user2_id:c.user1_id,r=(await pool.query(`SELECT recipient_id FROM message_requests WHERE ((requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)) AND status='pending' ORDER BY id DESC LIMIT 1`,[u.id,peer])).rows[0];return Boolean(r&&String(r.recipient_id)===String(u.id))}
async function canPublishRead(u){return (await pool.query(`SELECT COALESCE(read_receipts,TRUE) enabled FROM profile_privacy WHERE user_id=$1`,[u.id])).rows[0]?.enabled!==false}
const reactionSql=kind=>`COALESCE((SELECT jsonb_agg(jsonb_build_object('emoji',r.emoji,'count',r.count,'mine',r.mine) ORDER BY r.count DESC) FROM (SELECT mr.emoji,COUNT(*)::int count,BOOL_OR(mr.user_id=$2) mine FROM message_reactions mr WHERE mr.kind='${kind}' AND mr.message_id=${kind==="direct"?"dm":"m"}.id GROUP BY mr.emoji) r),'[]'::jsonb) reactions`;
http.createServer=function messageMediaCreateServer(app,...args){if(typeof app==="function"&&app?.use){
 }return prior(app,...args)};
