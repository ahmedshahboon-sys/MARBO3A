import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const must=(src,needle,label)=>{if(!src.includes(needle))throw new Error(label+": missing "+needle)};

const backup=read("ops/backup-database.sh"),restore=read("ops/verify-backup-restore.sh"),latest=read("ops/verify-latest-backup.sh"),deploy=read("ops/deploy-production.sh"),env=read(".env.example"),doc=read("docs/operations-recovery.md");
must(backup,"BACKUP_REQUIRE_OFFSITE","backup");
must(backup,"sha256sum -c","backup offsite verification");
must(restore,"sha256sum -c","restore checksum");
must(latest,"verify-backup-restore.sh","latest restore helper");
must(env,"BACKUP_REQUIRE_OFFSITE=true","env");
must(env,"PG_STATEMENT_TIMEOUT_MS","env");
must(doc,"RPO target","recovery doc");
must(doc,"RTO target","recovery doc");
must(deploy,'git reset --hard "$PREVIOUS"',"immutable rollback");
must(deploy,'test "$FINAL_HEAD" = "$REQUESTED_RELEASE_SHA"',"immutable release");

for(const p of [
 "ops/systemd/marbo3a-backup.service",
 "ops/systemd/marbo3a-backup.timer",
 "ops/systemd/marbo3a-restore-drill.service",
 "ops/systemd/marbo3a-restore-drill.timer"
])if(!fs.existsSync(p))throw new Error("missing systemd recovery asset "+p);

console.log("Group 12 recovery contracts OK");
