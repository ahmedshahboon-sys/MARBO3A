import pg from "pg";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,statement_timeout:30000});
const threshold=Math.max(250,Number(process.env.GROUP12_QUERY_BUDGET_MS)||1500);

async function explain(name,sql,params=[]){
  const r=await pool.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+sql,params);
  const root=r.rows[0]?.["QUERY PLAN"]?.[0];
  const ms=Number(root?.["Execution Time"]||0);
  if(!Number.isFinite(ms)||ms>threshold)throw new Error(name+" exceeded query budget: "+ms+"ms > "+threshold+"ms");
  console.log("group12 query",name,Math.round(ms*100)/100+"ms");
}
async function seed(){
  await pool.query("DELETE FROM users WHERE username LIKE 'g12_perf_%'");
  const users=(await pool.query(`INSERT INTO users(email,username,display_name,gender,password_hash,account_status,role,created_at)
    SELECT 'g12_perf_'||g||'@example.invalid','g12_perf_'||g,'Group12 Perf '||g,CASE WHEN g%2=0 THEN 'male' ELSE 'female' END,'scrypt:00:00','active','user',NOW()-(g||' minutes')::interval
    FROM generate_series(1,160) g RETURNING id`)).rows.sort((a,b)=>Number(a.id)-Number(b.id));
  const viewer=users[0].id,ids=users.map(x=>Number(x.id));
  await pool.query(`INSERT INTO friendships(requester_id,addressee_id,status,created_at,updated_at)
    SELECT $1,x,'accepted',NOW(),NOW() FROM unnest($2::bigint[]) x ON CONFLICT DO NOTHING`,[viewer,ids.slice(1,81)]);
  await pool.query(`INSERT INTO friendships(requester_id,addressee_id,status,created_at,updated_at)
    SELECT x,$1,'pending',NOW(),NOW() FROM unnest($2::bigint[]) x ON CONFLICT DO NOTHING`,[viewer,ids.slice(81,101)]);
  await pool.query(`INSERT INTO profile_privacy(user_id,who_can_message,who_can_add,show_last_seen,show_city,who_can_see_posts)
    SELECT x,'friends','everyone',TRUE,TRUE,CASE WHEN x%3=0 THEN 'friends' ELSE 'everyone' END FROM unnest($1::bigint[]) x
    ON CONFLICT(user_id) DO NOTHING`,[ids]);
  await pool.query(`INSERT INTO user_locations(user_id,city,latitude,longitude,share_precise,updated_at)
    SELECT x,'Tripoli',32.88+(x%10)*0.001,13.19+(x%10)*0.001,FALSE,NOW() FROM unnest($1::bigint[]) x
    ON CONFLICT(user_id) DO UPDATE SET city=EXCLUDED.city,updated_at=NOW()`,[ids]);
  await pool.query(`INSERT INTO posts(user_id,body,created_at)
    SELECT x,'group12 performance post '||g,NOW()-(g||' minutes')::interval FROM unnest($1::bigint[]) x CROSS JOIN generate_series(1,4) g`,[ids]);
  const posts=(await pool.query("SELECT id,user_id FROM posts WHERE body LIKE 'group12 performance post %' ORDER BY id")).rows;
  await pool.query(`INSERT INTO post_comments(post_id,user_id,body,created_at)
    SELECT p.id,$1,'group12 comment '||g,NOW() FROM unnest($2::bigint[]) p(id) CROSS JOIN generate_series(1,2) g`,[viewer,posts.slice(0,500).map(x=>Number(x.id))]);
  await pool.query(`INSERT INTO notifications(user_id,type,title,body,created_at)
    SELECT $1,'system','Group12 notification','fixture',NOW()-(g||' seconds')::interval FROM generate_series(1,700) g`,[viewer]);
  for(const peer of ids.slice(1,61)){
    const row=(await pool.query(`INSERT INTO direct_conversations(user1_id,user2_id,updated_at) VALUES($1,$2,NOW())
      ON CONFLICT DO NOTHING RETURNING id`,[Math.min(viewer,peer),Math.max(viewer,peer)])).rows[0]||
      (await pool.query(`SELECT id FROM direct_conversations WHERE LEAST(user1_id,user2_id)=$1 AND GREATEST(user1_id,user2_id)=$2`,[Math.min(viewer,peer),Math.max(viewer,peer)])).rows[0];
    await pool.query(`INSERT INTO direct_messages(conversation_id,sender_id,body,created_at)
      SELECT $1::bigint,CASE WHEN g%2=0 THEN $2::bigint ELSE $3::bigint END,'group12 dm '||g,NOW()-(g||' seconds')::interval FROM generate_series(1,12) g`,[row.id,viewer,peer]);
  }
  const room=(await pool.query(`INSERT INTO rooms(name,slug,description,is_public,owner_id,join_policy,max_members)
    VALUES('Group12 Performance Room','g12-performance-room-'||$1,'fixture',TRUE,$2,'open',500) RETURNING id`,[Date.now(),viewer])).rows[0];
  await pool.query(`INSERT INTO room_members(room_id,user_id,role) SELECT $1,x,'member' FROM unnest($2::bigint[]) x ON CONFLICT DO NOTHING`,[room.id,ids.slice(0,100)]);
  await pool.query(`INSERT INTO reports(reporter_id,target_type,target_id,reason,details,status,created_at)
    SELECT $1,'user',$2,'group12','fixture',CASE WHEN g%2=0 THEN 'open' ELSE 'reviewed' END,NOW()-(g||' minutes')::interval FROM generate_series(1,120) g`,[viewer,ids[1]]);
  await pool.query("ANALYZE");
  return{viewer,roomId:room.id,peer:ids[1],samplePost:posts[0]?.id};
}
async function cleanup(){
  await pool.query("DELETE FROM users WHERE username LIKE 'g12_perf_%'").catch(()=>{});
  await pool.query("DELETE FROM rooms WHERE name='Group12 Performance Room'").catch(()=>{});
}
try{
  const f=await seed();
  await explain("feed",`SELECT p.id,p.created_at,u.username,(SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) comments_count FROM posts p JOIN users u ON u.id=p.user_id WHERE p.deleted_at IS NULL AND u.account_status='active' ORDER BY p.created_at DESC,p.id DESC LIMIT 30`);
  await explain("comments",`SELECT c.id,c.user_id,c.body FROM post_comments c WHERE c.post_id=$1 AND c.deleted_at IS NULL ORDER BY c.id DESC LIMIT 100`,[f.samplePost]);
  await explain("chats",`SELECT c.id,c.updated_at,(SELECT dm.created_at FROM direct_messages dm WHERE dm.conversation_id=c.id ORDER BY dm.id DESC LIMIT 1) last_at FROM direct_conversations c WHERE c.user1_id=$1 OR c.user2_id=$1 ORDER BY COALESCE((SELECT dm.created_at FROM direct_messages dm WHERE dm.conversation_id=c.id ORDER BY dm.id DESC LIMIT 1),c.updated_at) DESC LIMIT 100`,[f.viewer]);
  await explain("unread-count",`SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL AND suppressed=FALSE`,[f.viewer]);
  await explain("friend-suggestions",`WITH my_friends AS(SELECT CASE WHEN requester_id=$1 THEN addressee_id ELSE requester_id END id FROM friendships WHERE status='accepted' AND(requester_id=$1 OR addressee_id=$1)) SELECT x.id,COUNT(mf.id)::int mutual_count FROM users x LEFT JOIN friendships xf ON xf.status='accepted' AND(xf.requester_id=x.id OR xf.addressee_id=x.id) LEFT JOIN my_friends mf ON mf.id=CASE WHEN xf.requester_id=x.id THEN xf.addressee_id ELSE xf.requester_id END WHERE x.id<>$1 AND x.account_status='active' GROUP BY x.id ORDER BY mutual_count DESC,x.id DESC LIMIT 30`,[f.viewer]);
  await explain("search",`SELECT id,username,display_name FROM users WHERE account_status='active' AND (username ILIKE $1 OR display_name ILIKE $1) ORDER BY id DESC LIMIT 30`,["%g12_perf%"]);
  await explain("admin-analytics",`SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM reports WHERE status='open') open_reports,(SELECT COUNT(*) FROM notifications WHERE created_at>=NOW()-INTERVAL '24 hours') notifications_24h`);
  await explain("notifications",`SELECT id,type,title,created_at FROM notifications WHERE user_id=$1 AND suppressed=FALSE ORDER BY id DESC LIMIT 100`,[f.viewer]);
  await explain("map",`SELECT u.id,l.city FROM users u JOIN user_locations l ON l.user_id=u.id WHERE u.account_status='active' AND l.city<>'' ORDER BY u.id DESC LIMIT 500`);
  await explain("room-presence",`SELECT p.user_id,p.role,p.last_seen FROM room_voice_presence p WHERE p.room_id=$1 AND p.last_seen>NOW()-INTERVAL '90 seconds' ORDER BY p.last_seen DESC LIMIT 100`,[f.roomId]);
  console.log("Group 12 EXPLAIN ANALYZE matrix OK");
}finally{
  await cleanup();
  await pool.end();
}
