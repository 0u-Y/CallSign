if (!["infrastructure", "integration"].includes(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION ?? "")) throw new Error("EXTERNAL_EXECUTION_BLOCKED");
// Both legacy and finals callers use the same version ledger and current shared schema.
process.env.MIGRATOR_DATABASE_URL ??= process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof";
await import("./migrate-finals.js");
