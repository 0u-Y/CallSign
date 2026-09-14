import { eq } from "drizzle-orm";
import type { Database } from "./db.js";
import { authorizationConsumptions } from "./schema.js";

export interface ConsumptionInput {
  authorizationId: string;
  authorizationHash: string;
  bindingHash: string;
  recipientId: string;
  sessionId: string;
  consumedAt: Date;
  expiresAt: Date;
}

export interface ConsumptionRecord extends ConsumptionInput {
  replay: boolean;
}

export async function consumeAuthorizationAtomic(db: Database, input: ConsumptionInput): Promise<ConsumptionRecord> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(authorizationConsumptions).values(input).onConflictDoNothing().returning();
    const record = inserted[0] ?? (await tx.select().from(authorizationConsumptions).where(eq(authorizationConsumptions.authorizationId, input.authorizationId)).limit(1))[0];
    if (!record) throw new Error("CONSUMPTION_READ_AFTER_WRITE_FAILED");
    if (record.bindingHash !== input.bindingHash || record.authorizationHash !== input.authorizationHash || record.recipientId !== input.recipientId || record.sessionId !== input.sessionId) {
      throw new HttpConflict("AUTHORIZATION_ALREADY_CONSUMED");
    }
    return { ...record, replay: inserted.length === 0 };
  });
}

export class HttpConflict extends Error {
  readonly statusCode = 409;
  readonly code = "AUTHORIZATION_ALREADY_CONSUMED";
}
