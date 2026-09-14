import { createDatabase } from "../services/api/src/db.js";
import { seedDatabase } from "../services/api/src/seed.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof";
const { db, client } = createDatabase(databaseUrl);
await seedDatabase(db);
await client.end();
console.log("Seeded synthetic users and tasks. No real personal data was written.");
