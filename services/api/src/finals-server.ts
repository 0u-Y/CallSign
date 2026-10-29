import {assertPublishedTrust} from './published-trust.js';
import { registerMeasurements,registerRequestTiming } from './telemetry.js';
import { registerNotifications } from './notifications.js';
import { registerAccountManagement,assertMembershipGeneration } from './account-management.js';
import { registerServiceOperations } from "./operations.js";
import { httpConsumptionAnchor } from "./consumption-anchor.js";
import { registerServiceManagement } from "./service-management.js";
import { postgresQuotaStore } from "./quota.js";
import { PbxRuntime } from "./pbx-runtime.js";
import { registerServiceAudio } from "./service-audio.js";
import { AriClient, AsteriskBridge } from "./asterisk.js";
import { PbxEndpoints, registerPbxRoutes } from "./pbx-routes.js";
import { ServiceAuthority } from "./service-authority.js";
import { registerServiceRoutes } from "./service-routes.js";
import { currentServiceState } from "./service-current.js";
import { serviceProofSchema,registeredUriSchema } from "@callsign/protocol";
import { readFile } from "node:fs/promises";
import { timingSafeEqual, X509Certificate } from "node:crypto";
import { resolve } from "node:path";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { DeepgramStream, RevisionAnalyzer, analyzeWithAnthropic } from "./transcription.js";
import { OidcLoginFlow } from "./oidc-flow.js";
import { DidResolver, type DidDocument } from "./did.js";
import { RegistryOperations, recoveryV2Schema, recoveryTypedData } from "./governance-v2.js";
import { keccak256,stringToHex,hashTypedData, type Hex } from "viem";
import { turnCredentials } from "./media.js";
import rateLimit from "@fastify/rate-limit";
import { CompactSign, compactVerify, createRemoteJWKSet, importJWK, jwtVerify, type JWK } from "jose";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { bindingV2Schema, hashCanonical, permitSchema, publicKeySchema, signPayload } from "@callsign/protocol";
import { assertLedgerBinding, MonotonicStateGuard, verifyStateBundle, type TrustBundle } from "@callsign/verifier";
import { FinalsAuthority } from "./finals-authority.js";
import { liveAttemptFor, membership, workspaceFor, type Actor } from "./finals-model.js";
import { postgresAuthorityStore } from "./finals-store.js";
import { finalsEnvironment } from "./finals-config.js";
import { assertCsrf, assertRecentAuthentication, HttpError, newToken, sessionForRequest, tokenHash } from "./auth.js";
import { createDatabase } from "./db.js";
import { oidcLoginUses, sessions, users } from "./schema.js";
import { sessionCookie, type SessionPolicy } from "./auth.js";
import { SessionConnections } from "./session-connections.js";
import { aggregateWitnesses, type WitnessEndpoint } from "./witness-aggregate.js";

