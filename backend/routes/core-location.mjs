import {pool,requireAuth,clean} from "../runtime.mjs";

export function registerCoreLocation(app){
  app.get("/api/map/cities",async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;const rows=(await pool.query(`SELECT city,COUNT(*)::int users FROM user_locations WHERE city<>'' GROUP BY city ORDER BY users DESC`)).rows;res.json({ok:true,cities:rows})});
  app.put("/api/location",async(req,res)=>{const u=await requireAuth(req,res);if(!u)return;const city=clean(req.body?.city,80),lat=Number(req.body?.latitude),lng=Number(req.body?.longitude),share=Boolean(req.body?.sharePrecise);await pool.query(`INSERT INTO user_locations(user_id,city,latitude,longitude,share_precise,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(user_id) DO UPDATE SET city=EXCLUDED.city,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,share_precise=EXCLUDED.share_precise,updated_at=NOW()`,[u.id,city,Number.isFinite(lat)?lat:null,Number.isFinite(lng)?lng:null,share]);res.json({ok:true})});
}
