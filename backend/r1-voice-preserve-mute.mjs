import http from "http";
import {pool,requireAuth,isAdmin,emitRoom} from "./runtime.mjs";

const prior=http.createServer.bind(http);
const DEFAULT_SEATS=Math.max(1,Math.min(16,Number(process.env.ROOM_VOICE_DEFAULT_SEATS)||8));
const MAX_PARTICIPANTS=Math.max(4,Math.min(100,Number(process.env.ROOM_VOICE_MAX_PARTICIPANTS)||24));
const ACTIVE_SECONDS=20;

async function access(roomId,u){
  const room=(await pool.query(`SELECT id,is_public,owner_id,name,join_policy,max_members,COALESCE(speaker_seat_count,$2)::int speaker_seat_count FROM rooms WHERE id=$1`,[roomId,DEFAULT_SEATS])).rows[0];
  if(!room)return{ok:false,error:"ROOM_NOT_FOUND"};
  if(!isAdmin(u)){
    const banned=(await pool.query(`SELECT 1 FROM room_bans WHERE room_id=$1 AND user_id=$2 LIMIT 1`,[roomId,u.id])).rows[0];
    if(banned)return{ok:false,error:"ROOM_BANNED"};
  }
  let member=(await pool.query(`SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0];
  if(!member&&!isAdmin(u)){
    if(!room.is_public||room.join_policy!=="open")return{ok:false,error:"JOIN_REQUIRED"};
    const members=Number((await pool.query(`SELECT COUNT(*)::int n FROM room_members WHERE room_id=$1`,[roomId])).rows[0]?.n||0);
    if(members>=Number(room.max_members||500))return{ok:false,error:"ROOM_FULL"};
    await pool.query(`INSERT INTO room_members(room_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING`,[roomId,u.id]);
    member={role:"member"};
  }
  return{ok:true,room};
}
const deny=(res,a)=>res.status(a.error==="ROOM_NOT_FOUND"?404:a.error==="ROOM_FULL"?409:403).json({ok:false,error:a.error});

http.createServer=function r1VoicePreserveMuteServer(app,...args){
  if(typeof app==="function"&&app?.use){
    app.post("/api/rooms/:id/voice/join",async(req,res)=>{try{
      const u=await requireAuth(req,res);if(!u)return;
      const roomId=Number(req.params.id),a=await access(roomId,u);if(!a.ok)return deny(res,a);
      await Promise.all([
        pool.query(`DELETE FROM room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]),
        pool.query(`DELETE FROM guest_room_voice_presence WHERE room_id=$1 AND last_seen<NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]).catch(()=>({}))
      ]);
      const exists=(await pool.query(`SELECT forced_muted FROM room_voice_presence WHERE room_id=$1 AND user_id=$2`,[roomId,u.id])).rows[0];
      if(!exists){
        const [users,guests]=await Promise.all([
          pool.query(`SELECT COUNT(*)::int n FROM room_voice_presence WHERE room_id=$1 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]),
          pool.query(`SELECT COUNT(*)::int n FROM guest_room_voice_presence WHERE room_id=$1 AND last_seen>NOW()-INTERVAL '${ACTIVE_SECONDS} seconds'`,[roomId]).catch(()=>({rows:[{n:0}]}))
        ]);
        if(Number(users.rows[0]?.n||0)+Number(guests.rows[0]?.n||0)>=MAX_PARTICIPANTS)return res.status(409).json({ok:false,error:"VOICE_ROOM_FULL",maxParticipants:MAX_PARTICIPANTS});
      }
      const row=(await pool.query(`INSERT INTO room_voice_presence(room_id,user_id,role,seat_index,requested,muted,forced_muted,last_seen) VALUES($1,$2,'listener',NULL,FALSE,FALSE,FALSE,NOW()) ON CONFLICT(room_id,user_id) DO UPDATE SET role='listener',seat_index=NULL,requested=FALSE,muted=room_voice_presence.forced_muted,forced_muted=room_voice_presence.forced_muted,last_seen=NOW() RETURNING forced_muted,muted`,[roomId,u.id])).rows[0];
      emitRoom(roomId,"roomvoice:state",{roomId,reason:"join-reset",userId:u.id});
      res.json({ok:true,seatCount:Number(a.room.speaker_seat_count||DEFAULT_SEATS),maxParticipants:MAX_PARTICIPANTS,forcedMuted:Boolean(row?.forced_muted),muted:Boolean(row?.muted)});
    }catch(e){console.error("R1 voice safe join",e);res.status(500).json({ok:false,error:"VOICE_JOIN_FAILED"})}});
  }
  return prior(app,...args);
};
