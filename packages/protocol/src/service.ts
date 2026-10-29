import { z } from "zod";
import { CompactSign, compactVerify, type KeyInput } from "jose";
import { canonicalBytes, hashCanonical, parseJsonNoDuplicateKeys, type SigningKeyPair } from "./index.js";
import { id, digest, publicKeySchema, policySchema } from "./finals.js";

export const registeredUriSchema = z.string().min(5).max(300).refine(value => /^(https:\/\/[^\s@?#]+|urn:[a-zA-Z0-9:._-]+|did:[a-zA-Z0-9:._-]+)$/.test(value), "Registered identity URI required");
export const serviceBase = { protocol: z.literal("callsign"), version: z.literal(3), networkId: id, registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) };
const time = { issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() };
export const callProfileSchema = z.enum(["direct-webrtc-v3", "asterisk-webrtc-v3"]);
export const outcomeSchema = z.enum(["ended", "declined", "no-answer", "failed", "cancelled"]);
export const serviceVcSchema = z.object({
  "@context": z.tuple([z.literal("https://www.w3.org/ns/credentials/v2"), z.object({ "@vocab": z.literal("urn:callsign:delegation:v1:") }).strict()]),
  id: z.string().startsWith("urn:uuid:"), type: z.tuple([z.literal("VerifiableCredential"), z.literal("CallCenterDelegation")]),
  issuer: registeredUriSchema, validFrom: z.iso.datetime(), validUntil: z.iso.datetime(),
  credentialSubject: z.object({ id: registeredUriSchema, institutionId: id, publicKey: publicKeySchema, keyVersion: z.number().int().positive(), scope: policySchema }).strict(),
  credentialStatus: z.object({ id, type: z.literal("CallSignRegistryStatus"), networkId: id, registryAddress: serviceBase.registryAddress, epoch: z.string().regex(/^\d+$/), approvalKeyVersion: z.number().int().positive() }).strict(),
}).strict();
export type ServiceCredential = z.infer<typeof serviceVcSchema>;
export async function signServiceCredential(value: ServiceCredential, key: Pick<SigningKeyPair, "privateKey" | "kid">) {
  return new CompactSign(canonicalBytes(serviceVcSchema.parse(value))).setProtectedHeader({ alg: "EdDSA", typ: "vc+jwt", cty: "vc", kid: key.kid }).sign(key.privateKey);
}
export async function verifyServiceCredential(jws: string, key: KeyInput, kid: string) {
  if (jws.length > 32768) throw new Error("MESSAGE_TOO_LARGE");
  const value = await compactVerify(jws, key, { algorithms: ["EdDSA"] });
  if (value.protectedHeader.typ !== "vc+jwt" || value.protectedHeader.cty !== "vc" || value.protectedHeader.kid !== kid) throw new Error("VC_HEADER_MISMATCH");
  return serviceVcSchema.parse(parseJsonNoDuplicateKeys(value.payload));
}
export const serviceCredentialDigest = (value: ServiceCredential) => hashCanonical(serviceVcSchema.parse(value));
export const serviceProofSchema = z.object({ ...serviceBase, ...time, type: z.literal("CallCenterProof"), challengeId: id, nonce: id, institutionId: id, intentId: id, attemptId: id, sessionId: id, agentId: id, serviceUri: registeredUriSchema, serviceKeyVersion: z.number().int().positive(), browserPublicKey: publicKeySchema, vcDigest: digest, policyHash: digest, callProfile: callProfileSchema }).strict();
export const startAuthorizationSchema = z.object({ ...serviceBase, type: z.literal("ContactStartAuthorization"), authorizationId: id, institutionId: id, institutionUri: registeredUriSchema, intentId: id, attemptId: id, sessionId: id, agentId: id, recipientId: id, serviceUri: registeredUriSchema, serviceKeyVersion: z.number().int().positive(), approvalKeyVersion: z.number().int().positive(), epoch: z.string().regex(/^\d+$/), nonce: id, browserKeyHash: digest, serviceProofHash: digest, vcDigest: digest, policyHash: digest, purpose: z.literal("FRAUD_CONFIRMATION"), callProfile: callProfileSchema, issuedAt: z.number().int(), firstConsumeBy: z.number().int(), callEndBy: z.number().int() }).strict();
export const serviceBindingSchema = z.object({ ...serviceBase, ...time, type: z.literal("ServiceSessionBinding"), authorizationHash: digest, sessionId: id, connectionGeneration: id, recipientId: id, recipientNonce: z.string().min(16).max(128), recipientKeyHash: digest, senderSdpHash: digest, recipientSdpHash: digest, senderFingerprint: z.string().min(64).max(100), recipientFingerprint: z.string().min(64).max(100), callProfile: callProfileSchema }).strict();
export const servicePossessionSchema = z.object({ ...serviceBase, ...time, type: z.literal("ServicePossession"), role: z.enum(["sender", "recipient"]), authorizationId: id, sessionId: id, bindingHash: digest, nonce: id }).strict();
export const serviceReceiptSchema = z.object({ ...serviceBase, type: z.literal("ServiceConsumptionReceipt"), institutionId: id, authorizationId: id, authorizationHash: digest, bindingHash: digest, sessionId: id, recipientId: id, consumedAt: z.number().int(), recoverUntil: z.number().int() }).strict();
export const serviceLeaseSchema = z.object({ ...serviceBase, ...time, type: z.literal("CallLease"), institutionId: id, authorizationId: id, bindingHash: digest, sessionId: id, connectionGeneration: id, epoch: z.string(), approvalKeyVersion: z.number().int().positive(), policyHash: digest, vcDigest: digest, sequence: z.number().int().positive(), nonce: id, authority: z.enum(["current", "unavailable"]), callEndBy: z.number().int() }).strict();
export const renewalProofSchema = z.object({ ...serviceBase, ...time, type: z.literal("LeaseRenewalProof"), role: z.enum(["sender", "recipient"]), authorizationId: id, sessionId: id, bindingHash: digest, priorLeaseHash: digest, sequence: z.number().int().positive(), nonce: id }).strict();
export const pbxEvidenceSchema = z.object({ ...serviceBase, ...time, type: z.literal("AsteriskSessionEvidence"), pbxFingerprintSource:z.literal('configured-certificate'), institutionId: id, authorizationId: id, attemptId: id, sessionId: id, bindingHash: digest, connectionGeneration: id, bridgeId: id, senderChannelId: id, recipientChannelId: id, senderCallId: id, recipientCallId: id, senderEndpoint: id, recipientEndpoint: id, senderSdpHash: digest, recipientSdpHash: digest, senderFingerprint: z.string().min(64).max(100), recipientFingerprint: z.string().min(64).max(100), recipientNonce: id, senderPbxFingerprint:z.string().min(64).max(100),recipientPbxFingerprint:z.string().min(64).max(100), evidenceSequence: z.number().int().positive(), state: z.enum(["prepared", "bridged", "ended"]) }).strict();
export type StartAuthorization = z.infer<typeof startAuthorizationSchema>;
export type ServiceBinding = z.infer<typeof serviceBindingSchema>;
export type ServiceProof = z.infer<typeof serviceProofSchema>;
export type ServiceReceipt = z.infer<typeof serviceReceiptSchema>;
export type CallLease = z.infer<typeof serviceLeaseSchema>;
export type PbxEvidence = z.infer<typeof pbxEvidenceSchema>;
export const servicePolicy = Object.freeze({ startSeconds: 120, leaseSeconds: 30, observedStateAgeSeconds: 8, eachClockSkewSeconds: 1, maxCallSeconds: 14400, pollingMs: 1000 });
export const pbxReportSchema = z.object({ ...serviceBase, ...time, type:z.literal('PbxBrowserReport'), role:z.enum(['sender','recipient']), attemptId:id, sessionId:id, connectionGeneration:id, callId:id, localSdp:z.string().min(1).max(16384), remoteSdp:z.string().min(1).max(16384), recipientNonce:id }).strict();

export const runtimePolicySchema = z.object({
  startSeconds: z.literal(120).default(120), leaseSeconds: z.number().int().min(10).max(120).default(30),
  maxCallSeconds: z.number().int().min(120).max(28800).default(14400),
  observedStateAgeSeconds: z.literal(8).default(8), eachClockSkewSeconds: z.literal(1).default(1), pollingMs: z.literal(1000).default(1000),
}).strict();
export type RuntimePolicy = z.infer<typeof runtimePolicySchema>;
