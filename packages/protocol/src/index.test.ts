import { CompactSign } from "jose";
import { describe, expect, it } from "vitest";
import {
  PROTOCOL,
  PROTOCOL_VERSION,
  assertTemporalValidity,
  contactAuthorizationSchema,
  extractSingleSdpFingerprint,
  generateEd25519KeyPair,
  normalizeFingerprint,
  parseJsonNoDuplicateKeys,
  randomId,
  signPayload,
  verifyPayload,
  type ContactAuthorization,
} from "./index.js";

const now = 1_800_000_000;

function authorization(): ContactAuthorization {
  return {
    protocol: PROTOCOL,
    version: PROTOCOL_VERSION,
    type: "ContactAuthorization",
    networkId: "20260914",
    registryAddress: "0x1111111111111111111111111111111111111111",
    authorizationId: randomId("auth"),
    institutionId: randomId("inst"),
    epoch: "1",
    delegationId: randomId("delegation"),
    recipientId: randomId("recipient"),
    purposeCode: "DOCUMENT_SUPPLEMENT",
    officialTaskOpaqueId: randomId("task"),
    issuedAt: now,
    notBefore: now,
    expiresAt: now + 600,
  };
}

describe("signed protocol objects", () => {
  it("round-trips an Ed25519 JCS payload and rejects one-field tampering", async () => {
    const key = await generateEd25519KeyPair();
    const payload = authorization();
    const signed = await signPayload(payload, key);
    const verified = await verifyPayload(signed, key.publicKey, { type: payload.type, kid: key.kid, schema: contactAuthorizationSchema });
    expect(verified).toEqual(payload);

    const parts = signed.split(".");
    const changed = { ...payload, recipientId: randomId("recipient") };
    parts[1] = Buffer.from(JSON.stringify(changed)).toString("base64url");
    await expect(verifyPayload(parts.join("."), key.publicKey, { type: payload.type, kid: key.kid, schema: contactAuthorizationSchema })).rejects.toThrow();
  });

  it("rejects none/role confusion in protected headers", async () => {
    const key = await generateEd25519KeyPair();
    const payload = authorization();
    const wrongType = await new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
      .setProtectedHeader({ alg: "EdDSA", typ: "callsign/SessionProof+jws", kid: key.kid })
      .sign(key.privateKey);
    await expect(verifyPayload(wrongType, key.publicKey, { type: payload.type, kid: key.kid, schema: contactAuthorizationSchema })).rejects.toThrow("INVALID_PROTECTED_HEADER");
  });

  it("rejects duplicate keys before object parsing and oversized JSON", () => {
    expect(() => parseJsonNoDuplicateKeys('{"type":"a","type":"b"}')).toThrow("INVALID_JSON");
    expect(() => parseJsonNoDuplicateKeys(`{"x":"${"a".repeat(33 * 1024)}"}`)).toThrow("MESSAGE_TOO_LARGE");
  });

  it("applies time boundaries exactly", () => {
    const payload = authorization();
    expect(() => assertTemporalValidity(payload, payload.notBefore)).not.toThrow();
    expect(() => assertTemporalValidity(payload, payload.expiresAt)).toThrow("EXPIRED");
  });
});

describe("WebRTC canonical transport fields", () => {
  const fingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join(":");

  it("normalizes a SHA-256 fingerprint", () => {
    expect(normalizeFingerprint(`sha-256 ${fingerprint.toLowerCase()}`)).toBe(fingerprint.toUpperCase());
  });

  it("requires one consistent SDP fingerprint", () => {
    const sdp = `v=0\r\na=fingerprint:sha-256 ${fingerprint}\r\n`;
    expect(extractSingleSdpFingerprint(sdp)).toBe(fingerprint.toUpperCase());
    expect(() => extractSingleSdpFingerprint(`${sdp}a=fingerprint:sha-256 ${"FF:".repeat(31)}FF\r\n`)).toThrow("CONFLICTING_SHA256_FINGERPRINTS");
  });
});
