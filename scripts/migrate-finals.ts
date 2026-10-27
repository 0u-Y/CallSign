if (!["infrastructure", "integration"].includes(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION ?? "")) throw new Error("MIGRATION_EXECUTION_BLOCKED");
import postgres from "postgres";
import { readFile } from "node:fs/promises";
const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) throw new Error("MIGRATOR_DATABASE_URL_REQUIRED");
const sql = postgres(url, { max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS public.callsign_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  for (const name of ["0000_initial", "0001_finals_authority", "0002_session_scopes", "0003_service_runtime"]) {
    const raw = await readFile(new URL(`../services/api/drizzle/${name}.sql`, import.meta.url), "utf8");
    // The version record and DDL share a transaction, including crash recovery.
    const migration = raw.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(209498137)`;
      if ((await tx`SELECT id FROM public.callsign_migrations WHERE id = ${name}`).length) return;
      await tx.unsafe(migration); await tx`INSERT INTO public.callsign_migrations (id) VALUES (${name})`;
    });
    console.log(`Migration present: ${name}`);
  }
} finally { await sql.end({ timeout: 5 }); }
