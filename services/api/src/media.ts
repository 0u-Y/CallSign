import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { hashCanonical } from "@callsign/protocol";

export function turnCredentials(input: { urls: string[]; secret: string; sessionId: string; userId: string; now: number; ttl?: number }) {
  if (input.secret.length < 32 || input.urls.length === 0 || input.urls.some(u => !/^turns?:[a-zA-Z0-9.-]+:\d+(\?transport=(udp|tcp))?$/.test(u))) throw new Error("TURN_CONFIGURATION_INVALID");
  const ttl = Math.min(300, Math.max(30, input.ttl ?? 120));
  const username = `${input.now + ttl}:${hashCanonical({ sessionId: input.sessionId, userId: input.userId }).slice(0, 24)}`;
  return { iceServers: [{ urls: input.urls, username, credential: createHmac("sha1", input.secret).update(username).digest("base64") }], expiresAt: input.now + ttl };
}
export const pbxLegSchema = z.object({
  version: z.literal(2), type: z.literal("PbxLegMapping"), edgeId: z.string().min(1).max(100),
  attemptId: z.string().min(3), sessionId: z.string().min(3), bindingHash: z.string().regex(/^[0-9a-f]{64}$/),
  channelId: z.string().min(1).max(200), bridgeId: z.string().min(1).max(200),
  endpoint: z.literal("media-edge"), issuedAt: z.number().int(), expiresAt: z.number().int(),
}).strict();
export type PbxLeg = z.infer<typeof pbxLegSchema>;
export function verifyPbxMapping(input: { raw: string; mac: string; secret: string; expected: { sessionId: string; attemptId: string; bindingHash: string; edgeId: string }; now: number }): PbxLeg {
  if (input.raw.length > 8192 || input.secret.length < 32) throw new Error("PBX_MAPPING_INVALID");
  const expectedMac = createHmac("sha256", input.secret).update(input.raw).digest("hex");
  if (!/^[0-9a-f]{64}$/.test(input.mac) || !timingSafeEqual(Buffer.from(expectedMac), Buffer.from(input.mac))) throw new Error("PBX_MAPPING_SIGNATURE_INVALID");
  const leg = pbxLegSchema.parse(JSON.parse(input.raw));
  if (leg.issuedAt > input.now || leg.expiresAt <= input.now || leg.expiresAt - leg.issuedAt > 60 || Object.entries(input.expected).some(([k,v]) => leg[k as keyof PbxLeg] !== v)) throw new Error("PBX_MAPPING_CONTEXT_INVALID");
  return leg;
}
export class AsteriskAdapter {
  constructor(private readonly base: URL, private readonly credentials: string, private readonly fetcher: typeof fetch = fetch) {
    if (base.protocol !== "https:" || base.username || base.password) throw new Error("ARI_HTTPS_REQUIRED");
  }
  async originate(input: { endpoint: string; mapping: PbxLeg; application: string; signal?: AbortSignal }) {
    const mapping = pbxLegSchema.parse(input.mapping);
    if (!/^PJSIP\/[a-zA-Z0-9_-]+$/.test(input.endpoint) || !/^[a-zA-Z0-9_-]+$/.test(input.application)) throw new Error("ARI_ENDPOINT_FORBIDDEN");
    const url = new URL("/ari/channels", this.base);
    url.searchParams.set("endpoint", input.endpoint); url.searchParams.set("app", input.application); url.searchParams.set("channelId", mapping.channelId);
    const response = await this.fetcher(url, { method: "POST", headers: { authorization: `Basic ${this.credentials}`, "content-type": "application/json" }, signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000), body: JSON.stringify({ variables: { CALLSIGN_SESSION: mapping.sessionId, CALLSIGN_ATTEMPT: mapping.attemptId, CALLSIGN_BINDING: mapping.bindingHash } }), redirect: "error" });
    if (!response.ok) throw new Error("ARI_ORIGINATE_FAILED"); return { channelId: mapping.channelId, status: "requested", authenticationScope: "media-edge-only" };
  }
}

export class MediaEdgeAdapter {
  constructor(private readonly endpoint: URL, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || !token) throw new Error("MEDIA_EDGE_CONFIGURATION_INVALID");
  }
  async createLeg(input: { sessionId: string; attemptId: string; bindingHash: string; authorizationJws: string; signal?: AbortSignal }) {
    const body = z.object({ sessionId: z.string().min(3), attemptId: z.string().min(3), bindingHash: z.string().regex(/^[0-9a-f]{64}$/), authorizationJws: z.string().max(32768) }).strict().parse({ sessionId: input.sessionId, attemptId: input.attemptId, bindingHash: input.bindingHash, authorizationJws: input.authorizationJws });
    const response = await this.fetcher(new URL("/v2/legs", this.endpoint), { method: "POST", redirect: "error", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("MEDIA_EDGE_LEG_FAILED");
    const raw = await response.text(); if (raw.length > 32768) throw new Error("MEDIA_EDGE_RESPONSE_TOO_LARGE");
    return z.object({ mappingJws: z.string().min(32).max(32768), offerSdp: z.string().min(1).max(16384) }).strict().parse(JSON.parse(raw));
  }
}
