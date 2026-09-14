import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  demoCode: text("demo_code").notNull().unique(),
  ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  csrfToken: text("csrf_token").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("sessions_user_idx").on(table.userId)]);

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  institutionId: text("institution_id").notNull(),
  opaqueId: text("opaque_id").notNull().unique(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  detail: text("detail").notNull(),
  ...timestamps,
}, (table) => [index("tasks_owner_idx").on(table.ownerId)]);

export const gatewayRegistrations = pgTable("gateway_registrations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  kid: text("kid").notNull().unique(),
  publicJwk: jsonb("public_jwk").notNull(),
  delegationId: text("delegation_id").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const recipientEnrollments = pgTable("recipient_enrollments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  kid: text("kid").notNull().unique(),
  publicJwk: jsonb("public_jwk").notNull(),
  proofJws: text("proof_jws").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const authorizations = pgTable("authorizations", {
  id: text("id").primaryKey(),
  institutionId: text("institution_id").notNull(),
  delegationId: text("delegation_id").notNull(),
  gatewayRegistrationId: text("gateway_registration_id").notNull().references(() => gatewayRegistrations.id),
  recipientId: text("recipient_id").notNull().references(() => users.id),
  taskId: text("task_id").notNull().references(() => tasks.id),
  payload: jsonb("payload").notNull(),
  signedJws: text("signed_jws").notNull(),
  authorizationHash: text("authorization_hash").notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("authorizations_recipient_idx").on(table.recipientId)]);

export const authorizationConsumptions = pgTable("authorization_consumptions", {
  authorizationId: text("authorization_id").primaryKey().references(() => authorizations.id),
  authorizationHash: text("authorization_hash").notNull(),
  bindingHash: text("binding_hash").notNull(),
  recipientId: text("recipient_id").notNull(),
  sessionId: text("session_id").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const governanceProposals = pgTable("governance_proposals", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  institutionId: text("institution_id").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const proposalSignatures = pgTable("proposal_signatures", {
  proposalId: text("proposal_id").notNull().references(() => governanceProposals.id),
  signerUserId: text("signer_user_id").notNull().references(() => users.id),
  signature: text("signature").notNull(),
  ...timestamps,
}, (table) => [primaryKey({ columns: [table.proposalId, table.signerUserId] })]);

export const demoRuns = pgTable("demo_runs", {
  id: text("id").primaryKey(),
  scenario: text("scenario").notNull(),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  summary: jsonb("summary").notNull(),
  ...timestamps,
});

export const verifierEvents = pgTable("verifier_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => demoRuns.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  outcome: text("outcome").notNull(),
  latencyMs: text("latency_ms").notNull(),
  evidence: jsonb("evidence").notNull(),
  ...timestamps,
}, (table) => [index("verifier_events_run_idx").on(table.runId)]);
