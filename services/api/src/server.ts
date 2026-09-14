import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { importJWK, type JWK } from "jose";
import type { RawData, WebSocket } from "ws";
import { z } from "zod";
import { keccak256, stringToHex } from "viem";
import {
  PROTOCOL,
  PROTOCOL_VERSION,
  assertTemporalValidity,
  contactAuthorizationSchema,
  consumptionReceiptSchema,
  enrollmentProofSchema,
  gatewayConsumeRequestSchema,
  hashCanonical,
  randomId,
  recipientChallengeSchema,
  sessionBindingSchema,
  signPayload,
  verifyPayload,
  type ContactAuthorization,
  type ConsumptionReceipt,
  type EnrollmentProof,
} from "@callsign/protocol";
import { assertCsrf, HttpError, newToken, requireRole, sessionForRequest, tokenHash, type AuthSession } from "./auth.js";
import { consumeAuthorizationAtomic, HttpConflict } from "./consumption.js";
import { createDatabase, type Database } from "./db.js";
import { loadOrCreateSigningKey, type PersistedSigningKey } from "./keys.js";
import { seedDatabase } from "./seed.js";
import {
  authorizations,
  demoRuns,
  gatewayRegistrations,
  governanceProposals,
  proposalSignatures,
  recipientEnrollments,
  sessions,
  tasks,
  users,
  verifierEvents,
} from "./schema.js";
import { ensureLedgerDelegation, loadLedgerDeployment, revokeLedgerDelegation } from "./ledger.js";
import { analyzeTranscript } from "./risk.js";

export interface ServerOptions {
  databaseUrl: string;
  webOrigin: string;
  demoMode: boolean;
  keyDirectory: string;
  logger?: boolean;
  now?: () => number;
}

