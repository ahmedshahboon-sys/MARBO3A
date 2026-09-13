import {Server} from "socket.io";
import {pool,ensureRedis,sessionUser,isAdmin,setRealtimeServer,redis} from "./runtime.mjs";

export function attachRealtime(server){
  const io=new Server(server,{path:"/rt-v2/socket.io",cors:{origin:true,credentials:true}});
  setRealtimeServer(io);
  return io;
}
