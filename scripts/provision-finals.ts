if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "infrastructure") throw new Error("PROVISIONING_EXECUTION_BLOCKED");
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { newServiceState } from "../services/api/src/service-state.js";
import { bankPolicy, registeredUriSchema } from "../packages/protocol/src/index.js";
import { provisioningAccountsSchema, type InstitutionRecord } from "../services/api/src/finals-model.js";
const [manifestPath, accountsPath] = process.argv.slice(2);
if (!manifestPath || !accountsPath || !process.env.INSTITUTION_ID || !process.env.MIGRATOR_DATABASE_URL) throw new Error("Manifest, accounts, INSTITUTION_ID and MIGRATOR_DATABASE_URL required");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const accounts = provisioningAccountsSchema.parse(JSON.parse(await readFile(accountsPath, "utf8")));
if (new Set(accounts.map(a => a.id)).size !== accounts.length || !["institution", "gateway", "recipient"].every(role => accounts.some(a => a.role === role))) throw new Error("DISTINCT_ROLE_ACCOUNTS_REQUIRED");
const institutionUri = registeredUriSchema.parse(manifest.institutionUri ?? manifest.issuerDid), serviceUri = registeredUriSchema.parse(manifest.serviceUri ?? manifest.serviceDid);
const issuer = manifest.publicKeys["issuer/approval-v1"], service = manifest.publicKeys["sender/key"];
const state: InstitutionRecord = { id: process.env.INSTITUTION_ID, did: institutionUri, institutionUri, serviceV3: newServiceState(), epoch: "1", approvalKeyVersion: 1, approvalKid: issuer.kid, approvalPublicKey: issuer.publicJwk, status: "active", policy: bankPolicy, services: { [serviceUri]: { did: serviceUri, kid: service.kid, publicKey: service.publicJwk, keyVersion: 1, active: true } }, members: Object.fromEntries(accounts.map(a => [a.id, { role: a.role, ...(a.role === "gateway" ? { serviceDid: serviceUri } : {}) }])), intents: {}, attempts: {}, credentials: {}, authorizations: {}, consumptions: {}, recipientKeys: {}, audit: [] };
const sql = postgres(process.env.MIGRATOR_DATABASE_URL, { max: 1 });
try {
  await sql.begin(async tx => {
    for (const a of accounts) await tx`INSERT INTO public.users (id, display_name, role, demo_code) VALUES (${a.id}, ${a.displayName}, ${a.role}, ${`disabled-${randomUUID()}`})`;
    await tx`INSERT INTO issuer_v2.institutions (id, state) VALUES (${state.id}, ${tx.json(state as unknown as postgres.JSONValue)})`;
    await tx`INSERT INTO issuer_v2.recovery_gate(institution_id,status,anchor_hash,checked_at) VALUES(${state.id},'ready','new-empty-deployment',now())`;
  });
  console.log("New institution and role accounts provisioned; chain registration remains an explicit separate action.");
} finally { await sql.end({ timeout: 5 }); }