const FALLBACK_NETWORK_ID = "20260914";
const FALLBACK_REGISTRY_ADDRESS = "0x1111111111111111111111111111111111111111";
const INSTITUTION_ID = "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ";

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ? { redact: ["req.headers.cookie", "req.headers.x-csrf-token", "body.signedJws"] } : false, bodyLimit: 32 * 1024 });
  const { db, client } = createDatabase(options.databaseUrl);
  const issuerKey = await loadOrCreateSigningKey(`${options.keyDirectory}/issuer-ed25519.json`);
  const enrollmentKey = await loadOrCreateSigningKey(`${options.keyDirectory}/enrollment-ed25519.json`);
  const ledger = await loadLedgerDeployment().catch(() => null);
  const networkId = ledger?.networkId ?? FALLBACK_NETWORK_ID;
  const registryAddress = ledger?.registryAddress ?? FALLBACK_REGISTRY_ADDRESS;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(websocket);
  if (options.demoMode) await seedDatabase(db);

  app.addHook("onClose", async () => { await client.end({ timeout: 5 }); });
  app.setErrorHandler((error, _request, reply) => {
    const known = error as { statusCode?: number; code?: string; issues?: unknown };
    const status = known.statusCode ?? (error instanceof z.ZodError ? 400 : 500);
    const code = error instanceof z.ZodError ? "INVALID_INPUT" : known.code ?? "INTERNAL_ERROR";
    if (status >= 500) app.log.error(error);
    reply.status(status).send({ error: { code, message: status >= 500 ? "요청을 처리하지 못했습니다." : error instanceof Error ? error.message : code } });
  });

  app.get("/health", async () => ({ status: "ok", profile: "witness-qbft-p0", protocolVersion: 1 }));
  app.get("/readiness", async () => ledgerReadiness(ledger));
  app.get("/evidence/latest", async () => {
    const readiness = await ledgerReadiness(ledger);
    try {
      const report = JSON.parse(await readFile(resolve(import.meta.dirname, "../../../artifacts/test-results.json"), "utf8")) as unknown;
      return { readiness, report };
    } catch {
      return { readiness, report: null };
    }
  });
  app.get("/trust-bundle", async () => ({
    networkId,
    genesisHash: ledger?.genesisHash,
    registryAddress,
    policyVersion: "1",
    witnessThreshold: 3,
    witnessPublicKeys: ledger ? await loadWitnessPublicKeys() : [],
    issuerPublicKey: issuerKey.publicJwk,
    issuerKid: issuerKey.kid,
    enrollmentPublicKey: enrollmentKey.publicJwk,
    enrollmentKid: enrollmentKey.kid,
    supportedProtocolVersions: [1],
    warning: ledger ? "P0 3-of-4 state witness 프로파일이며 네이티브 QBFT light client가 아닙니다." : "원장 배포가 없어 witness 검증을 사용할 수 없습니다.",
  }));

  app.get("/state-bundles", async (request, reply) => {
    if (!ledger) throw new HttpError(503, "LEDGER_NOT_READY");
    const query = z.object({ institutionId: z.string().min(16).max(128), delegationId: z.string().min(16).max(128) }).strict().parse(request.query);
    const witnesses = await Promise.allSettled(witnessUrls().map(async (url) => ({ url, health: await fetchJson<{ blockNumber: string }>(`${url}/health`) })));
    const ready = witnesses.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
    if (ready.length < 3) return reply.status(503).send({ error: { code: "WITNESS_THRESHOLD_UNAVAILABLE", message: `${ready.length}/4 witness만 응답했습니다.` } });
    const blockNumber = ready.map((entry) => BigInt(entry.health.blockNumber)).reduce((lowest, value) => value < lowest ? value : lowest);
    const rpcResponse = await fetchJson<{ result?: { hash?: string } }>(process.env.BESU_RPC_URL ?? "http://127.0.0.1:18545", { jsonrpc: "2.0", method: "eth_getBlockByNumber", params: [`0x${blockNumber.toString(16)}`, false], id: 1 });
    const blockHash = rpcResponse.result?.hash;
    if (!blockHash) throw new HttpError(503, "CANDIDATE_BLOCK_UNAVAILABLE");
    const signed = await Promise.allSettled(witnessUrls().map((url) => fetchJson<{ witnessId: string; snapshot: unknown; jws: string }>(`${url}/snapshot`, { ...query, blockNumber: String(blockNumber), blockHash })));
    const responses = signed.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
    const groups = new Map<string, typeof responses>();
    for (const item of responses) { const key = hashCanonical(item.snapshot); groups.set(key, [...(groups.get(key) ?? []), item]); }
    const quorum = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    if (new Set(quorum.map((item) => item.witnessId)).size < 3) return reply.status(503).send({ error: { code: "WITNESS_THRESHOLD_NOT_MET", message: "같은 snapshot에 대한 3개 서명을 모으지 못했습니다." } });
    return { profile: "witness-qbft-p0", snapshot: quorum[0]!.snapshot, signatures: quorum.map(({ witnessId, jws }) => ({ witnessId, jws })) };
  });

  app.post("/auth/login", async (request, reply) => {
    if (!options.demoMode) throw new HttpError(404, "DEMO_LOGIN_DISABLED");
    if (request.headers.origin !== options.webOrigin) throw new HttpError(403, "ORIGIN_FORBIDDEN");
    const body = z.object({ demoCode: z.string().min(4).max(64) }).strict().parse(request.body);
    const user = (await db.select().from(users).where(eq(users.demoCode, body.demoCode)).limit(1))[0];
    if (!user) throw new HttpError(401, "LOGIN_FAILED");
    const token = newToken();
    const csrfToken = newToken();
    await db.insert(sessions).values({ id: randomId("session"), tokenHash: tokenHash(token), csrfToken, userId: user.id, expiresAt: new Date((now() + 4 * 60 * 60) * 1000) });
    reply.setCookie("ip_session", token, { httpOnly: true, sameSite: "strict", secure: options.webOrigin.startsWith("https://"), path: "/", maxAge: 4 * 60 * 60 });
    return { user: publicUser(user), csrfToken };
  });

  app.post("/auth/logout", async (request, reply) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    await db.delete(sessions).where(eq(sessions.id, session.sessionId));
    reply.clearCookie("ip_session", { path: "/" });
    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    const session = await sessionForRequest(db, request);
    return { user: { id: session.userId, displayName: session.displayName, role: session.role }, csrfToken: session.csrfToken };
  });

  app.post("/risk/analyze", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "recipient");
    const body = z.object({ transcript: z.string().trim().min(1).max(4_000), consent: z.literal(true) }).strict().parse(request.body);
    return analyzeTranscript({
      transcript: body.transcript,
      ...(process.env.OLLAMA_URL ? { ollamaUrl: process.env.OLLAMA_URL } : {}),
      ...(process.env.OLLAMA_MODEL ? { ollamaModel: process.env.OLLAMA_MODEL } : {}),
    });
  });

  app.post("/recipient/enroll-session", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "recipient");
    const body = publicKeyBody.parse(request.body);
    assertKid(body.publicJwk as unknown as JWK, body.kid);
    const issuedAt = now();
    const payload: EnrollmentProof = {
      protocol: PROTOCOL, version: PROTOCOL_VERSION, type: "EnrollmentProof", networkId, registryAddress,
      recipientId: session.userId, recipientSessionPublicKey: body.publicJwk.x!, issuedAt, expiresAt: issuedAt + 300,
    };
    const proofJws = await signPayload(payload, enrollmentKey);
    const id = randomId("enrollment");
    await db.insert(recipientEnrollments).values({ id, userId: session.userId, kid: body.kid, publicJwk: body.publicJwk, proofJws, expiresAt: new Date(payload.expiresAt * 1000) });
    return { id, payload, proofJws, enrollmentKid: enrollmentKey.kid };
  });

  app.post("/gateway/register", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "gateway");
    const body = publicKeyBody.extend({ delegationId: z.string().min(16).max(128) }).parse(request.body);
    assertKid(body.publicJwk as unknown as JWK, body.kid);
    const id = randomId("gateway");
    await db.update(gatewayRegistrations).set({ active: false }).where(eq(gatewayRegistrations.userId, session.userId));
    await db.insert(gatewayRegistrations).values({ id, userId: session.userId, kid: body.kid, publicJwk: body.publicJwk, delegationId: body.delegationId });
    return { id, kid: body.kid, delegationId: body.delegationId, status: "등록 대기: 원장 위임과 대조 필요" };
  });

  app.get("/gateway/registrations", async (request) => {
    const session = await sessionForRequest(db, request);
    requireRole(session, "gateway", "institution");
    const rows = session.role === "gateway"
      ? await db.select().from(gatewayRegistrations).where(eq(gatewayRegistrations.userId, session.userId))
      : await db.select().from(gatewayRegistrations).where(eq(gatewayRegistrations.active, true));
    return { registrations: rows.map((row) => ({ id: row.id, kid: row.kid, delegationId: row.delegationId, active: row.active })) };
  });

  app.get("/directory/:institutionId", async (request) => {
    const { institutionId } = z.object({ institutionId: z.string().min(16).max(128) }).strict().parse(request.params);
    if (institutionId !== INSTITUTION_ID) throw new HttpError(404, "DIRECTORY_NOT_FOUND");
    const canonicalValue = "/official:mock-a-city:v1";
    return {
      institutionId,
      displayName: "모의 A시청",
      origin: options.webOrigin,
      path: "/official",
      version: "1",
      canonicalValue,
      directoryHash: keccak256(stringToHex(canonicalValue)),
      warning: "모의 디렉터리이며 실제 기관 연락처가 아닙니다.",
    };
  });

  app.get("/tasks", async (request) => {
    const session = await sessionForRequest(db, request);
    requireRole(session, "recipient");
    return { tasks: await db.select(taskProjection).from(tasks).where(eq(tasks.ownerId, session.userId)) };
  });

  app.get("/institution/tasks", async (request) => {
    const session = await sessionForRequest(db, request);
    requireRole(session, "institution");
    return { tasks: await db.select(taskProjection).from(tasks).where(eq(tasks.institutionId, INSTITUTION_ID)) };
  });

  app.get("/tasks/:id", async (request) => {
    const session = await sessionForRequest(db, request);
    requireRole(session, "recipient");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const task = (await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.ownerId, session.userId))).limit(1))[0];
    if (!task) throw new HttpError(404, "TASK_NOT_FOUND");
    return { task };
  });

  app.post("/authorizations", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "institution");
    const body = z.object({ taskId: z.string(), gatewayRegistrationId: z.string(), purposeCode: z.enum(["CIVIL_REPLY", "DOCUMENT_SUPPLEMENT"]) }).strict().parse(request.body);
    const task = (await db.select().from(tasks).where(eq(tasks.id, body.taskId)).limit(1))[0];
    const gateway = (await db.select().from(gatewayRegistrations).where(and(eq(gatewayRegistrations.id, body.gatewayRegistrationId), eq(gatewayRegistrations.active, true))).limit(1))[0];
    if (!task || !gateway) throw new HttpError(404, "AUTHORIZATION_INPUT_NOT_FOUND");
    const issuedAt = now();
    const ledgerDelegation = await ensureLedgerDelegation({ delegationId: gateway.delegationId, institutionId: task.institutionId, gatewayPublicJwk: gateway.publicJwk as JWK, purposeMask: body.purposeCode === "CIVIL_REPLY" ? 1n : 2n, now: issuedAt }).catch((error) => { throw new HttpError(503, `LEDGER_DELEGATION_FAILED:${error instanceof Error ? error.message : "UNKNOWN"}`); });
    const payload: ContactAuthorization = {
      protocol: PROTOCOL, version: PROTOCOL_VERSION, type: "ContactAuthorization", networkId, registryAddress,
      authorizationId: randomId("auth"), institutionId: task.institutionId, epoch: ledgerDelegation.epoch, delegationId: gateway.delegationId,
      recipientId: task.ownerId, purposeCode: body.purposeCode, officialTaskOpaqueId: task.opaqueId, issuedAt, notBefore: issuedAt, expiresAt: issuedAt + 600,
    };
    const signedJws = await signPayload(payload, issuerKey);
    const authorizationHash = hashCanonical(payload);
    await db.insert(authorizations).values({ id: payload.authorizationId, institutionId: payload.institutionId, delegationId: payload.delegationId, gatewayRegistrationId: gateway.id, recipientId: payload.recipientId, taskId: task.id, payload, signedJws, authorizationHash, expiresAt: new Date(payload.expiresAt * 1000) });
    return { payload, signedJws, authorizationHash, issuerKid: issuerKey.kid };
  });

  app.get("/authorizations", async (request) => {
    const session = await sessionForRequest(db, request);
    requireRole(session, "gateway", "institution", "recipient");
    if (session.role === "institution") return { authorizations: await db.select().from(authorizations).orderBy(desc(authorizations.createdAt)) };
    if (session.role === "recipient") return { authorizations: await db.select().from(authorizations).where(eq(authorizations.recipientId, session.userId)).orderBy(desc(authorizations.createdAt)) };
    const rows = await db.select({ authorization: authorizations }).from(authorizations).innerJoin(gatewayRegistrations, eq(authorizations.gatewayRegistrationId, gatewayRegistrations.id)).where(eq(gatewayRegistrations.userId, session.userId)).orderBy(desc(authorizations.createdAt));
    return { authorizations: rows.map((row) => row.authorization) };
  });

  app.post("/authorizations/:id/cancel", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "institution");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const changed = await db.update(authorizations).set({ cancelledAt: new Date(now() * 1000) }).where(and(eq(authorizations.id, id), isNull(authorizations.cancelledAt))).returning({ id: authorizations.id });
    if (!changed[0]) throw new HttpError(404, "AUTHORIZATION_NOT_FOUND_OR_CANCELLED");
    return { id, cancelled: true };
  });

  app.post("/authorizations/:id/revoke-delegation", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "institution");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const authorization = (await db.select().from(authorizations).where(eq(authorizations.id, id)).limit(1))[0];
    if (!authorization) throw new HttpError(404, "AUTHORIZATION_NOT_FOUND");
    const transactionHash = await revokeLedgerDelegation(authorization.delegationId).catch((error) => { throw new HttpError(409, `LEDGER_REVOCATION_FAILED:${error instanceof Error ? error.message : "UNKNOWN"}`); });
    return { id, delegationId: authorization.delegationId, transactionHash };
  });

  app.post("/authorizations/:id/consume", async (request, reply) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "gateway");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      binding: sessionBindingSchema,
      recipientEnrollmentId: z.string(),
      recipientChallengeJws: z.string().max(32 * 1024),
      gatewayConsumeRequestJws: z.string().max(32 * 1024),
    }).strict().parse(request.body);
    const auth = (await db.select().from(authorizations).where(and(eq(authorizations.id, id), isNull(authorizations.cancelledAt), gt(authorizations.expiresAt, new Date(now() * 1000)))).limit(1))[0];
    if (!auth) throw new HttpError(409, "AUTHORIZATION_INVALID");
    const gateway = (await db.select().from(gatewayRegistrations).where(and(eq(gatewayRegistrations.id, auth.gatewayRegistrationId), eq(gatewayRegistrations.userId, session.userId), eq(gatewayRegistrations.active, true))).limit(1))[0];
    const enrollment = (await db.select().from(recipientEnrollments).where(and(eq(recipientEnrollments.id, body.recipientEnrollmentId), eq(recipientEnrollments.userId, auth.recipientId), gt(recipientEnrollments.expiresAt, new Date(now() * 1000)))).limit(1))[0];
    if (!gateway || !enrollment) throw new HttpError(403, "POSSESSION_CONTEXT_INVALID");
    const enrollmentPayload = await verifyPayload(enrollment.proofJws, enrollmentKey.publicKey, { type: "EnrollmentProof", kid: enrollmentKey.kid, schema: enrollmentProofSchema });
    const recipientKey = await importJWK(enrollment.publicJwk as JWK, "EdDSA");
    const challenge = await verifyPayload(body.recipientChallengeJws, recipientKey, { type: "RecipientChallenge", kid: enrollment.kid, schema: recipientChallengeSchema });
    const gatewayKey = await importJWK(gateway.publicJwk as JWK, "EdDSA");
    const consumeRequest = await verifyPayload(body.gatewayConsumeRequestJws, gatewayKey, { type: "GatewayConsumeRequest", kid: gateway.kid, schema: gatewayConsumeRequestSchema });
    assertTemporalValidity(challenge, now());
    assertTemporalValidity(consumeRequest, now());
    const bindingHash = hashCanonical(body.binding);
    const challengeHash = hashCanonical(challenge);
    if (enrollmentPayload.recipientId !== auth.recipientId || challenge.recipientId !== auth.recipientId || challenge.enrollmentProof !== enrollment.proofJws || challenge.recipientSessionPublicKey !== enrollmentPayload.recipientSessionPublicKey || body.binding.recipientId !== auth.recipientId || body.binding.sessionId !== challenge.sessionId || body.binding.recipientNonce !== challenge.recipientNonce || body.binding.authorizationHash !== auth.authorizationHash || body.binding.delegationId !== auth.delegationId || consumeRequest.authorizationId !== auth.id || consumeRequest.authorizationHash !== auth.authorizationHash || consumeRequest.bindingHash !== bindingHash || consumeRequest.recipientChallengeHash !== challengeHash || consumeRequest.sessionId !== challenge.sessionId) {
      throw new HttpError(409, "CONSUMPTION_CONTEXT_MISMATCH");
    }
    const consumedAt = new Date(now() * 1000);
    const record = await consumeAuthorizationAtomic(db, { authorizationId: auth.id, authorizationHash: auth.authorizationHash, bindingHash, recipientId: auth.recipientId, sessionId: challenge.sessionId, consumedAt, expiresAt: new Date((now() + 60) * 1000) });
    if (options.demoMode && request.headers["x-demo-fail-after-commit"] === "true" && !record.replay) {
      return reply.status(503).send({ error: { code: "DEMO_SIGNING_FAILURE_AFTER_COMMIT", message: "commit 이후 서명 실패를 재현했습니다. 같은 binding으로 재시도하세요." } });
    }
    const receipt: ConsumptionReceipt = {
      protocol: PROTOCOL, version: PROTOCOL_VERSION, type: "ConsumptionReceipt", networkId, registryAddress,
      authorizationId: record.authorizationId, authorizationHash: record.authorizationHash, bindingHash: record.bindingHash, recipientId: record.recipientId, sessionId: record.sessionId,
      consumedAt: Math.floor(record.consumedAt.getTime() / 1000), expiresAt: Math.floor(record.expiresAt.getTime() / 1000),
    };
    consumptionReceiptSchema.parse(receipt);
    return { receipt, signedJws: await signPayload(receipt, issuerKey), issuerKid: issuerKey.kid, replay: record.replay };
  });

  app.get("/governance/proposals", async (request) => {
    const session = await sessionForRequest(db, request);
    requireRole(session, "approver", "demo_operator");
    return { proposals: await db.select().from(governanceProposals).orderBy(desc(governanceProposals.createdAt)) };
  });

  app.post("/governance/proposals", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "demo_operator");
    if (!options.demoMode) throw new HttpError(404, "DEMO_CONTROL_DISABLED");
    const body = z.object({ action: z.enum(["REGISTER", "RECOVER"]), institutionId: z.string().min(16), payload: z.record(z.string(), z.unknown()) }).strict().parse(request.body);
    const proposal = { id: randomId("proposal"), action: body.action, institutionId: body.institutionId, payload: body.payload, status: "collecting" };
    await db.insert(governanceProposals).values(proposal);
    return { proposal };
  });

  app.post("/governance/proposals/:id/sign", async (request) => {
    const session = await protectedWrite(db, request, options.webOrigin);
    requireRole(session, "approver");
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const proposal = (await db.select().from(governanceProposals).where(eq(governanceProposals.id, id)).limit(1))[0];
    if (!proposal) throw new HttpError(404, "PROPOSAL_NOT_FOUND");
    const signature = createHash("sha256").update(`${id}:${session.userId}:${JSON.stringify(proposal.payload)}`).digest("hex");
    const inserted = await db.insert(proposalSignatures).values({ proposalId: id, signerUserId: session.userId, signature }).onConflictDoNothing().returning();
    if (!inserted[0]) throw new HttpError(409, "SIGNER_ALREADY_COUNTED");
    const all = await db.select().from(proposalSignatures).where(eq(proposalSignatures.proposalId, id));
    if (all.length >= 2) await db.update(governanceProposals).set({ status: "quorum-ready" }).where(eq(governanceProposals.id, id));
    return { signerUserId: session.userId, signerCount: all.length, status: all.length >= 2 ? "quorum-ready" : "collecting", warning: "이 API 서명은 역할 분리 UX 증거이며 실제 EIP-712 실행은 원장 트랜잭션 단계에서 별도 수행됩니다." };
  });

  app.get("/runs/:id", async (request) => runResponse(db, request));
  app.get("/runs/:id/export", async (request, reply) => {
    reply.header("content-disposition", "attachment; filename=CallSign-evidence.json");
    return runResponse(db, request);
  });

  const sockets = new Map<string, Set<WebSocket>>();
  app.get("/signaling", { websocket: true }, async (socket, request) => {
    let session: AuthSession;
    try {
      if (request.headers.origin !== options.webOrigin) throw new HttpError(403, "ORIGIN_FORBIDDEN");
      session = await sessionForRequest(db, request);
      requireRole(session, "recipient", "gateway");
    } catch {
      socket.close(1008, "unauthorized");
      return;
    }
    const own = sockets.get(session.userId) ?? new Set<WebSocket>();
    own.add(socket);
    sockets.set(session.userId, own);
    socket.on("message", async (event: RawData) => {
      try {
        const message = signalingMessage.parse(JSON.parse(String(event)));
        const target = (await db.select().from(users).where(eq(users.id, message.toUserId)).limit(1))[0];
        if (!target) throw new Error("target");
        const permitted = (session.role === "gateway" && target.role === "recipient") || (session.role === "recipient" && target.role === "gateway");
        if (!permitted) throw new Error("room");
        for (const peer of sockets.get(target.id) ?? []) peer.send(JSON.stringify({ ...message, fromUserId: session.userId }));
      } catch {
        socket.send(JSON.stringify({ type: "error", code: "SIGNALING_MESSAGE_REJECTED" }));
      }
    });
    socket.on("close", () => { own.delete(socket); if (own.size === 0) sockets.delete(session.userId); });
  });

  return app;
}

