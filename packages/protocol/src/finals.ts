import { z } from "zod";
import { CompactSign, compactVerify, type JWK, type KeyInput } from "jose";
import { canonicalBytes, hashCanonical, parseJsonNoDuplicateKeys, type SigningKeyPair } from "./index.js";

export const id = z.string().min(3).max(200);
export const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const publicKeySchema = z.object({ kty: z.literal("OKP"), crv: z.literal("Ed25519"), x: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const policySchema = z.object({
  id, version: z.number().int().positive(), purpose: z.literal("FRAUD_CONFIRMATION"),
  allowedQuestions: z.array(z.string().min(1).max(300)).min(1).max(20),
  forbiddenRequests: z.array(z.enum(["OTP", "TRANSFER", "REMOTE_CONTROL", "SECRECY"])).min(1),
  followUpPath: z.literal("/official"),
}).strict();
export type PurposePolicy = z.infer<typeof policySchema>;
export const bankPolicy: PurposePolicy = {
  id: "mock-bank-fds", version: 1, purpose: "FRAUD_CONFIRMATION",
  allowedQuestions: ["본인이 해당 거래를 시도했는지 여부", "거래 시각과 가맹점 확인"],
  forbiddenRequests: ["OTP", "TRANSFER", "REMOTE_CONTROL", "SECRECY"], followUpPath: "/official",
};
const clock = { issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative() };
const base = { protocol: z.literal("callsign"), version: z.literal(2), networkId: id, registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) };
export const permitSchema = z.object({
  ...base, ...clock, type: z.literal("SenderSessionPermit"), institutionId: id, intentId: id, attemptId: id,
  agentId: id, serviceDid: id, serviceKeyVersion: z.number().int().positive(), browserPublicKey: publicKeySchema,
  sessionId: id, policyHash: digest, vcDigest: digest,
}).strict();
export const authorizationV2Schema = z.object({
  ...base, ...clock, type: z.literal("ContactAuthorization"), authorizationId: id, institutionId: id,
  issuerDid: id, approvalKeyVersion: z.number().int().positive(), epoch: z.string().regex(/^\d+$/),
  intentId: id, attemptId: id, recipientId: id, purpose: z.literal("FRAUD_CONFIRMATION"), policyHash: digest,
  vcDigest: digest, permitHash: digest, sessionId: id, browserKeyHash: digest,
}).strict();
export const bindingV2Schema = z.object({
  ...base, ...clock, type: z.literal("SessionBinding"), authorizationHash: digest, sessionId: id,
  recipientId: id, recipientNonce: id, recipientKeyHash: digest,
  gatewayFingerprint: z.string().regex(/^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/),
  receiverFingerprint: z.string().regex(/^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/),
  offerSdpHash: digest, answerSdpHash: digest,
  transportProfile: z.enum(["webrtc-bundle-v2", "pbx-edge-v2"]),
}).strict();
export const possessionSchema = z.object({
  ...base, ...clock, type: z.literal("PossessionProof"), role: z.enum(["sender", "recipient"]),
  authorizationId: id, bindingHash: digest, sessionId: id,
}).strict();
export const receiptV2Schema = z.object({
  ...base, type: z.literal("ConsumptionReceipt"), authorizationId: id, authorizationHash: digest, bindingHash: digest,
  sessionId: id, recipientId: id, approvalKeyVersion: z.number().int().positive(), consumedAt: z.number().int(), expiresAt: z.number().int(),
}).strict();
export type ContactAuthorizationV2 = z.infer<typeof authorizationV2Schema>;
export type SessionPermit = z.infer<typeof permitSchema>;
export type BindingV2 = z.infer<typeof bindingV2Schema>;
export type ReceiptV2 = z.infer<typeof receiptV2Schema>;

// VC 2.0 JSON payload, not the older JWT `vc` claim mapping.
export const delegationVcSchema = z.object({
  "@context": z.tuple([z.literal("https://www.w3.org/ns/credentials/v2"), z.object({ "@vocab": z.literal("urn:callsign:v2:") }).strict()]),
  id: z.string().startsWith("urn:uuid:"), type: z.tuple([z.literal("VerifiableCredential"), z.literal("DelegationCredential")]),
  issuer: id, validFrom: z.iso.datetime(), validUntil: z.iso.datetime(),
  credentialSubject: z.object({ id, institutionId: id, controller: id, serviceKeyVersion: z.number().int().positive(),
    publicKey: publicKeySchema, purpose: z.literal("FRAUD_CONFIRMATION"), policyHash: digest }).strict(),
  credentialStatus: z.object({ id, type: z.literal("CallSignRegistryStatus"), registryAddress: base.registryAddress,
    networkId: id, epoch: z.string().regex(/^\d+$/), approvalKeyVersion: z.number().int().positive() }).strict(),
}).strict();
export type DelegationCredential = z.infer<typeof delegationVcSchema>;
export async function signDelegationVc(vc: DelegationCredential, key: Pick<SigningKeyPair, "privateKey" | "kid">): Promise<string> {
  return new CompactSign(canonicalBytes(delegationVcSchema.parse(vc)))
    .setProtectedHeader({ alg: "EdDSA", typ: "vc+jwt", cty: "vc", kid: key.kid }).sign(key.privateKey);
}
export async function verifyDelegationVc(jws: string, key: KeyInput, kid: string): Promise<DelegationCredential> {
  if (jws.length > 32768) throw new Error("MESSAGE_TOO_LARGE");
  const result = await compactVerify(jws, key, { algorithms: ["EdDSA"] });
  if (result.protectedHeader.typ !== "vc+jwt" || result.protectedHeader.cty !== "vc" || result.protectedHeader.kid !== kid) throw new Error("VC_HEADER_MISMATCH");
  return delegationVcSchema.parse(parseJsonNoDuplicateKeys(result.payload));
}
export function vcDigest(vc: DelegationCredential): string { return hashCanonical(delegationVcSchema.parse(vc)); }
export function policyHash(policy: PurposePolicy): string { return hashCanonical(policySchema.parse(policy)); }
export function assertPublicKey(key: JWK): void { publicKeySchema.parse(key); }
export const channelChallengeSchema = z.object({ type: z.literal("ChannelChallenge"), version: z.literal(2), role: z.enum(["sender", "recipient"]), bindingHash: digest, receiverNonce: z.string().min(16).max(128), gatewayNonce: z.string().min(16).max(128) }).strict();
export const authorizationStatusSchema = z.object({ ...base, ...clock, type: z.literal("AuthorizationStatus"), authorizationId: id, bindingHash: digest, nonce: id, status: z.enum(["consumed", "cancelled", "ended"]), approvalKeyVersion: z.number().int().positive() }).strict();
