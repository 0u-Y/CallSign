import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof";
const sql = postgres(databaseUrl, { max: 1 });
const migration = await readFile(new URL("../services/api/drizzle/0000_initial.sql", import.meta.url), "utf8");
await sql.unsafe(migration);
await sql.end();
console.log("Applied services/api/drizzle/0000_initial.sql");
