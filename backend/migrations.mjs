import fs from "fs/promises";
import path from "path";
import pg from "pg";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});
const dir=path.resolve("migrations");
const client=await pool.connect();
const NON_TRANSACTIONAL_MARKER="MARBO3A_MIGRATION_NO_TRANSACTION";
try{
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await client.query(`SELECT pg_advisory_lock(hashtext('marbo3a_schema_migrations'))`);
  const applied=new Set((await client.query(`SELECT name FROM schema_migrations`)).rows.map(x=>x.name));
  const files=(await fs.readdir(dir)).filter(x=>x.endsWith(".sql")).sort();
  for(const name of files){
    if(applied.has(name))continue;
    const sql=await fs.readFile(path.join(dir,name),"utf8");
    const nonTransactional=sql.includes(NON_TRANSACTIONAL_MARKER);
    console.log(`applying migration ${name}${nonTransactional?" (non-transactional)":""}`);
    if(nonTransactional){
      // CREATE INDEX CONCURRENTLY cannot execute in a transaction block, including
      // PostgreSQL's implicit transaction around a multi-statement query string.
      // Keep the advisory lock on the runner connection, but execute each SQL
      // statement separately on a fresh connection so every concurrent index is
      // its own top-level command.
      const migrationClient=await pool.connect();
      try{
        const statements=sql
          .split(";")
          .map(statement=>statement.trim())
          .filter(statement=>statement && !statement.split("\n").every(line=>line.trim().startsWith("--")));
        for(const statement of statements)await migrationClient.query(statement);
        await client.query(`INSERT INTO schema_migrations(name) VALUES($1)`,[name]);
      }finally{migrationClient.release()}
      continue;
    }
    await client.query("BEGIN");
    try{await client.query(sql);await client.query(`INSERT INTO schema_migrations(name) VALUES($1)`,[name]);await client.query("COMMIT")}
    catch(e){await client.query("ROLLBACK");throw e}
  }
  console.log("migrations ready");
}finally{try{await client.query(`SELECT pg_advisory_unlock(hashtext('marbo3a_schema_migrations'))`)}catch{}client.release();await pool.end()}
