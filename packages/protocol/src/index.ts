import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { CompactSign, compactVerify, exportJWK, generateKeyPair, importJWK, type JWK, type KeyInput } from "jose";
import { canonicalize } from "json-canonicalize";
import * as duplicateKeyJson from "json-dup-key-validator";
import { z } from "zod";

export const PROTOCOL = "callsign" as const;
export const PROTOCOL_VERSION = 1 as const;
export const MAX_SIGNED_MESSAGE_BYTES = 32 * 1024;

const safeUnixSeconds = z.number().int().nonnegative().safe();
const identifier = z.string().min(16).max(128);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const decimalInteger = z.string().regex(/^(0|[1-9][0-9]*)$/);
const base = {
  protocol: z.literal(PROTOCOL),
  version: z.literal(PROTOCOL_VERSION),
  networkId: decimalInteger,
  registryAddress: address,
};

export const contactAuthorizationSchema = z.object({
  ...base,
  type: z.literal("ContactAuthorization"),
  authorizationId: identifier,
  institutionId: identifier,
  epoch: decimalInteger,
  delegationId: identifier,
  recipientId: identifier,
  purposeCode: z.enum(["CIVIL_REPLY", "DOCUMENT_SUPPLEMENT"]),
  officialTaskOpaqueId: identifier,
  issuedAt: safeUnixSeconds,
  notBefore: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

export const enrollmentProofSchema = z.object({
  ...base,
  type: z.literal("EnrollmentProof"),
  recipientId: identifier,
  recipientSessionPublicKey: z.string().min(32).max(128),
  issuedAt: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

export const recipientChallengeSchema = z.object({
  ...base,
  type: z.literal("RecipientChallenge"),
  recipientId: identifier,
  recipientSessionPublicKey: z.string().min(32).max(128),
  enrollmentProof: z.string().min(32).max(MAX_SIGNED_MESSAGE_BYTES),
  sessionId: identifier,
  recipientNonce: identifier,
  issuedAt: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

const fingerprint = z.string().regex(/^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/);
const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

export const sessionBindingSchema = z.object({
  ...base,
  type: z.literal("SessionBinding"),
  authorizationHash: sha256Hex,
  sessionId: identifier,
  institutionId: identifier,
  epoch: decimalInteger,
  delegationId: identifier,
  recipientId: identifier,
  recipientNonce: identifier,
  recipientSessionKeyHash: sha256Hex,
  gatewayFingerprint: fingerprint,
  receiverFingerprint: fingerprint,
  fingerprintAlgorithm: z.literal("sha-256"),
  transportProfile: z.literal("webrtc-bundle-v1"),
  offerSdpHash: sha256Hex,
  answerSdpHash: sha256Hex,
  issuedAt: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

export const consumptionReceiptSchema = z.object({
  ...base,
  type: z.literal("ConsumptionReceipt"),
  authorizationId: identifier,
  authorizationHash: sha256Hex,
  bindingHash: sha256Hex,
  recipientId: identifier,
  sessionId: identifier,
  consumedAt: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

export const gatewayConsumeRequestSchema = z.object({
  ...base,
  type: z.literal("GatewayConsumeRequest"),
  role: z.literal("gateway"),
  authorizationId: identifier,
  authorizationHash: sha256Hex,
  bindingHash: sha256Hex,
  recipientChallengeHash: sha256Hex,
  sessionId: identifier,
  issuedAt: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

export const sessionProofSchema = z.object({
  ...base,
  type: z.literal("SessionProof"),
  role: z.literal("gateway"),
  bindingHash: sha256Hex,
  consumptionReceiptHash: sha256Hex,
  binding: sessionBindingSchema,
  issuedAt: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

export const transportTranscriptSchema = z.object({
  ...base,
  type: z.literal("TransportTranscript"),
  role: z.enum(["gateway", "receiver"]),
  bindingHash: sha256Hex,
  receiverNonce: identifier,
  gatewayNonce: identifier,
  issuedAt: safeUnixSeconds,
  expiresAt: safeUnixSeconds,
}).strict();

export type ContactAuthorization = z.infer<typeof contactAuthorizationSchema>;
export type EnrollmentProof = z.infer<typeof enrollmentProofSchema>;
export type RecipientChallenge = z.infer<typeof recipientChallengeSchema>;
export type SessionBinding = z.infer<typeof sessionBindingSchema>;
export type ConsumptionReceipt = z.infer<typeof consumptionReceiptSchema>;
export type GatewayConsumeRequest = z.infer<typeof gatewayConsumeRequestSchema>;
export type SessionProof = z.infer<typeof sessionProofSchema>;
export type TransportTranscript = z.infer<typeof transportTranscriptSchema>;
export type ProtocolPayload = ContactAuthorization | EnrollmentProof | RecipientChallenge | SessionBinding | ConsumptionReceipt | GatewayConsumeRequest | SessionProof | TransportTranscript;

export interface SigningKeyPair {
  privateKey: KeyInput;
  publicKey: KeyInput;
  publicJwk: JWK;
  kid: string;
}

export function randomId(prefix: string): string {
  return `${prefix}_${bytesToHex(randomBytes(16))}`;
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

export function hashCanonical(value: unknown): string {
  return bytesToHex(sha256(canonicalBytes(value)));
}

export function hashSdp(sdp: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(sdp.replace(/\r?\n/g, "\r\n"))));
}

export function normalizeFingerprint(input: string): string {
  const compact = input.trim().replace(/^sha-256\s+/i, "").replace(/[:-]/g, "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(compact)) {
    throw new Error("INVALID_SHA256_FINGERPRINT");
  }
  return compact.match(/.{2}/g)!.join(":");
}

export function extractSingleSdpFingerprint(sdp: string): string {
  const values = [...sdp.matchAll(/^a=fingerprint:sha-256\s+([^\r\n]+)$/gim)].map((match) => normalizeFingerprint(match[1]!));
  const unique = [...new Set(values)];
  if (unique.length !== 1) {
    throw new Error(unique.length === 0 ? "MISSING_SHA256_FINGERPRINT" : "CONFLICTING_SHA256_FINGERPRINTS");
  }
  return unique[0]!;
}

export function parseJsonNoDuplicateKeys(raw: Uint8Array | string): unknown {
  const text = typeof raw === "string" ? raw : new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (new TextEncoder().encode(text).byteLength > MAX_SIGNED_MESSAGE_BYTES) {
    throw new Error("MESSAGE_TOO_LARGE");
  }
  const error = duplicateKeyJson.validate(text, false);
  if (error) {
    throw new Error(`INVALID_JSON:${error}`);
  }
  return duplicateKeyJson.parse(text, false);
}

export async function generateEd25519KeyPair(): Promise<SigningKeyPair> {
  const keys = await generateKeyPair("Ed25519", { extractable: true });
  const publicJwk = await exportJWK(keys.publicKey);
  const raw = base64urlToBytes(publicJwk.x!);
  const kid = bytesToBase64url(sha256(raw)).slice(0, 22);
  return { ...keys, publicJwk, kid };
}

export async function importEd25519PublicJwk(jwk: JWK): Promise<KeyInput> {
  return importJWK(jwk, "EdDSA");
}

export async function signPayload(payload: ProtocolPayload | Record<string, unknown>, key: Pick<SigningKeyPair, "privateKey" | "kid">): Promise<string> {
  const typ = `callsign/${String(payload.type)}+jws`;
  return new CompactSign(canonicalBytes(payload))
    .setProtectedHeader({ alg: "EdDSA", typ, kid: key.kid })
    .sign(key.privateKey);
}

export async function verifyPayload<T>(
  jws: string,
  publicKey: KeyInput,
  expected: { type: string; kid: string; schema: z.ZodType<T> },
): Promise<T> {
  if (new TextEncoder().encode(jws).byteLength > MAX_SIGNED_MESSAGE_BYTES) {
    throw new Error("MESSAGE_TOO_LARGE");
  }
  const result = await compactVerify(jws, publicKey, { algorithms: ["EdDSA"] });
  const protectedHeader = result.protectedHeader;
  if (protectedHeader.alg !== "EdDSA" || protectedHeader.typ !== `callsign/${expected.type}+jws` || protectedHeader.kid !== expected.kid) {
    throw new Error("INVALID_PROTECTED_HEADER");
  }
  const parsed = parseJsonNoDuplicateKeys(result.payload);
  const value = expected.schema.parse(parsed);
  if ((value as { type?: string }).type !== expected.type) {
    throw new Error("TYPE_CONFUSION");
  }
  return value;
}

export function assertTemporalValidity(value: { issuedAt: number; expiresAt: number; notBefore?: number }, nowSeconds: number): void {
  if (!Number.isSafeInteger(nowSeconds)) throw new Error("INVALID_CLOCK");
  if (value.expiresAt <= value.issuedAt) throw new Error("INVALID_TIME_ORDER");
  if (value.notBefore !== undefined && value.notBefore < value.issuedAt) throw new Error("INVALID_TIME_ORDER");
  if (value.notBefore !== undefined && nowSeconds < value.notBefore) throw new Error("NOT_YET_VALID");
  if (nowSeconds >= value.expiresAt) throw new Error("EXPIRED");
}

function base64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function bytesToBase64url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