async function protectedWrite(db: Database, request: Parameters<typeof sessionForRequest>[1], allowedOrigin: string) {
  const session = await sessionForRequest(db, request);
  assertCsrf(request, session, allowedOrigin);
  return session;
}

function assertKid(jwk: JWK, kid: string): void {
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string" || jwk.d !== undefined) throw new HttpError(400, "INVALID_PUBLIC_KEY");
  const actual = createHash("sha256").update(Buffer.from(jwk.x, "base64url")).digest("base64url").slice(0, 22);
  if (actual !== kid) throw new HttpError(400, "KID_MISMATCH");
}

function publicUser(user: typeof users.$inferSelect) { return { id: user.id, displayName: user.displayName, role: user.role }; }
const publicKeyBody = z.object({ publicJwk: z.object({ kty: z.literal("OKP"), crv: z.literal("Ed25519"), x: z.string(), d: z.never().optional() }).passthrough(), kid: z.string().min(8).max(64) }).strict();
const taskProjection = { id: tasks.id, institutionId: tasks.institutionId, title: tasks.title, status: tasks.status, detail: tasks.detail };
const signalingMessage = z.object({ type: z.enum(["invite", "challenge", "offer", "answer", "ice", "proof", "hangup"]), toUserId: z.string().min(16), sessionId: z.string().min(16), payload: z.unknown() }).strict();

