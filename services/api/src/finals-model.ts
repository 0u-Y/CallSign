import { z } from "zod";
import { bankPolicy, hashCanonical, policyHash, type PurposePolicy, type ContactAuthorizationV2, type DelegationCredential, type ReceiptV2 } from "@callsign/protocol";
import type { JWK } from "jose";
import { HttpError } from "./auth.js";

export interface Actor { userId: string; role: string; institutionId: string; serviceDid?: string; membershipGeneration?:number }
export interface ContactIntent { id: string; institutionId: string; recipientId: string; agentId: string; serviceDid: string; purpose: "FRAUD_CONFIRMATION"; policyHash: string; expiresAt: number; status: "open" | "cancelled" | "completed"; source: "mock-crm-fds" }
export interface CallAttempt { id: string; intentId: string; sessionId: string; agentId: string; status: "created" | "authorized" | "consumed" | "cancelled" | "ended"; expiresAt: number }
export interface InstitutionRecord {
  authorityCheckpointVersion?:1;
  institutionUri?: string;
  observedEpoch?:string;
  registrationOperation?:string;
  registrationState?:"pending"|"failed"|"confirmed";
  directory?:{hash:string;version:number;entries:import("./configuration.js").ConfigurationContents["directory"]};
  configurationProposals?:Record<string,import("./configuration.js").ConfigurationProposal>;
  recovery?:{hash:string;request:unknown;signatures:Record<string,string>;submitted:boolean};
  serviceV3?: import("./service-state.js").ServiceState;
  pendingEvents?: Array<{ id: string; kind: string; objectId: string; at: number; payload: unknown }>;
  pendingUsage?: Array<{ key: string; units: number; limit: number; expiresAt: number }>;
  id: string; did: string; epoch: string; approvalKeyVersion: number; approvalKid: string; approvalPublicKey: JWK; status: "active" | "suspended";
  policy: PurposePolicy;
  services: Record<string, { did: string; kid: string; publicKey: JWK; keyVersion: number; active: boolean }>;
  members: Record<string, { role: "institution" | "gateway" | "recipient" | "approver"; serviceDid?: string; permissions?: string[]; active?:boolean; sessionGeneration?:number }>;
  intents: Record<string, ContactIntent>; attempts: Record<string, CallAttempt>;
  credentials: Record<string, { vc: DelegationCredential; jws: string; revoked: boolean }>;
  authorizations: Record<string, { payload: ContactAuthorizationV2; jws: string; cancelled: boolean }>;
  consumptions: Record<string, { payload: ReceiptV2; jws: string }>;
  recipientKeys: Record<string, { userId: string; publicKey: JWK; expiresAt: number }>;
  audit: Array<{ id: string; event: string; actor: string; at: number; objectId: string }>;
}
export interface AuthorityStore {
  read(institutionId: string): Promise<InstitutionRecord>;
  transact<T>(institutionId: string, operation: (record: InstitutionRecord) => Promise<T>): Promise<T>;
  manageAccount?(institutionId:string,actorId:string,requestId:string,input:unknown):Promise<unknown>;
}
// Calls, indexer observations and directory labels are not authority metadata.
export function authorityStateHash(r:InstitutionRecord){return hashCanonical({epoch:r.epoch,approvalKeyVersion:r.approvalKeyVersion,approvalKid:r.approvalKid,approvalPublicKey:r.approvalPublicKey,members:r.members,services:r.services,policy:r.policy});}
export function membership(record: InstitutionRecord, actor: Actor, roles: string[]): void {
  if (record.id !== actor.institutionId || !roles.includes(actor.role) || record.members[actor.userId]?.role !== actor.role || record.members[actor.userId]?.active===false||(actor.membershipGeneration!==undefined&&actor.membershipGeneration!==(record.members[actor.userId]?.sessionGeneration??0))) throw new HttpError(403, "OBJECT_FORBIDDEN");
}
export function activeIntent(record: InstitutionRecord, intentId: string, actor: Actor, now: number): ContactIntent {
  membership(record, actor, ["gateway", "institution", "recipient"]);
  const intent = record.intents[intentId];
  if (!intent || intent.institutionId !== record.id || (actor.role === "gateway" && (intent.agentId !== actor.userId || record.members[actor.userId]?.serviceDid !== intent.serviceDid)) || (actor.role === "recipient" && intent.recipientId !== actor.userId)) throw new HttpError(404, "INTENT_NOT_FOUND");
  if (record.status !== "active" || intent.status !== "open" || now >= intent.expiresAt || intent.policyHash !== policyHash(record.policy)) throw new HttpError(409, "INTENT_NOT_ACTIVE");
  return intent;
}

export function workspaceFor(record: InstitutionRecord, actor: Actor) {
  membership(record, actor, ["institution", "gateway", "recipient", "approver"]);
  const intents = Object.values(record.intents).filter(intent => intent.institutionId === record.id && (
    actor.role === "institution" || (actor.role === "gateway"
      ? intent.agentId === actor.userId && record.members[actor.userId]?.serviceDid === intent.serviceDid
      : actor.role === "recipient" && intent.recipientId === actor.userId)
  ));
  const intentIds = new Set(intents.map(intent => intent.id));
  const attempts = Object.values(record.attempts).filter(attempt => intentIds.has(attempt.intentId) && record.intents[attempt.intentId]?.agentId === attempt.agentId);
  const attemptIds = new Set(attempts.map(attempt => attempt.id));
  const authorizations = Object.values(record.authorizations).filter(({ payload }) => payload.institutionId === record.id && intentIds.has(payload.intentId) && attemptIds.has(payload.attemptId) && record.intents[payload.intentId]?.recipientId === payload.recipientId);
  const credentialIds = new Set(authorizations.map(auth => auth.payload.vcDigest));
  const assignedServices = new Set(intents.map(intent => intent.serviceDid));
  const credentials = Object.entries(record.credentials).filter(([digest, item]) => (
    actor.role === "institution" || (actor.role === "gateway"
      ? assignedServices.has(item.vc.credentialSubject.id)
      : actor.role === "recipient" && credentialIds.has(digest))
  )).map(([digest, item]) => ({ digest, ...item }));
  return { actor, policy: record.policy, intents, authorizations, credentials,
    services: actor.role === "institution" ? Object.keys(record.services) : [],
    attempts,
  };
}

