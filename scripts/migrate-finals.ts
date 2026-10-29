
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'dry-run',migrations:['0000_initial','0001_finals_authority','0002_session_scopes','0003_service_runtime','0004_worker_recovery','0005_account_management'],next:'--apply requires infrastructure/integration authorization and explicit owner MIGRATOR_DATABASE_URL. Existing migration hashes must match; unknown historical hashes require review.'}));process.exit(0);}
if (!["infrastructure", "integration"].includes(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION ?? "")) throw new Error("MIGRATION_EXECUTION_BLOCKED");
const url = process.env.MIGRATOR_DATABASE_URL;
if (!url) throw new Error("MIGRATOR_DATABASE_URL_REQUIRED");
const sql = postgres(url, { max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS public.callsign_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE public.callsign_migrations ADD COLUMN IF NOT EXISTS source_hash text`;
  for (const name of ["0000_initial", "0001_finals_authority", "0002_session_scopes", "0003_service_runtime", "0004_worker_recovery", "0005_account_management"]) {
    const raw = await readFile(new URL(`../services/api/drizzle/${name}.sql`, import.meta.url), "utf8");
    // The version record and DDL share a transaction, including crash recovery.
    const sourceHash=createHash("sha256").update(raw).digest("hex");
    const migration = raw.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(209498137)`;
      const applied=await tx`SELECT id,source_hash FROM public.callsign_migrations WHERE id = ${name}`;
      if(applied.length){if(applied[0]!.source_hash!==sourceHash)throw new Error(`MIGRATION_SOURCE_IDENTITY_REVIEW_REQUIRED:${name}`);return;}
      await tx.unsafe(migration); await tx`INSERT INTO public.callsign_migrations (id,source_hash) VALUES (${name},${sourceHash})`;
    });
    console.log(`Migration present: ${name}`);
  }
} finally { await sql.end({ timeout: 5 }); }