async function runResponse(db: Database, request: Parameters<typeof sessionForRequest>[1]) {
  const session = await sessionForRequest(db, request);
  requireRole(session, "demo_operator", "approver", "institution", "gateway", "recipient");
  const { id } = z.object({ id: z.string() }).parse(request.params);
  const run = (await db.select().from(demoRuns).where(eq(demoRuns.id, id)).limit(1))[0];
  if (!run) throw new HttpError(404, "RUN_NOT_FOUND");
  const events = await db.select().from(verifierEvents).where(eq(verifierEvents.runId, id)).orderBy(verifierEvents.createdAt);
  return { run, events };
}

function witnessUrls(): string[] {
  return (process.env.WITNESS_URLS ?? "http://127.0.0.1:4201,http://127.0.0.1:4202,http://127.0.0.1:4203,http://127.0.0.1:4204").split(",");
}

function besuNodeUrls(): string[] {
  return (process.env.BESU_NODE_URLS ?? "http://127.0.0.1:18545,http://127.0.0.1:28545,http://127.0.0.1:38545,http://127.0.0.1:48545").split(",");
}

async function ledgerReadiness(ledger: Awaited<ReturnType<typeof loadLedgerDeployment>> | null) {
  if (!ledger) return { status: "unavailable", reason: "LEDGER_NOT_DEPLOYED", nodeCount: 0, witnessCount: 0, sameBlockHash: false, registryCodePresent: false };
  const nodes = await Promise.allSettled(besuNodeUrls().map(async (url, index) => {
    const heightResponse = await fetchJson<{ result?: string }>(url, { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: index + 1 });
    if (!heightResponse.result) throw new Error("BLOCK_NUMBER_UNAVAILABLE");
    return { url, blockNumber: BigInt(heightResponse.result) };
  }));
  const readyNodes = nodes.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
  let sameBlockHash = false;
  let registryCodePresent = false;
  let commonBlockNumber: string | null = null;
  let commonBlockHash: string | null = null;
  if (readyNodes.length === 4) {
    const common = readyNodes.map((node) => node.blockNumber).reduce((lowest, value) => value < lowest ? value : lowest);
    commonBlockNumber = String(common);
    const blockTag = `0x${common.toString(16)}`;
    const observations = await Promise.allSettled(readyNodes.map(async ({ url }, index) => {
      const [block, code] = await Promise.all([
        fetchJson<{ result?: { hash?: string } }>(url, { jsonrpc: "2.0", method: "eth_getBlockByNumber", params: [blockTag, false], id: 20 + index }),
        fetchJson<{ result?: string }>(url, { jsonrpc: "2.0", method: "eth_getCode", params: [ledger.registryAddress, blockTag], id: 30 + index }),
      ]);
      if (!block.result?.hash || !code.result) throw new Error("BLOCK_OBSERVATION_UNAVAILABLE");
      return { hash: block.result.hash, code: code.result };
    }));
    const values = observations.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
    sameBlockHash = values.length === 4 && new Set(values.map((value) => value.hash)).size === 1;
    registryCodePresent = values.length === 4 && values.every((value) => value.code !== "0x");
    commonBlockHash = sameBlockHash ? values[0]!.hash : null;
  }
  const witnesses = await Promise.allSettled(witnessUrls().map((url) => fetchJson<{ witnessId: string; blockNumber: string; rpcBoundary: string }>(`${url}/health`)));
  const readyWitnesses = witnesses.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
  const ready = readyNodes.length === 4 && sameBlockHash && registryCodePresent && readyWitnesses.length >= 3;
  return {
    status: ready ? "ready" : "degraded",
    profile: "qbft-4-node-plus-3-of-4-witness",
    nodeCount: readyNodes.length,
    witnessCount: readyWitnesses.length,
    witnessThreshold: 3,
    sameBlockHash,
    registryCodePresent,
    commonBlockNumber,
    commonBlockHash,
    registryAddress: ledger.registryAddress,
    witnesses: readyWitnesses,
  };
}

async function loadWitnessPublicKeys(): Promise<Array<{ witnessId: string; kid: string; jwk: JWK }>> {
  return Promise.all([1, 2, 3, 4].map(async (index) => {
    const witnessId = `witness-${index}`;
    const value = JSON.parse(await readFile(resolve(import.meta.dirname, `../../../.local/witness-public/${witnessId}.json`), "utf8")) as { kid: string; publicJwk: JWK };
    return { witnessId, kid: value.kid, jwk: value.publicJwk };
  }));
}

async function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(url, body === undefined ? { signal: controller.signal } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options: ServerOptions = {
    databaseUrl: process.env.DATABASE_URL ?? "postgres://institutionproof:institutionproof_dev_only@localhost:55432/institutionproof",
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:4173",
    demoMode: process.env.DEMO_MODE === "true",
    keyDirectory: process.env.KEY_DIRECTORY ?? resolve(import.meta.dirname, "../../../.local/test-keys"),
    logger: true,
  };
  const server = await buildServer(options);
  await server.listen({ host: "127.0.0.1", port: Number(process.env.API_PORT ?? 4100) });
}
