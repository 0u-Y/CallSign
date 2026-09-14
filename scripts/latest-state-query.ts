import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@127.0.0.1:55432/institutionproof", { max: 1 });
const rows = await sql<{ institution_id: string; delegation_id: string }[]>`select institution_id, delegation_id from authorizations order by created_at desc limit 1`;
await sql.end();
if (!rows[0]) throw new Error("NO_AUTHORIZATION_FOR_STATE_TEST");
console.log(`institutionId=${encodeURIComponent(rows[0].institution_id)}&delegationId=${encodeURIComponent(rows[0].delegation_id)}`);
