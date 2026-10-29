import type { CallLease, ServiceBinding, ServiceCredential, ServiceProof, ServiceReceipt, StartAuthorization } from "@callsign/protocol";
export type Signed<T> = { payload: T; jws: string };
export type AttemptStatus = "created" | "authorized" | "consumed" | "accepted" | "ended" | "declined" | "no-answer" | "failed" | "cancelled";
export const terminal = (status: AttemptStatus) => ["ended", "declined", "no-answer", "failed", "cancelled"].includes(status);
export interface ServiceAttempt {
  id: string; intentId: string; agentId: string; sessionId: string; generation: string; profile: "direct-webrtc-v3" | "asterisk-webrtc-v3";
  status: AttemptStatus; firstConnectBy: number; callEndBy: number; revision: number;
  authorityStatus?:"current"|"unavailable"; authorityUntil?:number;
  authorizationId?: string; binding?: ServiceBinding; lease?: Signed<CallLease>; recipientKey?: { userId: string; publicKey: import("jose").JWK; nonce: string };
  possessions?: Partial<Record<"sender" | "recipient", string>>;
  mediaReady?: Partial<Record<"sender" | "recipient", string>>;
  renewal?: { nonce: string; sequence: number; priorLeaseHash: string; issuedAt: number; expiresAt: number; proofs: Partial<Record<"sender" | "recipient", string>> };
  ownerSessions?: Partial<Record<"sender" | "recipient", string>>;
  endedAt?: number; reason?: string; consent?: { granted: boolean; generation: number; at: number; streamId?:string }; unverifiedChoice?: "pause" | "continue";
  pbx?: { bridgeId: string; senderChannelId: string; recipientChannelId: string; senderEndpoint: string; recipientEndpoint: string; state: "reserved" | "prepared" | "bridged" | "ended"; evidence?: string; credentials:Record<string,string>; reports: Record<string, { callId: string; sdp: string; remoteSdp: string; fingerprint: string; proof: string }> };
}
export interface ServiceState {
  recovery: "ready" | "blocked";
  credentials: Record<string, { vc: ServiceCredential; jws: string; state: "pending" | "registered" | "revoke-requested" | "revoked" }>;
  attempts: Record<string, ServiceAttempt>;
  challenges: Record<string, { payload: ServiceProof; used: boolean }>;
  authorizations: Record<string, Signed<StartAuthorization> & { serviceProofJws: string; cancelled: boolean }>;
  consumptions: Record<string, Signed<ServiceReceipt>>;
  requests: Record<string, { hash: string; at: number; result: unknown }>;
  checkpoints: Record<string, { height: string; hash: string; payloadHash: string; firstSeenAt: number; blockTimestamp: number }>;
  quotas: Record<string, { limit: number; used: number; reserved: number; expiresAt: number }>;
  confirmations: Record<string, { id: string; answer: string; at: number; userId: string }>;
}
export const newServiceState = (): ServiceState => ({ recovery: "ready", credentials: {}, attempts: {}, challenges: {}, authorizations: {}, consumptions: {}, requests: {}, checkpoints: {}, quotas: {}, confirmations: {} });
