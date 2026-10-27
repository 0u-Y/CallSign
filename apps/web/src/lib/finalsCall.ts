import { importJWK } from "jose";
import { assertTemporalValidity, authorizationV2Schema, hashCanonical, hashSdp, extractSingleSdpFingerprint, channelChallengeSchema, receiptV2Schema, signPayload, verifyPayload, type BindingV2, type SigningKeyPair, type ContactAuthorizationV2 } from "@callsign/protocol";
import { MonotonicStateGuard, verifyFinalsPackage, type FinalsTrust, type StateBundle } from "@callsign/verifier";
import type { PurposePolicy } from "@callsign/protocol";
import { api } from "./api.js";
import { LiveMedia } from "./liveMedia.js";
import { verifyObservedTransport, waitForIceComplete } from "./rtc.js";

interface Authorization { payload: ContactAuthorizationV2; jws: string; permitJws?: string }
export class FinalsCall {
  private socket: WebSocket | undefined; private channel: RTCDataChannel | undefined; private media: LiveMedia | undefined;
  private binding: BindingV2 | undefined; private auth: Authorization | undefined; private senderProof = "";
  private receiptJws = ""; private transportVerified = false; private packageVerified = false; private receiverNonce = ""; private gatewayNonce = "";
  private timer: ReturnType<typeof setTimeout> | undefined; private poll: ReturnType<typeof setInterval> | undefined;
  private accepted = false;
  private readonly guard = new MonotonicStateGuard(); private closed = false;
  constructor(private readonly options: { role: "gateway" | "recipient"; attemptId: string; sessionId: string; recipientId: string; key: SigningKeyPair; authorization: Authorization; permitJws: string; vcJws: string; credentialId: string; trust: FinalsTrust; policy: PurposePolicy; state: (status: string) => void; remote: (stream: MediaStream) => void }) { this.auth = options.authorization; }
  async connect() {
    const ice = await api<{ iceServers: RTCIceServer[] }>("/v2/turn", { method: "POST", body: JSON.stringify({ attemptId: this.options.attemptId }) });
    this.media = new LiveMedia(ice.iceServers, reason => { this.options.state(reason); this.close(); });
    await this.media.prepareMicrophone();
    if (this.options.role === "recipient") await api("/v2/enroll", { method: "POST", body: JSON.stringify({ sessionId: this.options.sessionId, publicKey: this.options.key.publicJwk }) });
    this.media.peer.addEventListener("track", () => this.options.remote(this.media!.remote));
    this.media.peer.ondatachannel = e => this.bindChannel(e.channel);
    const url = new URL(`/api/v2/signaling?attemptId=${encodeURIComponent(this.options.attemptId)}`, location.origin); url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(url);
    this.socket.onmessage = event => { void this.receive(JSON.parse(String(event.data))).catch(e => this.fail(e)); };
    this.socket.onclose = () => { if (!this.closed) this.fail(new Error("SIGNALING_CLOSED_REVALIDATION_REQUIRED")); };
    this.socket.onerror = () => this.fail(new Error("SIGNALING_UNAVAILABLE"));
  }
  async invite() {
    if (this.options.role !== "gateway" || !this.media) throw new Error("SENDER_NOT_READY");
    this.bindChannel(this.media.peer.createDataChannel("callsign-v2", { ordered: true }));
    await this.media.peer.setLocalDescription(await this.media.peer.createOffer()); await waitForIceComplete(this.media.peer);
    this.send("offer", { sdp: this.media.peer.localDescription!.sdp, authorization: this.auth, permitJws: this.options.permitJws });
  }
  private send(type: string, payload: unknown) { if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("SIGNALING_NOT_READY"); this.socket.send(JSON.stringify({ type, payload })); }
  private async receive(message: { type: string; payload: any }) {
    if (message.type === "ready") { this.options.state("연결 대기: 상대도 연결 대기 후 상담원이 발신하세요."); return; }
    if (message.type === "proxy-ready") return;
    if (message.type === "hangup") { this.close(); this.options.state("상대방이 종료했습니다."); return; }
    const peer = this.media!.peer;
    if (message.type === "offer" && this.options.role === "recipient") {
      const payload = message.payload;
      const authorization = await verifyPayload(payload.authorization.jws, await importJWK(this.options.trust.issuerPublicKey, "EdDSA"), { type: "ContactAuthorization", kid: this.options.trust.issuerKid, schema: authorizationV2Schema });
      assertTemporalValidity(authorization, Math.floor(Date.now()/1000));
      if (authorization.recipientId !== this.options.recipientId || authorization.sessionId !== this.options.sessionId || authorization.attemptId !== this.options.attemptId || hashCanonical(authorization) !== hashCanonical(this.options.authorization.payload)) throw new Error("INVITE_CONTEXT_INVALID");
      this.auth = { payload: authorization, jws: payload.authorization.jws }; this.options.permitJws = String(payload.permitJws);
      await peer.setRemoteDescription({ type: "offer", sdp: payload.sdp }); await peer.setLocalDescription(await peer.createAnswer()); await waitForIceComplete(peer);
      this.send("answer", { sdp: peer.localDescription!.sdp, recipientPublicKey: this.options.key.publicJwk });
    }
    if (message.type === "answer" && this.options.role === "gateway") {
      this.recipientChannelKey = message.payload.recipientPublicKey;
      await peer.setRemoteDescription({ type: "answer", sdp: message.payload.sdp }); const a = this.auth!.payload; const now = Math.floor(Date.now()/1000);
      this.binding = { protocol: "callsign", version: 2, networkId: a.networkId, registryAddress: a.registryAddress, type: "SessionBinding", authorizationHash: hashCanonical(a), sessionId: a.sessionId, recipientId: a.recipientId,
        recipientNonce: crypto.randomUUID(), recipientKeyHash: hashCanonical(message.payload.recipientPublicKey), gatewayFingerprint: extractSingleSdpFingerprint(peer.localDescription!.sdp), receiverFingerprint: extractSingleSdpFingerprint(peer.remoteDescription!.sdp), offerSdpHash: hashSdp(peer.localDescription!.sdp), answerSdpHash: hashSdp(peer.remoteDescription!.sdp), transportProfile: "webrtc-bundle-v2", issuedAt: now, expiresAt: now + 60 };
      this.senderProof = await this.proof("sender"); this.send("binding", { binding: this.binding, senderProof: this.senderProof, permitJws: this.options.permitJws });
    }
    if (message.type === "binding" && this.options.role === "recipient") {
      this.binding = message.payload.binding; this.senderProof = String(message.payload.senderProof);
      this.options.permitJws = String(message.payload.permitJws);
      const result = await api<{ payload: unknown; jws: string }>("/v2/consume", { method: "POST", body: JSON.stringify({ authorizationId: this.auth!.payload.authorizationId, binding: this.binding, senderProof: this.senderProof, recipientProof: await this.proof("recipient"), permitJws: this.options.permitJws }) });
      this.receiptJws = result.jws; this.send("receipt", { receiptJws: result.jws }); await this.beginTransport();
    }
    if (message.type === "receipt" && this.options.role === "gateway") {
      this.receiptJws = String(message.payload.receiptJws);
      const receipt = await verifyPayload(this.receiptJws, await importJWK(this.options.trust.issuerPublicKey, "EdDSA"), { type: "ConsumptionReceipt", kid: this.options.trust.issuerKid, schema: receiptV2Schema });
      if (receipt.bindingHash !== hashCanonical(this.binding) || receipt.authorizationHash !== hashCanonical(this.auth!.payload) || receipt.sessionId !== this.options.sessionId || receipt.expiresAt <= Date.now()/1000) throw new Error("RECEIPT_CONTEXT_INVALID");
    }
    if (message.type === "accept" && this.options.role === "gateway") { if (!this.transportVerified || !this.receiptJws) throw new Error("TRANSPORT_NOT_VERIFIED"); await this.media!.accept(); this.options.state("수신자 수락 후 양방향 마이크 연결"); }
  }
  private proof(role: "sender" | "recipient") {
    const a = this.auth!.payload; const now = Math.floor(Date.now()/1000);
    return signPayload({ protocol: "callsign", version: 2, networkId: a.networkId, registryAddress: a.registryAddress, type: "PossessionProof", role, authorizationId: a.authorizationId, bindingHash: hashCanonical(this.binding), sessionId: a.sessionId, issuedAt: now, expiresAt: now + 60 }, { privateKey: this.options.key.privateKey, kid: hashCanonical(this.options.key.publicJwk) });
  }
  private bindChannel(channel: RTCDataChannel) {
    this.channel = channel; channel.onmessage = event => { void this.transport(JSON.parse(String(event.data))).catch(e => this.fail(e)); };
    channel.onclose = () => { if (!this.closed) this.fail(new Error("DATACHANNEL_CLOSED")); };
    channel.onopen = () => { if (this.options.role === "recipient" && this.binding) void this.beginTransport().catch(e => this.fail(e)); };
  }
  private async beginTransport() {
    if (this.channel?.readyState !== "open" || this.receiverNonce) return;
    this.receiverNonce = crypto.randomUUID(); this.channel.send(JSON.stringify({ type: "hello", nonce: this.receiverNonce }));
  }
  private async transport(message: any) {
    if (!this.binding) throw new Error("BINDING_NOT_READY");
    if (message.type === "hello" && this.options.role === "gateway") {
      this.receiverNonce = String(message.nonce); this.gatewayNonce = crypto.randomUUID();
      const proof = await this.proof("sender");
      const transcript = { type: "ChannelChallenge", version: 2, role: "sender", bindingHash: hashCanonical(this.binding), receiverNonce: this.receiverNonce, gatewayNonce: this.gatewayNonce };
      this.channel!.send(JSON.stringify({ type: "challenge", transcript, jws: await signPayload(transcript, { privateKey: this.options.key.privateKey, kid: hashCanonical(this.options.key.publicJwk) }), proof }));
    }
    if (message.type === "challenge" && this.options.role === "recipient") {
      const permit = await verifyPayload(this.options.permitJws, await importJWK(this.options.trust.servicePublicKey, "EdDSA"), { type: "SenderSessionPermit", kid: this.options.trust.serviceKid, schema: (await import("@callsign/protocol")).permitSchema });
      const verified = await this.checkChannel(message, permit.browserPublicKey, "sender"); this.gatewayNonce = verified.gatewayNonce;
      const transcript = { ...verified, role: "recipient" };
      this.channel!.send(JSON.stringify({ type: "confirmed", transcript, jws: await signPayload(transcript, { privateKey: this.options.key.privateKey, kid: hashCanonical(this.options.key.publicJwk) }) }));
      this.transportVerified = true; await this.verifyPackage();
      this.poll = setInterval(() => { void this.verifyPackage().catch(e => this.fail(e)); }, 3000);
    }
    if (message.type === "confirmed" && this.options.role === "gateway") {
      // Recipient key was pinned by issuer enrollment and its possession proof before receipt.
      const recipientKey = this.recipientChannelKey;
      if (!recipientKey) throw new Error("RECIPIENT_CHANNEL_KEY_MISSING");
      await this.checkChannel(message, recipientKey, "recipient"); this.transportVerified = true;
    }
  }
  private recipientChannelKey: import("jose").JWK | undefined;
  private async checkChannel(message: any, jwk: import("jose").JWK, role: string) {
    const schema = channelChallengeSchema;
    const t = await verifyPayload(message.jws, await importJWK(jwk, "EdDSA"), { type: "ChannelChallenge", kid: hashCanonical(jwk), schema });
    if (t.role !== role || t.receiverNonce !== this.receiverNonce || t.bindingHash !== hashCanonical(this.binding) || (role === "recipient" && t.gatewayNonce !== this.gatewayNonce)) throw new Error("CHANNEL_CHALLENGE_MISMATCH");
    return t;
  }
  private async verifyPackage() {
    const peer = this.media!.peer; const binding = this.binding!;
    const observed = await verifyObservedTransport(peer, this.channel!, binding.gatewayFingerprint);
    const state = await api<StateBundle>(`/v2/state?credentialId=${encodeURIComponent(this.options.credentialId)}`);
    const nonce = crypto.randomUUID();
    const status = await api<{ jws: string }>("/v2/authorization-status", { method: "POST", body: JSON.stringify({ authorizationId: this.auth!.payload.authorizationId, nonce }) });
    const result = await verifyFinalsPackage({ statusJws: status.jws, statusNonce: nonce, authorizationJws: this.auth!.jws, vcJws: this.options.vcJws, permitJws: this.options.permitJws, receiptJws: this.receiptJws, binding, trust: this.options.trust, policy: this.options.policy, state,
      recipientId: this.options.recipientId, sessionId: this.options.sessionId, localSdp: peer.localDescription!.sdp, remoteSdp: peer.remoteDescription!.sdp, recipientPublicKey: this.options.key.publicJwk, guard: this.guard, now: Math.floor(Date.now()/1000), monotonicMs: performance.now(), observedTransport: { profile: observed.profile, remoteFingerprint: binding.gatewayFingerprint, dataChannelBindingHash: hashCanonical(binding), connected: this.transportVerified } });
    this.packageVerified = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.fail(new Error("STATE_FRESHNESS_EXPIRED")), Math.max(0, result.deadlineMonotonicMs - performance.now())); this.options.state(this.accepted ? "통화 중: 권한·세션 재검증 완료" : "서명·권한·현재 연결 검증 완료: 수락할 수 있습니다.");
  }
  async accept() { if (!this.packageVerified || !this.transportVerified) throw new Error("CALL_NOT_VERIFIED"); await this.media!.accept(); this.accepted = true; this.send("accept", {}); this.options.state("통화 중: 마이크 음성 전송"); }
  mute(value: boolean) { this.media?.mute(value); }
  close() { if (this.closed) return; this.closed = true; clearTimeout(this.timer); clearInterval(this.poll); this.media?.close(); this.socket?.close(); }
  hangup() { try { this.send("hangup", {}); } finally { this.close(); } }
  get remoteStream() { return this.media?.remote; }
  private fail(error: unknown) { this.packageVerified = false; this.transportVerified = false; this.options.state(error instanceof Error ? error.message : "CALL_UNAVAILABLE"); this.close(); }
}
