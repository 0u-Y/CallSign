import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDatabase(url: string) {
  const client = postgres(url, { max: 4, prepare: false, connect_timeout: 3, connection: { statement_timeout: 5000, lock_timeout: 2000 } });
  return { client, db: drizzle(client, { schema }) };
}

export type Database = ReturnType<typeof createDatabase>["db"];