const text = z.string().min(1).max(32768);
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`MISSING_${name}`); return value; };
export async function readSigningKey(path: string) {
  const data = JSON.parse(await readFile(path, "utf8")) as { kid: string; privateJwk: JWK; publicJwk: JWK };
  publicKeySchema.parse(data.publicJwk);
  if (data.privateJwk.x !== data.publicJwk.x || !data.privateJwk.d) throw new Error("KEYPAIR_MISMATCH");
  z.string().min(1).max(200).parse(data.kid);
  try {
    const privateKey = await importJWK(data.privateJwk, "EdDSA");
    const challenge = await new CompactSign(Buffer.from(randomUUID())).setProtectedHeader({ alg: "EdDSA" }).sign(privateKey);
    await compactVerify(challenge, await importJWK(data.publicJwk, "EdDSA"), { algorithms: ["EdDSA"] });
    return { kid: data.kid, privateKey, publicJwk: data.publicJwk };
  }
  catch { throw new Error("KEYPAIR_MISMATCH"); }
}
function authenticate(supplied: unknown, expected: string) {
  if (typeof supplied !== "string" || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new HttpError(401, "SERVICE_AUTH_INVALID");
}
export async function buildFinalsServer(env = finalsEnvironment(process.env), adapters?: {
  anchor: import("./consumption-anchor.js").ConsumptionAnchor;
  current: import("./service-authority.js").ServiceAuthorityOptions["current"];
}) {
  // Explicit integration injection replaces only external authority adapters, never authentication or SQL.
  if (adapters) {
    let isolatedDatabase = false;
    try {
      const issuer = new URL(process.env.ISSUER_DATABASE_URL ?? ""), auth = new URL(process.env.AUTH_DATABASE_URL ?? "");
      isolatedDatabase = ["127.0.0.1", "localhost", "[::1]"].includes(issuer.hostname) && /^\/callsign_test_/.test(issuer.pathname) && issuer.host === auth.host && issuer.pathname === auth.pathname && issuer.username !== auth.username;
    } catch { /* Missing or malformed test targets must not reach any connection. */ }
    if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "integration" || !process.env.DEPLOYMENT_ID?.startsWith("test:") || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(env.WEB_ORIGIN).hostname) || !isolatedDatabase) throw new Error("TEST_ADAPTER_SCOPE_REQUIRED");
  }
  const requestLimit=z.coerce.number().int().min(300).max(10000).parse(process.env.API_REQUESTS_PER_MINUTE??600);
  const app = Fastify({ logger: false, bodyLimit: 65536 });
  registerRequestTiming(app);
  await app.register(websocket, { options: { maxPayload: 262144 } });
  await app.register(cookie); await app.register(rateLimit, { max:request=>request.cookies.ip_session||request.cookies.official_session?requestLimit:120,timeWindow:"1 minute",keyGenerator:request=>{const token=request.cookies.ip_session??request.cookies.official_session;return token?`session:${tokenHash(token)}`:`ip:${request.ip}`;} });
  app.addHook("preHandler",async request=>{if((process.env.SERVICE_PROFILE??"service")==="service"&&request.method==="POST"&&request.url.startsWith("/v2/")&&!request.url.startsWith("/v2/auth/")&&request.url!=="/v2/login")throw new HttpError(409,"COMPATIBILITY_PROFILE_REQUIRED");});
  app.setErrorHandler((error, _req, reply) => { const e = error as { statusCode?: number; code?: string }; reply.code(e.statusCode ?? (error instanceof z.ZodError ? 400 : 503)).send({ error: { code: e.code ?? (error instanceof z.ZodError ? "INVALID_INPUT" : "DEPENDENCY_UNAVAILABLE") } }); });
  app.get("/health", async () => ({ status: "alive", role: env.SERVICE_ROLE, protocolVersion: 3 }));
  const forward = async (target: string, path: string, request: FastifyRequest, token: string, overrideBody?: unknown) => {
    const response = await fetch(new URL(path, target), { method: request.method, signal: AbortSignal.timeout(4000), redirect: "error", headers: {
      "content-type": "application/json", "x-correlation-id":String(request.headers["x-correlation-id"]??""), "x-service-token": token, cookie: request.headers.cookie ?? "", origin: request.headers.origin ?? "", "x-csrf-token": String(request.headers["x-csrf-token"] ?? ""), "idempotency-key": String(request.headers["idempotency-key"] ?? ""),
    }, ...(["GET", "HEAD"].includes(request.method) ? {} : { body: JSON.stringify(overrideBody ?? request.body) }) });
    const value = await response.text(); if (value.length > 131072) throw new HttpError(503, "UPSTREAM_TOO_LARGE");
    return { response, value };
  };
  if (env.SERVICE_ROLE === "platform") {
    // This role never opens a DB or an issuer/service private key.
    app.get("/readiness", async (_request, reply) => {
      const responses = await Promise.allSettled([env.ISSUER_URL, env.SENDER_URL].map(url => fetch(new URL("/readiness", url), { signal: AbortSignal.timeout(2000) })));
      if (responses.some(r => r.status !== "fulfilled" || !r.value.ok)) return reply.code(503).send({ status: "unavailable" }); return { status: "ready" };
    });
    for (const path of ["/v2/signaling", "/v2/audio", "/v3/audio"]) app.get(path, { websocket: true }, (socket, request) => {
      if (request.headers.origin !== env.WEB_ORIGIN) { socket.close(1008, "origin"); return; }
      const url = new URL(request.url, env.ISSUER_URL); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const upstream = new WebSocket(url, { headers: { "x-service-token": env.PLATFORM_INTERNAL_TOKEN, cookie: request.headers.cookie ?? "", origin: env.WEB_ORIGIN }, handshakeTimeout: 3000, maxPayload: 262144 });
      socket.on("message", (data, binary) => { if (upstream.readyState === WebSocket.OPEN && upstream.bufferedAmount < 524288) upstream.send(data, { binary }); else socket.close(1013, "not ready/backpressure"); });
      upstream.on("open", () => socket.send(JSON.stringify({ type: "proxy-ready" })));
      upstream.on("message", (data, binary) => { if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 524288) socket.send(data, { binary }); else upstream.close(); });
      upstream.on("error", () => socket.close(1011, "upstream unavailable"));
      upstream.on("close", () => socket.close()); socket.on("close", () => upstream.close());
    });
    app.route({ method: ["GET", "POST"], url: "/v2/*", handler: async (request, reply) => {
      const isSender = request.url === "/v2/sender/permit";
      if (request.url.startsWith("/v2/sender-context")) throw new HttpError(404, "NOT_FOUND");
      const result = await forward(isSender ? env.SENDER_URL : env.ISSUER_URL, isSender ? "/permit" : request.url, request, env.PLATFORM_INTERNAL_TOKEN);
      const cookies = result.response.headers.getSetCookie(); for (const item of cookies) reply.header("set-cookie", [...(reply.getHeader("set-cookie") as string[] ?? []), item]);
      return reply.code(result.response.status).type("application/json").send(result.value);
    } });
    app.route({ method: ["GET", "POST"], url: "/v3/*", handler: async (request, reply) => {
      if (request.url.startsWith("/v3/sender-context")) throw new HttpError(404, "NOT_FOUND");
      const sender = request.url === "/v3/sender-proof";
      const result = await forward(sender ? env.SENDER_URL : env.ISSUER_URL, sender ? "/service-proof" : request.url, request, env.PLATFORM_INTERNAL_TOKEN);
      for(const item of result.response.headers.getSetCookie())reply.header("set-cookie",[...(reply.getHeader("set-cookie") as string[]??[]),item]);
      return reply.code(result.response.status).type("application/json").send(result.value);
    } });
    return app;
  }
  if (env.SERVICE_ROLE === "sender") {
    const key = await readSigningKey(required("SENDER_KEY_PATH")); const serviceDid = registeredUriSchema.parse(process.env.SERVICE_URI ?? required("SERVICE_DID"));
    if((process.env.SERVICE_PROFILE??"service")==="service"){const publicTrust=JSON.parse(await readFile(env.TRUST_BUNDLE_PATH,"utf8"));if(publicTrust.service?.serviceUri!==serviceDid||publicTrust.service.serviceKid!==key.kid||hashCanonical(publicTrust.service.servicePublicKey)!==hashCanonical(key.publicJwk))throw new Error("SENDER_REGISTERED_KEY_MISMATCH");}
    app.get("/readiness", async () => ({ status: "key-loaded" }));
    app.post("/service-proof", async request => {
      authenticate(request.headers["x-service-token"], env.PLATFORM_INTERNAL_TOKEN);
      const body = z.object({ challengeId: text }).strict().parse(request.body);
      const result = await forward(env.ISSUER_URL, "/v3/sender-context", request, env.SENDER_INTERNAL_TOKEN!, { ...body, serviceUri: serviceDid });
      if (!result.response.ok) throw new HttpError(result.response.status, "SENDER_CONTEXT_REJECTED");
      const proof = serviceProofSchema.parse(JSON.parse(result.value));
      if (proof.serviceUri !== serviceDid) throw new HttpError(409, "SENDER_URI_MISMATCH");
      return { proof, jws: await signPayload(proof, key) };
    });
    app.post("/permit", async (request) => {
      authenticate(request.headers["x-service-token"], env.PLATFORM_INTERNAL_TOKEN);
      const body = z.object({ attemptId: text, vcDigest: z.string().regex(/^[0-9a-f]{64}$/), browserPublicKey: publicKeySchema }).strict().parse(request.body);
      const result = await forward(env.ISSUER_URL, "/v2/sender-context", request, env.SENDER_INTERNAL_TOKEN!, { ...body, serviceDid });
      if (!result.response.ok) throw new HttpError(result.response.status, "SENDER_CONTEXT_REJECTED");
      const permit = permitSchema.parse(JSON.parse(result.value));
      if (permit.serviceDid !== serviceDid) throw new HttpError(409, "SENDER_DID_MISMATCH");
      return { permit, jws: await signPayload(permit, key) };
    });
    return app;
  }
  app.addHook("onRoute", route=>{if(route.method!=="HEAD"&&["/v2/auth/start","/v2/auth/callback","/v2/auth/me","/v2/auth/logout","/v2/login"].includes(route.url))app.route({method:route.method,url:route.url.replace("/v2/","/v3/"),handler:route.handler});});
  const store = postgresAuthorityStore(required("ISSUER_DATABASE_URL"),adapters?{anchor:adapters.anchor,deployment:required("DEPLOYMENT_ID")}:process.env.CONSUMPTION_ANCHOR_URL?{anchor:httpConsumptionAnchor({url:required("CONSUMPTION_ANCHOR_URL"),token:required("CONSUMPTION_ANCHOR_TOKEN"),deployment:required("DEPLOYMENT_ID")}),deployment:required("DEPLOYMENT_ID")}:undefined);
  if(adapters||process.env.CONSUMPTION_ANCHOR_URL)app.addHook("onReady",()=>store.verifyRecovery(env.INSTITUTION_ID));
  const { db, client } = createDatabase(required("AUTH_DATABASE_URL"));
  let pbxRuntime:PbxRuntime|undefined;
  const connections = new SessionConnections();
  app.addHook("onClose", async () => { connections.close();pbxRuntime?.close(); await store.close(); await client.end({ timeout: 5 }); });
  const trust = JSON.parse(await readFile(env.TRUST_BUNDLE_PATH, "utf8")) as TrustBundle & { endpoints: WitnessEndpoint[]; didDocuments: Record<string, DidDocument>; didRemotePins?: Record<string, string> };
  if (trust.witnessThreshold !== 3 || trust.witnessPublicKeys.length !== 4 || trust.endpoints.length !== 4) throw new Error("FINALS_REQUIRES_THREE_OF_FOUR");
  const resolver = new DidResolver(trust.didDocuments??{}, trust.didRemotePins);
  const guards = new Map<string, MonotonicStateGuard>();
  const authority = new FinalsAuthority({ resolveDid: did => resolver.resolve(did), store, networkId: env.NETWORK_ID, registryAddress: env.REGISTRY_ADDRESS,
    signingKey: version => readSigningKey(resolve(required("ISSUER_KEY_DIRECTORY"), `approval-v${version}.json`)),
    assertRotation: async (record, publicKey, epoch) => {
      const credential = Object.entries(record.credentials)[0]; if (!credential) throw new Error("ROTATION_STATE_QUERY_REQUIRES_EXISTING_CREDENTIAL");
      const bundle = await aggregateWitnesses({ endpoints: trust.endpoints, institutionId: record.id, delegationId: credential[0], trust });
      const raw = `0x${Buffer.from(publicKey.x!, "base64url").toString("hex")}`;
      if (!bundle.snapshot.institutionState.exists || bundle.snapshot.institutionState.status !== "Active" || bundle.snapshot.institutionState.epoch !== epoch || bundle.snapshot.institutionState.approvalPublicKey.toLowerCase() !== raw) throw new Error("ROTATED_KEY_NOT_CONFIRMED_ON_LEDGER");
    },
    assertCurrent: async (record, credentialId) => {
      const bundle = await aggregateWitnesses({ endpoints: trust.endpoints, institutionId: record.id, delegationId: credentialId, trust });
      const service = record.credentials[credentialId]?.vc.credentialSubject;
      if (!service) throw new Error("VC_NOT_FOUND");
      const verified = await verifyStateBundle(bundle, trust, { nowWallSeconds: Math.floor(Date.now() / 1000), nowMonotonicMs: performance.now(), expectedInstitutionId: record.id, expectedDelegationId: credentialId });
      const key = `${record.id}:${credentialId}`; const guard = guards.get(key) ?? new MonotonicStateGuard(); guards.set(key, guard); guard.accept(guard.limitDeadline(verified), performance.now());
      assertLedgerBinding(bundle.snapshot, { epoch: record.epoch, approvalPublicKey: record.approvalPublicKey, servicePublicKey: service.publicKey, now: Math.floor(Date.now() / 1000) });
    } });
  if(required("OIDC_ISSUER").includes("|"))throw new Error("OIDC_ISSUER_DELIMITER_FORBIDDEN");
  const policyFor = (purpose: "work" | "official"): SessionPolicy => ({ purpose, issuer: required("OIDC_ISSUER"), clientId: required(purpose === "official" ? "OFFICIAL_OIDC_CLIENT_ID" : "OIDC_CLIENT_ID"), audience: required(purpose === "official" ? "OFFICIAL_OIDC_AUDIENCE" : "OIDC_AUDIENCE") });
  const scopedSession = async(request: FastifyRequest, purpose: "work" | "official" = "work") => {const session=await sessionForRequest(db,request,policyFor(purpose));const record=await store.read(env.INSTITUTION_ID);membership(record,{userId:session.userId,role:session.role,institutionId:record.id},["institution","gateway","recipient","approver"]);assertMembershipGeneration(session,record.members[session.userId]!);return session;};
  const chargedRequests=new WeakSet<FastifyRequest>();
  const actorFor = async (request: FastifyRequest, write = false, purpose: "work" | "official" = "work"): Promise<Actor> => {
    authenticate(request.headers["x-service-token"], ["/v2/sender-context", "/v3/sender-context"].includes(request.url) ? env.SENDER_INTERNAL_TOKEN! : env.PLATFORM_INTERNAL_TOKEN);
    const session = await scopedSession(request, purpose); if (write) assertCsrf(request, session, env.WEB_ORIGIN);
    if(write&&(request.url.startsWith("/v3/management/")||request.url==="/v3/credentials"||request.url==="/v3/revoke"||purpose==="official"))assertRecentAuthentication(session);
    const actor = { userId: session.userId, role: session.role, institutionId: env.INSTITUTION_ID,membershipGeneration:session.membershipGeneration??0 }; const currentRecord=await store.read(actor.institutionId);membership(currentRecord, actor, ["institution", "gateway", "recipient", "approver"]);assertMembershipGeneration(session,currentRecord.members[actor.userId]!);
    if(!chargedRequests.has(request)){await quota.chargeRequest(actor.institutionId,actor.userId,Math.floor(Date.now()/1000),requestLimit);chargedRequests.add(request);}return actor;
  };
  const pbxSigningKey = process.env.ARI_URL ? await readSigningKey(required("PBX_EVIDENCE_KEY_PATH")) : undefined;
  const serviceAuthority = new ServiceAuthority({ assertPublished:record=>assertPublishedTrust(record,trust,required('VITE_SERVICE_TRUST_SHA256'),serviceAuthority.policy), ...(pbxSigningKey ? {pbxTrust:{kid:pbxSigningKey.kid,publicKey:pbxSigningKey.publicJwk}} : {}), store, networkId: env.NETWORK_ID, registryAddress: env.REGISTRY_ADDRESS,
    policy:(await import("@callsign/protocol")).runtimePolicySchema.parse({...((await import("@callsign/protocol")).servicePolicy),leaseSeconds:Number(process.env.CALL_LEASE_SECONDS??30),maxCallSeconds:Number(process.env.CALL_MAX_SECONDS??14400)}),
    signingKey: version => readSigningKey(resolve(required("ISSUER_KEY_DIRECTORY"), `approval-v${version}.json`)),
    current: adapters?.current ?? (async (record, digest) => {
      let bundle;
      try { bundle = await aggregateWitnesses({ endpoints: trust.endpoints, institutionId: record.id, delegationId: digest, trust,allowPolicyTransition:true }); }
      catch { return "unavailable"; }
      try { return await currentServiceState(record, digest, bundle, trust, Math.floor(Date.now()/1000)); }
      catch { return "unavailable"; }
    }),
  });
  registerMeasurements(app,{actorFor,store});
  registerNotifications(app,{databaseUrl:required("ISSUER_DATABASE_URL"),actorFor});
  registerAccountManagement(app,{issuer:required("OIDC_ISSUER"),store,actorFor});
  registerServiceOperations(app,{databaseUrl:required("ISSUER_DATABASE_URL"),store,actorFor,deploymentId:keccak256(stringToHex(`${trust.genesisHash}:${trust.registryAddress}`)),ledger:{urls:(process.env.BESU_NODE_URLS??"").split(",").filter(Boolean),networkId:env.NETWORK_ID,genesisHash:trust.genesisHash}});
  registerServiceManagement(app,{authority:serviceAuthority,actorFor,approvers:(process.env.REGISTRY_APPROVERS??"").split(",").filter(Boolean),confirmConfiguration:async(record,proposal)=>{
    const updatedTrust={...trust,policyVersion:String(proposal.contents.policy.version)},digest=Object.keys(record.serviceV3?.credentials??{})[0]??"0".repeat(64);
    const bundle=await aggregateWitnesses({endpoints:trust.endpoints,institutionId:record.id,delegationId:digest,trust:updatedTrust});
    await verifyStateBundle(bundle,updatedTrust,{expectedInstitutionId:record.id,expectedDelegationId:digest,nowWallSeconds:Math.floor(Date.now()/1000),nowMonotonicMs:performance.now(),maxStateAgeSeconds:8,maxFutureSkewSeconds:1});
    const state=bundle.snapshot.institutionState;
    if(!state.exists||state.status!=="Active"||state.epoch!==record.observedEpoch||bundle.snapshot.policyHash!==proposal.request.newPolicyHash||state.approvalPublicKey.toLowerCase()!==`0x${Buffer.from(record.approvalPublicKey.x!,"base64url").toString("hex")}`||bundle.snapshot.directoryHash!==proposal.request.newDirectoryHash||bundle.snapshot.directoryVersion!==proposal.request.newDirectoryVersion)throw new HttpError(409,"CONFIGURATION_NOT_CURRENT");
  },confirmKey:async(record,key)=>{
    const installed=await readSigningKey(resolve(required("ISSUER_KEY_DIRECTORY"),`approval-v${key.version}.json`));if(installed.kid!==key.kid||hashCanonical(installed.publicJwk)!==hashCanonical(key.publicKey))throw new HttpError(409,"INSTALLED_KEY_MISMATCH");
    const digest=Object.keys(record.serviceV3?.credentials??{})[0]??"0".repeat(64),bundle=await aggregateWitnesses({endpoints:trust.endpoints,institutionId:record.id,delegationId:digest,trust});
    await verifyStateBundle(bundle,trust,{expectedInstitutionId:record.id,expectedDelegationId:digest,nowWallSeconds:Math.floor(Date.now()/1000),nowMonotonicMs:performance.now(),maxStateAgeSeconds:8,maxFutureSkewSeconds:1});
    const state=bundle.snapshot.institutionState;if(!state.exists||state.status!=="Active"||state.epoch!==key.epoch||state.approvalPublicKey.toLowerCase()!==`0x${Buffer.from(key.publicKey.x!,"base64url").toString("hex")}`)throw new HttpError(409,"ROTATED_KEY_NOT_CONFIRMED");
  }});
  registerServiceRoutes(app, { authority: serviceAuthority, store, actorFor, sessionId:async r=>(await scopedSession(r)).sessionId });
  const quota=postgresQuotaStore(required("ISSUER_DATABASE_URL"));app.addHook("onClose",()=>quota.close());
  registerServiceAudio(app,{quota,authority:serviceAuthority,actorFor,connections,origin:env.WEB_ORIGIN,sessionId:async r=>(await scopedSession(r)).sessionId});
  if (process.env.ARI_URL) {
    const certificate=new X509Certificate(await readFile(required("PBX_DTLS_CERT_PATH")));
    const bridge = new AsteriskBridge(new AriClient({base:new URL(required("ARI_URL")),authorization:required("ARI_AUTHORIZATION"),application:"callsign"}), pbxSigningKey!, {networkId:env.NETWORK_ID,registryAddress:env.REGISTRY_ADDRESS,pbxFingerprint:certificate.fingerprint256});
    const endpoints = new PbxEndpoints({databaseUrl:required("ISSUER_DATABASE_URL"),secret:required("PBX_CREDENTIAL_SECRET"),realm:required("SIP_REALM"),wssUrl:required("SIP_WSS_URL"),sipDomain:required("SIP_DOMAIN"),mediaAddress:required("PBX_PRIVATE_ADDRESS")});
    registerPbxRoutes(app,{authority:serviceAuthority,actorFor,bridge,endpoints});
    pbxRuntime=new PbxRuntime({authority:serviceAuthority,institutionId:env.INSTITUTION_ID,bridge,endpoints,sessionsAlive:async attempt=>{const ids=Object.values(attempt.ownerSessions??{});if(ids.length===0)return false;for(const id of ids){const rows=await client`SELECT id FROM public.sessions WHERE id=${id} AND purpose='work' AND expires_at>now()`;if(!rows.length)return false;}return true;}});
    app.addHook("onReady",()=>pbxRuntime!.start());app.addHook("onClose",async()=>{pbxRuntime?.close();});
  }
  app.get("/v3/runtime-identity",async r=>{await actorFor(r);return {deploymentId:required("DEPLOYMENT_ID"),networkId:env.NETWORK_ID,registryAddress:env.REGISTRY_ADDRESS,trustPin:hashCanonical(trust),profile:"service"};});
  app.get("/v3/public-trust",async r=>{await actorFor(r);return trust;});
  app.get("/v3/state",async r=>{const actor=await actorFor(r),{digest}=z.object({digest:z.string().regex(/^[0-9a-f]{64}$/)}).strict().parse(r.query);const record=await store.read(actor.institutionId);if(!record.serviceV3?.credentials[digest])throw new HttpError(404,"VC_NOT_FOUND");
    if(actor.role!=="institution"&&!Object.values(record.serviceV3.authorizations).some(auth=>auth.payload.vcDigest===digest&&(actor.role==="recipient"?auth.payload.recipientId===actor.userId:actor.role==="gateway"&&auth.payload.agentId===actor.userId)))throw new HttpError(404,"VC_NOT_FOUND");return aggregateWitnesses({endpoints:trust.endpoints,institutionId:record.id,delegationId:digest,trust});});
  app.post("/v3/turn",async r=>{const actor=await actorFor(r,true),{attemptId}=z.object({attemptId:z.string()}).strict().parse(r.body),record=await store.read(actor.institutionId),{attempt}=serviceAuthority.party(record,actor,attemptId);if(!["gateway","recipient"].includes(actor.role)||["ended","cancelled","declined","failed","no-answer"].includes(attempt.status))throw new HttpError(409,"CALL_ENDED");return process.env.TURN_URLS?turnCredentials({urls:required("TURN_URLS").split(","),secret:required("TURN_SECRET"),sessionId:attempt.sessionId,userId:actor.userId,now:serviceAuthority.now()}):{iceServers:[]};});
  app.get("/readiness", async () => {
    const record = await store.read(env.INSTITUTION_ID); const key = await readSigningKey(resolve(required("ISSUER_KEY_DIRECTORY"), `approval-v${record.approvalKeyVersion}.json`));
    if (key.kid !== record.approvalKid || hashCanonical(key.publicJwk) !== hashCanonical(record.approvalPublicKey)) throw new HttpError(503, "ISSUER_KEY_NOT_READY");
    if((process.env.SERVICE_PROFILE??"service")==="service")assertPublishedTrust(record,trust,required("VITE_SERVICE_TRUST_SHA256"),serviceAuthority.policy);
    if((process.env.SERVICE_PROFILE??"service")==="service"&&(!pbxRuntime?.ready||record.serviceV3?.recovery!=="ready"))throw new HttpError(503,"SERVICE_RUNTIME_NOT_READY");
    if((process.env.SERVICE_PROFILE??"service")==="service"){
      const profile=(trust as unknown as {service?:import("@callsign/verifier").ServiceTrust}).service;
      if(trust.registryProfile!=="CALLSIGN_SERVICE_JOINT_CONFIGURATION_1"||trust.policyVersion!==String(record.policy.version))throw new HttpError(503,"TRUST_POLICY_PUBLICATION_REQUIRED");
      if(!profile||profile.institutionUri!==record.institutionUri||profile.issuerKid!==record.approvalKid||profile.approvalKeyVersion!==record.approvalKeyVersion||hashCanonical(profile.issuerPublicKey)!==hashCanonical(record.approvalPublicKey)||hashCanonical(profile.policy)!==hashCanonical(serviceAuthority.policy)||trust.networkId!==env.NETWORK_ID||trust.registryAddress.toLowerCase()!==env.REGISTRY_ADDRESS.toLowerCase()||!pbxSigningKey||profile.pbx?.kid!==pbxSigningKey.kid||hashCanonical(profile.pbx.publicKey)!==hashCanonical(pbxSigningKey.publicJwk)||profile.pbx.fingerprint!==new X509Certificate(await readFile(required("PBX_DTLS_CERT_PATH"))).fingerprint256)throw new HttpError(503,"SERVICE_TRUST_NOT_READY");
    }
    await db.select({ id: users.id }).from(users).limit(1); return { status: "ready", chain: "checked-per-operation" };
  });
  const finishLogin = async (request: FastifyRequest, reply: FastifyReply, idToken: string, official: boolean, expectedNonce?: string) => {
    if (required("OIDC_AUDIENCE") === required("OFFICIAL_OIDC_AUDIENCE")) throw new HttpError(503, "OFFICIAL_AUDIENCE_MUST_DIFFER");
    const issuer = required("OIDC_ISSUER"); const jwksUrl = new URL(required("OIDC_JWKS_URL")); if (jwksUrl.protocol !== "https:") throw new HttpError(503, "OIDC_HTTPS_REQUIRED");
    const identity = await jwtVerify(idToken, createRemoteJWKSet(jwksUrl, { timeoutDuration: 2000 }), { issuer, audience: required(official ? "OFFICIAL_OIDC_AUDIENCE" : "OIDC_AUDIENCE"), algorithms: ["RS256", "ES256", "EdDSA"], maxTokenAge: "5m", requiredClaims: ["sub", "iat", "exp"] }).catch(error => {
      if (["ERR_JWT_EXPIRED", "ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JWS_INVALID", "ERR_JWT_INVALID", "ERR_JOSE_ALG_NOT_ALLOWED", "ERR_JWKS_NO_MATCHING_KEY"].includes(error.code)) throw new HttpError(401, "OIDC_TOKEN_INVALID");
      throw error;
    });
    if (expectedNonce && identity.payload.nonce !== expectedNonce) throw new HttpError(401, "OIDC_NONCE_INVALID");
    const expectedClient = required(official ? "OFFICIAL_OIDC_CLIENT_ID" : "OIDC_CLIENT_ID");
    if ((identity.payload.azp !== undefined && identity.payload.azp !== expectedClient) || (Array.isArray(identity.payload.aud) && identity.payload.aud.length > 1 && identity.payload.azp !== expectedClient)) throw new HttpError(401, "OIDC_CLIENT_MISMATCH");
    const user = (await db.select().from(users).where(eq(users.id, `${issuer}|${identity.payload.sub}`)).limit(1))[0];
    if (!user || (official && user.role !== "recipient")) throw new HttpError(403, "ACCOUNT_NOT_PROVISIONED");
    const record = await store.read(env.INSTITUTION_ID); membership(record, { userId: user.id, role: user.role, institutionId: record.id }, ["institution", "gateway", "recipient", "approver"]);
    const token = newToken(); const csrfToken = newToken();
    const purpose = official ? "official" : "work";
    const policy = policyFor(purpose);
    const previousToken = request.cookies[sessionCookie(purpose)];
    const previous = previousToken ? await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.tokenHash, tokenHash(previousToken)), eq(sessions.userId, user.id), eq(sessions.purpose, purpose))) : [];
    await db.transaction(async tx => {
      await tx.delete(oidcLoginUses).where(lt(oidcLoginUses.expiresAt, new Date()));
      const accepted = await tx.insert(oidcLoginUses).values({ tokenHash: tokenHash(idToken), expiresAt: new Date(identity.payload.exp! * 1000) }).onConflictDoNothing().returning({ tokenHash: oidcLoginUses.tokenHash });
      if (!accepted.length) throw new HttpError(401, "OIDC_TOKEN_ALREADY_USED");
      if (previous.length) await tx.delete(sessions).where(eq(sessions.id, previous[0]!.id));
      await tx.insert(sessions).values({ id: randomUUID(), tokenHash: tokenHash(token), csrfToken, userId: user.id, expiresAt: new Date(Date.now() + 3600000), purpose,
        oidcIssuer: policy.issuer, oidcClientId: policy.clientId, oidcAudience: policy.audience, membershipGeneration:record.members[user.id]?.sessionGeneration??0,authenticatedAt: new Date((typeof identity.payload.auth_time === "number" ? identity.payload.auth_time : 0) * 1000) });
    });
    for (const prior of previous) connections.revoke(prior.id);
    reply.setCookie(sessionCookie(purpose), token, { httpOnly: true, sameSite: "strict", secure: env.WEB_ORIGIN.startsWith("https:"), path: "/", maxAge: 3600 });
    return { user: { id: user.id, role: user.role, displayName: user.displayName }, csrfToken, official: official };
  };
  const oidcFlow = process.env.OIDC_AUTHORIZATION_URL && process.env.OIDC_TOKEN_URL ? new OidcLoginFlow({ authorizationUrl: process.env.OIDC_AUTHORIZATION_URL, tokenUrl: process.env.OIDC_TOKEN_URL,
    redirectUri: `${env.WEB_ORIGIN}/${process.env.SERVICE_PROFILE==="finals"?"finals":"service"}`, clientId: required("OIDC_CLIENT_ID"), officialClientId: required("OFFICIAL_OIDC_CLIENT_ID") }) : null;
  app.post("/v2/auth/start", async (request, reply) => {
    authenticate(request.headers["x-service-token"], env.PLATFORM_INTERNAL_TOKEN);
    if (request.headers.origin !== env.WEB_ORIGIN || !oidcFlow) throw new HttpError(503, "OIDC_LOGIN_NOT_CONFIGURED");
    const body = z.object({ official: z.boolean() }).strict().parse(request.body); const result = oidcFlow.begin(body.official);
    reply.setCookie("oidc_state", result.state, { httpOnly: true, sameSite: "lax", secure: env.WEB_ORIGIN.startsWith("https:"), path: "/", maxAge: 300 });
    return { url: result.url };
  });
  app.post("/v2/auth/callback", async (request, reply) => {
    authenticate(request.headers["x-service-token"], env.PLATFORM_INTERNAL_TOKEN);
    if (request.headers.origin !== env.WEB_ORIGIN || !oidcFlow) throw new HttpError(401, "OIDC_STATE_INVALID");
    const body = z.object({ state: z.string().max(100), code: z.string().max(8192) }).strict().parse(request.body);
    let result;
    try { result = await oidcFlow.finish(body.state, request.cookies.oidc_state ?? "", body.code); }
    catch (error) {
      if (error instanceof Error && ["OIDC_STATE_INVALID", "OIDC_CODE_EXCHANGE_FAILED"].includes(error.message)) throw new HttpError(401, error.message);
      throw error;
    }
    reply.clearCookie("oidc_state", { path: "/" }); return finishLogin(request, reply, result.idToken, result.official, result.expectedNonce);
  });
  app.post("/v2/login", async (request, reply) => {
    authenticate(request.headers["x-service-token"], env.PLATFORM_INTERNAL_TOKEN);
    if (env.PUBLIC_DEPLOYMENT === "true") throw new HttpError(404, "DIRECT_TOKEN_LOGIN_DISABLED");
    if (request.headers.origin !== env.WEB_ORIGIN) throw new HttpError(403, "ORIGIN_FORBIDDEN");
    const body = z.object({ idToken: z.string().min(1).max(16384), official: z.boolean().default(false) }).strict().parse(request.body);
    return finishLogin(request, reply, body.idToken, body.official);
  });

  app.get("/v2/auth/me", async request => {
    authenticate(request.headers["x-service-token"], env.PLATFORM_INTERNAL_TOKEN);
    const { purpose } = z.object({ purpose: z.enum(["work", "official"]) }).strict().parse(request.query);
    const session = await scopedSession(request, purpose);
    membership(await store.read(env.INSTITUTION_ID), { userId: session.userId, role: session.role, institutionId: env.INSTITUTION_ID }, ["institution", "gateway", "recipient", "approver"]);
    if (purpose === "official" && session.role !== "recipient") throw new HttpError(403, "OFFICIAL_ROLE_REQUIRED");
    return { user: { id: session.userId, displayName: session.displayName, role: session.role }, purpose, csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  });
  app.post("/v2/auth/logout", async (request, reply) => {
    authenticate(request.headers["x-service-token"], env.PLATFORM_INTERNAL_TOKEN);
    const { purpose } = z.object({ purpose: z.enum(["work", "official"]) }).strict().parse(request.body);
    const session = await scopedSession(request, purpose); assertCsrf(request, session, env.WEB_ORIGIN);
    await db.delete(sessions).where(eq(sessions.id, session.sessionId));
    await store.transact(env.INSTITUTION_ID,async r=>{for(const t of Object.values(r.serviceV3?.attempts??{}))if(Object.values(t.ownerSessions??{}).includes(session.sessionId)&&!["ended","cancelled","declined","failed","no-answer"].includes(t.status)){t.status="failed";t.reason="logout";t.endedAt=serviceAuthority.now();if(t.consent){t.consent.granted=false;t.consent.generation++;}serviceAuthority.event(r,{userId:session.userId,role:session.role,institutionId:r.id},"call.cleanup",t.id);}});
    connections.revoke(session.sessionId);
    reply.clearCookie(sessionCookie(purpose), { path: "/" }); reply.clearCookie("oidc_state", { path: "/" });
    return { loggedOut: true, purpose };
  });

  app.get("/v2/workspace", async request => {
    const actor = await actorFor(request); const record = await store.read(actor.institutionId);
    return { ...workspaceFor(record, actor), csrfToken: (await scopedSession(request)).csrfToken, scenario: "모의 금융기관 이상거래 확인", mode: "provider-code-unverified" };
  });
  app.get("/v2/public-trust", async request => { await actorFor(request); return JSON.parse(await readFile(env.TRUST_BUNDLE_PATH, "utf8")); });
  app.post("/v2/turn", async request => {
    const actor = await actorFor(request, true); const { attemptId } = z.object({ attemptId: text }).strict().parse(request.body);
    const record = await store.read(actor.institutionId);
    const { attempt } = liveAttemptFor(record, actor, attemptId, Math.floor(Date.now()/1000));
    return turnCredentials({ urls: required("TURN_URLS").split(","), secret: required("TURN_SECRET"), sessionId: attempt.sessionId, userId: actor.userId, now: Math.floor(Date.now()/1000) });
  });
  const peers = new Map<string, Map<string, WebSocket>>();
  app.get("/v2/signaling", { websocket: true }, async (socket, request) => {
    try {
      if (request.headers.origin !== env.WEB_ORIGIN) throw new HttpError(403, "ORIGIN_FORBIDDEN");
      const actor = await actorFor(request); const { attemptId } = z.object({ attemptId: text }).strict().parse(request.query);
      if (!["gateway", "recipient"].includes(actor.role)) throw new HttpError(403, "CALL_ROLE_FORBIDDEN");
      const session = await scopedSession(request);
      const allowed = async () => {
        await actorFor(request);
        liveAttemptFor(await store.read(actor.institutionId), actor, attemptId, Math.floor(Date.now()/1000));
      };
      await allowed();
      if (socket.readyState !== WebSocket.OPEN) return;
      const unwatch = connections.watch(session.sessionId, allowed, () => socket.close(1008, "session or call authorization ended"));
      socket.on("close", unwatch);
      const room = peers.get(attemptId) ?? new Map<string, WebSocket>(); peers.set(attemptId, room);
      room.get(actor.userId)?.close(1008, "replaced; full revalidation required"); room.set(actor.userId, socket);
      socket.send(JSON.stringify({ type: "ready" }));
      socket.on("message", async raw => {
        try {
          await allowed(); const message = z.object({ type: z.enum(["invite", "offer", "answer", "binding", "recipient-proof", "receipt", "accept", "hangup"]), payload: z.unknown() }).strict().parse(JSON.parse(String(raw)));
          const senderOnly = ["invite", "offer", "binding"]; const recipientOnly = ["answer", "recipient-proof", "accept", "receipt"];
          if ((senderOnly.includes(message.type) && actor.role !== "gateway") || (recipientOnly.includes(message.type) && actor.role !== "recipient")) throw new Error("SIGNAL_ROLE_FORBIDDEN");
          if (String(raw).length > 65536) throw new Error("SIGNAL_TOO_LARGE");
          for (const [id, peer] of room) if (id !== actor.userId && peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify({ ...message, from: actor.userId }));
        } catch { socket.close(1008, "signaling rejected"); }
      });
      socket.on("close", () => { if (room.get(actor.userId) === socket) room.delete(actor.userId); if (!room.size) peers.delete(attemptId); });
    } catch { socket.close(1008, "unauthorized"); }
  });
  const audioUsers = new Set<string>();
  const audioAttempts = new Map<string, { count: number; expiresAt: number }>();
  app.get("/v2/audio", { websocket: true }, async (socket, request) => {
    let stt: DeepgramStream | undefined; let analyzer: RevisionAnalyzer | undefined; let owner: string | undefined; let expiryTimer: ReturnType<typeof setTimeout> | undefined; let stopped = false; let sequence = 0; let unwatch: (() => void) | undefined;
    const stop = () => { if (stopped) return; stopped = true; clearTimeout(expiryTimer); unwatch?.(); stt?.stop(); analyzer?.stop(); if (owner) audioUsers.delete(owner); if (socket.readyState === WebSocket.OPEN) socket.close(1000, "analysis stopped"); };
    socket.on("close", () => stop());
    const send = (value: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
    try {
      const actor = await actorFor(request); if (actor.role !== "recipient" || request.headers.origin !== env.WEB_ORIGIN) throw new Error("AUDIO_FORBIDDEN");
      const session = await scopedSession(request);
      const { attemptId } = z.object({ attemptId: text }).strict().parse(request.query);
      const record = await store.read(actor.institutionId);
      const { attempt } = liveAttemptFor(record, actor, attemptId, Math.floor(Date.now()/1000), true);
      if (stopped || audioUsers.has(actor.userId)) throw new Error("AUDIO_SESSION_INVALID");
      const allowed = async () => {
        await actorFor(request);
        liveAttemptFor(await store.read(actor.institutionId), actor, attemptId, Math.floor(Date.now()/1000), true);
      };
      await allowed(); if (stopped || socket.readyState !== WebSocket.OPEN) return;
      if (audioUsers.has(actor.userId)) throw new Error("AUDIO_SESSION_ALREADY_ACTIVE");
      owner = actor.userId; audioUsers.add(owner); const streamId = randomUUID();
      unwatch = connections.watch(session.sessionId, allowed, () => { send({ type: "unavailable", code: "AUDIO_SESSION_REVOKED" }); stop(); socket.close(1008, "session revoked"); });
      expiryTimer = setTimeout(() => { send({ type: "unavailable", code: "CALL_SESSION_EXPIRED" }); stop(); socket.close(1000); }, Math.max(1, attempt.expiresAt*1000-Date.now()));
      socket.on("message", (raw, binary) => {
        try {
          if (!binary) {
            const command = z.object({ type: z.enum(["consent", "stop"]), consent: z.boolean() }).strict().parse(JSON.parse(String(raw)));
            if (!command.consent || command.type === "stop") { stop(); socket.close(1000, "consent withdrawn"); return; }
            if (stt || stopped) throw new Error("STREAM_ALREADY_STARTED");
            for (const [id, budget] of audioAttempts) if (budget.expiresAt <= Date.now()) audioAttempts.delete(id);
            const used = audioAttempts.get(attemptId)?.count ?? 0; if (used >= 3) throw new Error("STT_RECONNECT_LIMIT");
            if (!audioAttempts.has(attemptId) && audioAttempts.size >= 1000) throw new Error("STT_CAPACITY_LIMIT");
            audioAttempts.set(attemptId, { count: used + 1, expiresAt: attempt.expiresAt*1000 });
            if (!process.env.DEEPGRAM_API_KEY || !process.env.DEEPGRAM_MODEL) { send({ type: "unavailable", code: "STT_NOT_CONFIGURED" }); stop(); return; }
            const llm = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? (text: string, policy: typeof record.policy, signal: AbortSignal) => analyzeWithAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.ANTHROPIC_MODEL!, text, policy, signal }) : undefined;
            analyzer = new RevisionAnalyzer(record.policy, event => send({ type: "risk", event }), llm);
            analyzer.start(streamId);
            stt = new DeepgramStream({ apiKey: process.env.DEEPGRAM_API_KEY, model: process.env.DEEPGRAM_MODEL, streamId,
              onReady: () => send({ type: "provider-ready", engine: "deepgram", llm: llm ? "anthropic" : "disabled-rules-only" }),
              onRevision: revision => { send({ type: "revision", revision }); void analyzer!.accept(revision).catch(() => { send({ type: "unavailable", code: "ANALYSIS_LIMIT" }); stop(); }); },
              onUnavailable: code => { send({ type: "unavailable", code }); stop(); } }); stt.connect();
          } else {
            if (stopped || !stt) throw new Error("AUDIO_CONSENT_REQUIRED");
            stt.push(new Uint8Array(raw as Buffer), ++sequence);
          }
        } catch { send({ type: "unavailable", code: "AUDIO_REJECTED_OR_BACKPRESSURE" }); stop(); socket.close(1008); }
      });
      send({ type: "ready", source: "remote-only", persistence: "disabled" });
    } catch { send({ type: "unavailable", code: "AUDIO_UNAUTHORIZED" }); stop(); socket.close(1008); }
  });
  app.post("/v2/authorization-status", async request => {
    const actor = await actorFor(request, true); const body = z.object({ authorizationId: text, nonce: z.string().min(16).max(128) }).strict().parse(request.body);
    const record = await store.read(actor.institutionId); const auth = record.authorizations[body.authorizationId]; const consumed = record.consumptions[body.authorizationId];
    if (!auth || !consumed || ![record.intents[auth.payload.intentId]?.agentId, auth.payload.recipientId].includes(actor.userId)) throw new HttpError(404, "AUTHORIZATION_NOT_FOUND");
    const attempt = record.attempts[auth.payload.attemptId]; const at = Math.floor(Date.now()/1000);
    const payload = { protocol: "callsign", version: 2, networkId: env.NETWORK_ID, registryAddress: env.REGISTRY_ADDRESS, type: "AuthorizationStatus", authorizationId: body.authorizationId, bindingHash: consumed.payload.bindingHash, nonce: body.nonce, status: auth.cancelled || record.status !== "active" || record.credentials[auth.payload.vcDigest]?.revoked !== false || record.intents[auth.payload.intentId]?.status !== "open" || auth.payload.policyHash !== hashCanonical(record.policy) || auth.payload.approvalKeyVersion !== record.approvalKeyVersion ? "cancelled" : attempt?.status === "ended" ? "ended" : "consumed", approvalKeyVersion: record.approvalKeyVersion, issuedAt: at, expiresAt: at + 5 };
    const key = await readSigningKey(resolve(required("ISSUER_KEY_DIRECTORY"), `approval-v${record.approvalKeyVersion}.json`));
    return { jws: await signPayload(payload, key) };
  });
  const registryOperations = async (administrator = false) => new RegistryOperations({ networkId: Number(env.NETWORK_ID), registry: env.REGISTRY_ADDRESS as Hex, institutionId: env.INSTITUTION_ID,
    rpcUrls: required("BESU_NODE_URLS").split(","), operatorKey: (await readFile(required(administrator ? "REGISTRY_ADMIN_KEY_PATH" : "REGISTRY_OPERATOR_KEY_PATH"), "utf8")).trim() as Hex, approvers: required("REGISTRY_APPROVERS").split(",") });
  app.post("/v2/credentials/register-ledger", async request => {
    const actor = await actorFor(request, true); const record = await store.read(actor.institutionId); membership(record, actor, ["institution"]);
    const b = z.object({ vcDigest: z.string().regex(/^[0-9a-f]{64}$/) }).strict().parse(request.body); const item = record.credentials[b.vcDigest];
    if (!item || item.revoked) throw new HttpError(404, "VC_NOT_FOUND");
    return (await registryOperations(true)).grantCredential({ digest: b.vcDigest, epoch: item.vc.credentialStatus.epoch, servicePublicKey: `0x${Buffer.from(item.vc.credentialSubject.publicKey.x, "base64url").toString("hex")}`, validFrom: Math.floor(Date.parse(item.vc.validFrom)/1000), validUntil: Math.floor(Date.parse(item.vc.validUntil)/1000) });
  });
  app.post("/v2/governance/suspend", async request => {
    const actor = await actorFor(request, true); const record = await store.read(actor.institutionId); membership(record, actor, ["institution"]);
    // Offchain suspension takes effect even if the chain write subsequently fails.
    await store.transact(actor.institutionId, async r => { r.status = "suspended"; r.audit.push({ id: randomUUID(), event: "institution.suspended", actor: actor.userId, at: Math.floor(Date.now()/1000), objectId: r.id }); });
    return (await registryOperations()).suspend(record.epoch);
  });
  app.post("/v2/governance/recovery-digest", async request => {
    const actor = await actorFor(request, true); membership(await store.read(actor.institutionId), actor, ["institution", "approver"]);
    const parsed = recoveryV2Schema.parse(request.body);
    return { digest: hashTypedData(recoveryTypedData(Number(env.NETWORK_ID), env.REGISTRY_ADDRESS as Hex, parsed)), profile: "EIP-712-2-of-3", request: parsed };
  });
  app.post("/v2/governance/recover", async request => {
    const actor = await actorFor(request, true); membership(await store.read(actor.institutionId), actor, ["institution", "approver"]);
    const b = z.object({ request: recoveryV2Schema, signatures: z.array(z.string().regex(/^0x[0-9a-fA-F]{130}$/)).min(2).max(3) }).strict().parse(request.body);
    return (await registryOperations()).recover(b.request, b.signatures as Hex[]);
  });
  app.post("/v2/governance/activate-key", async request => {
    const actor = await actorFor(request, true); const b = z.object({ version: z.number().int().positive(), epoch: z.string().regex(/^\d+$/) }).strict().parse(request.body);
    return authority.activateKey(actor, b.version, b.epoch);
  });
  app.post("/v2/intents", async r => authority.createIntent(await actorFor(r, true), r.body));
  app.post("/v2/attempts", async r => { const b = z.object({ intentId: text }).strict().parse(r.body); return authority.createAttempt(await actorFor(r, true), b.intentId); });
  app.post("/v2/credentials", async r => { const b = z.object({ serviceDid: text }).strict().parse(r.body); return authority.issueCredential(await actorFor(r, true), b.serviceDid); });
  app.post("/v2/sender-context", async r => { const b = z.object({ attemptId: text, vcDigest: text, browserPublicKey: publicKeySchema, serviceDid: text }).strict().parse(r.body); return authority.permitContext(await actorFor(r, true), b); });
  app.post("/v2/authorizations", async r => { const b = z.object({ permitJws: text, vcDigest: text }).strict().parse(r.body); return authority.authorize(await actorFor(r, true), b.permitJws, b.vcDigest); });
  app.post("/v2/enroll", async r => { const b = z.object({ sessionId: text, publicKey: publicKeySchema }).strict().parse(r.body); return authority.enroll(await actorFor(r, true), b.sessionId, b.publicKey); });
  app.post("/v2/consume", async r => { const b = z.object({ authorizationId: text, binding: bindingV2Schema, senderProof: text, recipientProof: text, permitJws: text }).strict().parse(r.body); return authority.consume(await actorFor(r, true), b); });
  app.post("/v2/cancel", async r => { const b = z.object({ intentId: text }).strict().parse(r.body); return authority.cancel(await actorFor(r, true), b.intentId); });
  app.post("/v2/end", async r => { const b = z.object({ attemptId: text }).strict().parse(r.body); return authority.end(await actorFor(r, true), b.attemptId); });
  app.post("/v2/revoke", async request => {
    const b = z.object({ vcDigest: text }).strict().parse(request.body); const actor = await actorFor(request, true);
    const result = await authority.revoke(actor, b.vcDigest); const record = await store.read(actor.institutionId);
    try { return { ...result, ...await (await registryOperations(true)).revokeCredential(b.vcDigest, record.epoch), ledgerRevocationRequired: false, ledgerStatus: "confirmed" }; }
    catch { return { ...result, ledgerStatus: "pending", warning: "기관 DB 철회는 반영됐으며 원장 철회는 별도 재시도와 확인이 필요합니다." }; }
  });
  app.get("/v2/state", async r => { const actor = await actorFor(r); const b = z.object({ credentialId: text }).strict().parse(r.query); const record = await store.read(actor.institutionId); if (!record.credentials[b.credentialId]) throw new HttpError(404, "VC_NOT_FOUND"); return aggregateWitnesses({ endpoints: trust.endpoints, institutionId: actor.institutionId, delegationId: b.credentialId, trust }); });
  const officialActorFor = async (request: FastifyRequest) => {
    const actor = await actorFor(request, false, "official");
    if (actor.role !== "recipient") throw new HttpError(403, "OFFICIAL_ROLE_REQUIRED");
    return actor;
  };
  app.get("/v2/official-tasks", async request => {
    const actor = await officialActorFor(request); const record = await store.read(actor.institutionId);
    return { intents: Object.values(record.intents).filter(i => i.recipientId === actor.userId), policy: record.policy };
  });
  app.get("/v2/official/:intentId", async request => {
    const actor = await officialActorFor(request); const { intentId } = z.object({ intentId: text }).parse(request.params);
    const record = await store.read(actor.institutionId); const intent = record.intents[intentId];
    if (!intent || intent.recipientId !== actor.userId) throw new HttpError(404, "INTENT_NOT_FOUND");
    return { intent, policy: record.policy, path: record.policy.followUpPath, separateAuthentication: true };
  });

  return app;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "infrastructure") throw new Error("INFRASTRUCTURE_EXECUTION_BLOCKED");
  const env = finalsEnvironment(process.env); const app = await buildFinalsServer(env);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void app.close(); });
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}