export function liveAttemptFor(record: InstitutionRecord, actor: Actor, attemptId: string, now: number, consumedOnly = false) {
  membership(record, actor, ["gateway", "recipient"]);
  const attempt = record.attempts[attemptId];
  if (!attempt || attempt.expiresAt <= now || ["cancelled", "ended"].includes(attempt.status) || (consumedOnly && attempt.status !== "consumed")) throw new HttpError(403, "CALL_CONTEXT_INVALID");
  const intent = activeIntent(record, attempt.intentId, actor, now);
  const service = record.services[intent.serviceDid];
  if (!service?.active || attempt.agentId !== intent.agentId) throw new HttpError(403, "CALL_CONTEXT_INVALID");
  if (attempt.status !== "created") {
    const auth = Object.values(record.authorizations).find(item => item.payload.attemptId === attempt.id);
    const credential = auth && record.credentials[auth.payload.vcDigest];
    if (!auth || auth.cancelled || auth.payload.institutionId !== record.id || auth.payload.recipientId !== intent.recipientId || auth.payload.policyHash !== intent.policyHash || auth.payload.epoch !== record.epoch || auth.payload.approvalKeyVersion !== record.approvalKeyVersion || auth.payload.expiresAt <= now || !credential || credential.revoked) throw new HttpError(403, "CALL_AUTHORIZATION_INVALID");
    const vc = credential.vc;
    const from = Date.parse(vc.validFrom)/1000, until = Date.parse(vc.validUntil)/1000;
    if (!Number.isFinite(from) || !Number.isFinite(until) || now < from || now >= until || vc.credentialSubject.id !== intent.serviceDid || vc.credentialSubject.serviceKeyVersion !== service.keyVersion || vc.credentialSubject.policyHash !== intent.policyHash || vc.credentialStatus.epoch !== record.epoch || vc.credentialStatus.approvalKeyVersion !== record.approvalKeyVersion) throw new HttpError(403, "CALL_AUTHORIZATION_INVALID");
  }
  return { attempt, intent };
}
export const mockFdsSchema = z.object({ id: z.string().min(3).max(100), recipientId: z.string().min(3).max(200), agentId: z.string().min(3).max(200), serviceDid: z.string().min(3).max(200), expiresAt: z.number().int().positive() }).strict();
export function importMockFds(record: InstitutionRecord, actor: Actor, input: unknown, now: number): ContactIntent {
  membership(record, actor, ["institution"]);
  const body = mockFdsSchema.parse(input);
  if (record.status !== "active" || record.intents[body.id] || body.expiresAt <= now || body.expiresAt > now + 86400 || (record.members[body.recipientId]?.role !== "recipient" || record.members[body.recipientId]?.active===false) || (record.members[body.agentId]?.role !== "gateway" || record.members[body.agentId]?.active===false) || record.members[body.agentId]?.serviceDid !== body.serviceDid || !record.services[body.serviceDid]?.active) throw new HttpError(409, "FDS_ASSIGNMENT_INVALID");
  const intent: ContactIntent = { ...body, institutionId: record.id, purpose: bankPolicy.purpose, policyHash: policyHash(record.policy), status: "open", source: "mock-crm-fds" };
  record.intents[intent.id] = intent;
  return intent;
}

export const provisioningAccountsSchema = z.array(z.object({ id: z.string().min(3).max(200), displayName: z.string().min(1).max(100), role: z.enum(["institution", "gateway", "recipient", "approver"]), permissions:z.array(z.enum(["contact.manage","delegation.manage","institution.suspend","institution.recover","key.activate","governance.approve"])).default([]) }).strict()).min(3).max(100);

export function requirePermission(record:InstitutionRecord,actor:Actor,permission:string){
  membership(record,actor,["institution","approver"]);
  if(!record.members[actor.userId]?.permissions?.includes(permission))throw new HttpError(403,"PERMISSION_REQUIRED");
}

export function assertInitialAccounts(input:unknown,issuer:string){
 const accounts=provisioningAccountsSchema.parse(input);
 if(!issuer||issuer.includes('|')||new Set(accounts.map(a=>a.id)).size!==accounts.length||accounts.some(a=>!a.id.startsWith(`${issuer}|`)||a.id.length<=issuer.length+1||(['gateway','recipient'].includes(a.role)&&a.permissions.length)||(a.role!=='approver'&&a.permissions.includes('governance.approve'))))throw new HttpError(400,'BOOTSTRAP_IDENTITY_OR_ROLE_INVALID');
 if(!['gateway','recipient'].every(role=>accounts.some(a=>a.role===role))||!accounts.some(a=>a.role==='institution'&&['contact.manage','delegation.manage','institution.suspend','institution.recover','key.activate'].every(p=>a.permissions.includes(p as typeof a.permissions[number])))||!accounts.some(a=>a.role==='approver'&&a.permissions.includes('governance.approve')))throw new HttpError(400,'BOOTSTRAP_MANAGER_AND_APPROVER_REQUIRED');
 return accounts;
}
