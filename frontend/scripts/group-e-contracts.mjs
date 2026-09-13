import fs from "fs/promises";
const admin=await fs.readFile("app/admin/AdminCenter.js","utf8");
const checks=[
  [admin.includes('/api/admin/control/overview'),"admin control overview endpoint"],
  [admin.includes('/api/admin/system'),"system health integration"],
  [admin.includes('openReports'),"open report metric"],
  [admin.includes('messagesHour'),"message activity metric"],
  [admin.includes('recent?.errors'),"recent errors panel"],
  [admin.includes('recent?.reports'),"recent reports panel"],
  [admin.includes('recent?.users'),"recent users panel"],
  [admin.includes('ADMIN CONTROL CENTER'),"admin control center identity"]
];
for(const[ok,label] of checks)if(!ok)throw new Error(`Group E contract missing: ${label}`);
console.log("Group E admin contracts ok");
