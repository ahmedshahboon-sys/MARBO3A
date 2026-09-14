import {pool,requireAuth} from "../runtime.mjs";

const VIEWER_TTL_SECONDS=24;
async function sessionFor(id){return(await pool.query(`SELECT id,host_id,status FROM live_sessions WHERE id=$1`,[id])).rows[0]||null}
async function isParticipant(session,userId){if(!session||session.status!=="active")return false;if(Number(session.host_id)===Number(userId))return true;return (await pool.query(`SELECT 1 FROM live_viewers WHERE session_id=$1 AND user_id=$2 AND last_seen_at>=NOW()-($3::text||' seconds')::interval`,[session.id,userId,String(VIEWER_TTL_SECONDS)])).rowCount>0}
export function registerLiveSocial(app){
  app.get('/api/live/:id/audience',async(req,res)=>{
    const u=await requireAuth(req,res);if(!u)return;
    const id=Number(req.params.id);if(!Number.isInteger(id))return res.status(400).json({ok:false,error:'LIVE_NOT_FOUND'});
    const session=await sessionFor(id);if(!session)return res.status(404).json({ok:false,error:'LIVE_NOT_FOUND'});
    if(!(await isParticipant(session,u.id)))return res.status(403).json({ok:false,error:'FORBIDDEN'});
    await pool.query(`DELETE FROM live_viewers WHERE session_id=$1 AND last_seen_at<NOW()-($2::text||' seconds')::interval`,[id,String(VIEWER_TTL_SECONDS)]);
    const viewers=(await pool.query(`SELECT v.user_id,u.username,u.display_name,u.avatar_url,u.gender,v.joined_at FROM live_viewers v JOIN users u ON u.id=v.user_id WHERE v.session_id=$1 ORDER BY v.joined_at ASC`,[id])).rows;
    res.json({ok:true,viewers,count:viewers.length});
  });
}
