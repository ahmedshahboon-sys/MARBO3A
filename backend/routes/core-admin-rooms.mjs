import {pool,requireAdmin,clean,ipOf} from "../runtime.mjs";

async function audit(adminId,action,req,details={}){await pool.query(`INSERT INTO audit_logs(user_id,level,category,action,ip_address,details) VALUES($1,'INFO','ADMIN',$2,$3,$4::jsonb)`,[adminId,clean(action,200),ipOf(req),JSON.stringify(details||{})]).catch(()=>{})}

export function registerCoreAdminRooms(app){
  app.delete("/api/admin/rooms/:id",async(req,res)=>{const a=await requireAdmin(req,res);if(!a)return;const id=Number(req.params.id),room=(await pool.query(`SELECT id,name FROM rooms WHERE id=$1`,[id])).rows[0];if(!room)return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});await pool.query(`DELETE FROM rooms WHERE id=$1`,[id]);await audit(a.id,`delete_room:${room.name}`,req,{roomId:id});res.json({ok:true})});
  app.get("/api/admin/rooms",async(req,res)=>{const a=await requireAdmin(req,res);if(!a)return;const rows=(await pool.query(`SELECT r.id,r.name,r.description,r.created_at,u.username owner_username,(SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id=r.id) members_count FROM rooms r LEFT JOIN users u ON u.id=r.owner_id ORDER BY r.id DESC`)).rows;res.json({ok:true,rooms:rows})});
}
