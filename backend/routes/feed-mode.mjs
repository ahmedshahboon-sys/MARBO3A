import {pool,requireAuth} from "../runtime.mjs";

const MODES=new Set(["friends","latest","engaged","random"]);
const seedOf=v=>{const n=Number(v);return Number.isFinite(n)?Math.abs(Math.trunc(n))%2147483000:Math.floor(Math.random()*2147483000)};
async function friends(a,b){return Boolean((await pool.query(`SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) LIMIT 1`,[a,b])).rows[0])}
async function mutual(a,b){return Number((await pool.query(`WITH a1 AS(SELECT CASE WHEN requester_id=$1 THEN addressee_id ELSE requester_id END id FROM friendships WHERE status='accepted' AND(requester_id=$1 OR addressee_id=$1)),b1 AS(SELECT CASE WHEN requester_id=$2 THEN addressee_id ELSE requester_id END id FROM friendships WHERE status='accepted' AND(requester_id=$2 OR addressee_id=$2))SELECT COUNT(*)::int n FROM a1 JOIN b1 USING(id)`,[a,b])).rows[0]?.n||0)}
async function allowed(rule,viewer,target){if(String(viewer)===String(target)||rule==="everyone")return true;if(rule==="nobody")return false;if(await friends(viewer,target))return true;return rule==="friends_of_friends"&&(await mutual(viewer,target))>0}
async function relation(viewer,target){if(String(viewer)===String(target))return"self";const r=(await pool.query(`SELECT requester_id,status FROM friendships WHERE ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) ORDER BY id DESC LIMIT 1`,[viewer,target])).rows[0];if(!r)return"none";if(r.status==="accepted")return"friend";if(r.status==="pending")return String(r.requester_id)===String(viewer)?"outgoing":"incoming";return"none"}

async function modeFeed(viewerId,{mode,seed,offset,limit}){
  const take=Math.min(180,Math.max(limit*8,40));
  const friendsOnly=mode==="friends"?`AND (p.user_id=$1 OR EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester_id=$1 AND f.addressee_id=p.user_id) OR (f.addressee_id=$1 AND f.requester_id=p.user_id))))`:"";
  const order=mode==="random"
    ?`((hashtext(p.id::text||':'||$2::text)::bigint+2147483648)%2147483647) DESC,p.id DESC`
    :mode==="engaged"
      ?`((SELECT COUNT(*) FROM post_reactions r WHERE r.post_id=p.id)*3+(SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL)*4) DESC,p.created_at DESC,p.id DESC`
      :`p.created_at DESC,p.id DESC`;
  /* Keep $2 explicitly typed for every mode. PostgreSQL otherwise cannot infer the
     skipped seed parameter when latest/friends/engaged still use $3/$4. */
  const rows=(await pool.query(`SELECT p.id,p.body,p.image_url,p.location_label,p.created_at,p.updated_at,u.id user_id,u.username,u.display_name,u.gender,u.avatar_url,
    COALESCE(pp.who_can_see_posts,'everyone') privacy_rule,
    (SELECT COUNT(*)::int FROM post_reactions r WHERE r.post_id=p.id) likes_count,
    (SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) comments_count,
    EXISTS(SELECT 1 FROM post_reactions mr WHERE mr.post_id=p.id AND mr.user_id=$1) liked,
    (SELECT reaction FROM post_reactions mr WHERE mr.post_id=p.id AND mr.user_id=$1 LIMIT 1) my_reaction,
    COALESCE((SELECT jsonb_object_agg(q.reaction,q.n) FROM (SELECT reaction,COUNT(*)::int n FROM post_reactions r WHERE r.post_id=p.id GROUP BY reaction) q),'{}'::jsonb) reaction_summary,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('url',pm.url,'type',pm.media_type,'position',pm.position) ORDER BY pm.position,pm.id) FROM post_media pm WHERE pm.post_id=p.id),CASE WHEN p.image_url IS NOT NULL AND p.image_url<>'' THEN jsonb_build_array(jsonb_build_object('url',p.image_url,'type','image','position',0)) ELSE '[]'::jsonb END) media
  FROM posts p
  JOIN users u ON u.id=p.user_id
  LEFT JOIN profile_privacy pp ON pp.user_id=p.user_id
  WHERE p.deleted_at IS NULL
    AND u.account_status='active'
    AND ($2::bigint IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocked_id=$1 AND b.blocker_id=p.user_id))
    ${friendsOnly}
  ORDER BY ${order}
  OFFSET $3 LIMIT $4`,[viewerId,seed,offset,take])).rows;
  const selected=[];let consumed=0;
  for(let i=0;i<rows.length&&selected.length<limit;i++){
    const row=rows[i];consumed=i+1;
    if(await allowed(row.privacy_rule,viewerId,row.user_id)){
      delete row.privacy_rule;
      row.relation=await relation(viewerId,row.user_id);
      row.sponsored=false;
      selected.push(row);
    }
  }
  return{posts:selected,nextCursor:rows.length===take&&consumed?offset+consumed:null};
}
export function registerFeedMode(app){
  app.get("/api/feed-mode",async(req,res)=>{try{
    const u=await requireAuth(req,res);if(!u)return;
    const mode=MODES.has(String(req.query.mode))?String(req.query.mode):"latest";
    const seed=seedOf(req.query.seed),offset=Math.max(0,Number(req.query.cursor)||0),limit=Math.min(30,Math.max(5,Number(req.query.limit)||15));
    const result=await modeFeed(u.id,{mode,seed,offset,limit});
    res.json({ok:true,...result,seed,ranking:`mode-${mode}`});
  }catch(e){console.error("feed mode",e);res.status(500).json({ok:false,error:"FEED_LOAD_FAILED"})}});
}
