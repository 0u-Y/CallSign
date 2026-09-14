import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowRight, Check, ChevronRight, CircleEllipsis, Database, Download, ExternalLink, FileCheck2, KeyRound, Landmark, Link2, LoaderCircle, LockKeyhole, Network, PhoneCall, Radio, RotateCcw, Server, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api, ApiError, demoLogin, type SessionUser } from "../lib/api.js";
import { generateBrowserSigningKey, type BrowserSigningKey } from "../lib/browserKeys.js";
import { CompactSign, importJWK, type JWK } from "jose";
import {
  canonicalBytes,
  enrollmentProofSchema,
  gatewayConsumeRequestSchema,
  hashCanonical,
  hashSdp,
  recipientChallengeSchema,
  sessionBindingSchema,
  type GatewayConsumeRequest,
  type RecipientChallenge,
  type SessionBinding,
  type SessionProof,
  type TransportTranscript,
} from "@callsign/protocol";
import {
  ALICE_ID,
  createPeer,
  createSilentAudioTrack,
  makeTransportTranscript,
  loadTrustKeys,
  openSignaling,
  sendSignal,
  verifyTransportTranscript,
  waitForIceComplete,
  type AuthorizationRow,
  type SignalMessage,
  type TrustKeys,
} from "../lib/rtc.js";
import { RoleTabs } from "../components/RoleTabs.js";
import { StatusBadge, type VerificationState } from "../components/Status.js";

interface Task { id: string; institutionId: string; title: string; status: string; detail: string }
interface GatewayRegistration { id: string; kid: string; delegationId: string; active: boolean }
type Authorization = AuthorizationRow;

export function InstitutionPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [gateways, setGateways] = useState<GatewayRegistration[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [message, setMessage] = useState("기관 테스트 세션을 준비하세요.");
  const [busy, setBusy] = useState(false);

  async function prepare() {
    setBusy(true);
    try {
      const nextUser = await demoLogin("institution-demo");
      const [taskResult, gatewayResult, authorizationResult] = await Promise.all([
        api<{ tasks: Task[] }>("/institution/tasks"),
        api<{ registrations: GatewayRegistration[] }>("/gateway/registrations"),
        api<{ authorizations: Authorization[] }>("/authorizations"),
      ]);
      setUser(nextUser); setTasks(taskResult.tasks); setGateways(gatewayResult.registrations); setAuthorizations(authorizationResult.authorizations);
      setMessage(gatewayResult.registrations.length ? "업무와 등록된 위탁 키를 확인했습니다." : "위탁센터가 게이트웨이 키를 먼저 등록해야 합니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "세션 준비 실패"); }
    finally { setBusy(false); }
  }

  async function issue(task: Task) {
    const gateway = gateways[0];
    if (!gateway) { setMessage("등록된 게이트웨이 키가 없습니다."); return; }
    setBusy(true);
    try {
      const result = await api<{ payload: { authorizationId: string } }>("/authorizations", { method: "POST", body: JSON.stringify({ taskId: task.id, gatewayRegistrationId: gateway.id, purposeCode: "DOCUMENT_SUPPLEMENT" }) });
      const refreshed = await api<{ authorizations: Authorization[] }>("/authorizations");
      setAuthorizations(refreshed.authorizations);
      setMessage(`개별 연락 승인서 ${result.payload.authorizationId.slice(0, 20)}…를 발급했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "승인서 발급 실패"); }
    finally { setBusy(false); }
  }

  async function revoke(authorization: Authorization) {
    setBusy(true);
    try {
      const result = await api<{ transactionHash: string }>(`/authorizations/${authorization.id}/revoke-delegation`, { method: "POST", body: "{}" });
      setMessage(`위임 취소가 원장에 확정됐습니다. transaction ${result.transactionHash.slice(0, 18)}…`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "위임 취소 실패"); }
    finally { setBusy(false); }
  }

  return (
    <OperationsLayout title="기관 업무 승인" description="모의 A시청 담당자가 특정 수신자와 목적에 한정된 개별 연락을 승인합니다.">
      <div className="session-bar"><div><span className="session-dot" />{user ? `${user.displayName} · 기관 역할` : "세션 없음"}</div><button className="button secondary" onClick={prepare} disabled={busy}>{busy ? "준비 중" : "기관 세션 준비"}</button></div>
      <p className="inline-message" aria-live="polite">{message}</p>
      <section className="console-grid">
        <div className="data-panel"><div className="panel-heading"><div><h2>연락할 모의 업무</h2><p>업무 상세는 승인서나 공개 URL에 포함하지 않습니다.</p></div><span>{tasks.length}건</span></div>
          {tasks.length === 0 ? <EmptyState text="기관 세션을 준비하면 승인 가능한 모의 업무가 표시됩니다." /> : <div className="data-list">{tasks.map((task) => <article key={task.id}><div><span className="small-label">{task.status}</span><h3>{task.title}</h3><p>{task.detail}</p></div><button className="button primary" onClick={() => issue(task)} disabled={busy || gateways.length === 0}>연락 승인 발급<ChevronRight size={18} /></button></article>)}</div>}
        </div>
        <aside className="detail-panel"><KeyRound /><h2>위임 선택</h2>{gateways.length ? gateways.map((gateway) => <div className="key-row" key={gateway.id}><span className="status-dot good" /><div><strong>위탁센터 C</strong><small>{gateway.kid}</small></div></div>) : <EmptyState text="등록된 게이트웨이 키가 없습니다." />}<p className="technical-note">DB 목록은 조회 편의를 위한 캐시입니다. LIVE 인증의 권위 상태는 verified snapshot입니다.</p></aside>
      </section>
      <section className="data-panel"><div className="panel-heading"><div><h2>최근 발신 승인</h2><p>통화는 유지하되 실제 원장 위임을 취소하면 수신자의 인증 표시가 철회됩니다.</p></div><span>{authorizations.length}건</span></div>
        {authorizations.length === 0 ? <EmptyState text="아직 발급한 승인서가 없습니다." /> : <div className="data-list">{authorizations.slice(0, 5).map((authorization) => <article key={authorization.id}><div><span className="small-label">epoch {authorization.payload.epoch}</span><h3>{authorization.payload.purposeCode}</h3><p>{authorization.delegationId.slice(0, 30)}…</p></div><button className="button danger" onClick={() => revoke(authorization)} disabled={busy}>원장 위임 취소</button></article>)}</div>}
      </section>
    </OperationsLayout>
  );
}

export function GatewayPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [key, setKey] = useState<BrowserSigningKey | null>(null);
  const [registration, setRegistration] = useState<GatewayRegistration | null>(null);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [message, setMessage] = useState("게이트웨이 브라우저 키를 준비하세요.");
  const [busy, setBusy] = useState(false);
  const [transport, setTransport] = useState("연결 전");
  const keyRef = useRef<BrowserSigningKey | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<{ track: MediaStreamTrack; context: AudioContext } | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const authorizationRef = useRef<Authorization | null>(null);
  const challengeRef = useRef<{ challenge: RecipientChallenge; challengeJws: string; enrollment: { id: string; payload: unknown; proofJws: string; enrollmentKid: string }; recipientPublicJwk: JWK; recipientKid: string } | null>(null);
  const trustRef = useRef<TrustKeys | null>(null);
  const bindingHashRef = useRef("");

  useEffect(() => () => { socketRef.current?.close(); peerRef.current?.close(); void audioRef.current?.context.close(); }, []);

  async function onSignal(signal: SignalMessage) {
    try {
      if (signal.type === "challenge") {
        const payload = signal.payload as typeof challengeRef.current;
        if (!payload) throw new Error("CHALLENGE_MISSING");
        const trust = trustRef.current!;
        const enrollmentKey = await importJWK(trust.enrollmentPublicKey, "EdDSA");
        const enrollment = await (await import("@callsign/protocol")).verifyPayload(payload.enrollment.proofJws, enrollmentKey, { type: "EnrollmentProof", kid: trust.enrollmentKid, schema: enrollmentProofSchema });
        const recipientKey = await importJWK(payload.recipientPublicJwk, "EdDSA");
        const challenge = await (await import("@callsign/protocol")).verifyPayload(payload.challengeJws, recipientKey, { type: "RecipientChallenge", kid: payload.recipientKid, schema: recipientChallengeSchema });
        if (challenge.sessionId !== signal.sessionId || challenge.recipientId !== authorizationRef.current?.recipientId || challenge.recipientSessionPublicKey !== enrollment.recipientSessionPublicKey || payload.recipientPublicJwk.x !== enrollment.recipientSessionPublicKey) throw new Error("RECIPIENT_CHALLENGE_CONTEXT_MISMATCH");
        challengeRef.current = { ...payload, challenge };
        const peer = createPeer();
        peerRef.current = peer;
        const audio = await createSilentAudioTrack();
        audioRef.current = audio;
        audioSenderRef.current = peer.addTransceiver("audio", { direction: "sendonly" }).sender;
        const channel = peer.createDataChannel("institutionproof-binding", { ordered: true });
        channelRef.current = channel;
        channel.addEventListener("open", () => setTransport("datachannel 연결됨 · proof 대기"));
        channel.addEventListener("message", async (event) => {
          const value = JSON.parse(String(event.data)) as Record<string, unknown>;
          if (value.type === "hello") {
            if (value.bindingHash !== bindingHashRef.current) throw new Error("BINDING_HASH_MISMATCH");
            const gatewayNonce = (await import("@callsign/protocol")).randomId("transport_gateway");
            const signed = await makeTransportTranscript("gateway", bindingHashRef.current, String(value.receiverNonce), gatewayNonce, keyRef.current!, trustRef.current!);
            channel.send(JSON.stringify({ type: "gateway-transcript", transcript: signed.payload, jws: signed.jws }));
          }
          if (value.type === "receiver-transcript") {
            const transcript = value.transcript as TransportTranscript;
            await verifyTransportTranscript(String(value.jws), transcript, challengeRef.current!.recipientPublicJwk, challengeRef.current!.recipientKid, "receiver");
            if (transcript.bindingHash !== bindingHashRef.current) throw new Error("TRANSCRIPT_BINDING_MISMATCH");
            channel.send(JSON.stringify({ type: "confirmed" }));
            setTransport("양방향 서명 challenge 확인 · 수신자 상태 확인 중");
          }
          if (value.type === "accept") {
            audioRef.current!.track.enabled = true;
            await audioSenderRef.current!.replaceTrack(audioRef.current!.track);
            await audioRef.current!.context.resume();
            setTransport("사용자 수락 후 생성 음원 전송 중");
          }
        });
        await peer.setLocalDescription(await peer.createOffer());
        await waitForIceComplete(peer);
        sendSignal(socketRef.current!, { type: "offer", toUserId: ALICE_ID, sessionId: signal.sessionId, payload: { sdp: peer.localDescription!.sdp } });
        setTransport("offer 전송 · answer 대기");
      }
      if (signal.type === "answer") {
        const peer = peerRef.current!;
        await peer.setRemoteDescription({ type: "answer", sdp: (signal.payload as { sdp: string }).sdp });
        const authorization = authorizationRef.current!;
        const challengeContext = challengeRef.current!;
        const now = Math.floor(Date.now() / 1000);
        const protocol = await import("@callsign/protocol");
        const binding: SessionBinding = {
          protocol: "callsign", version: 1, type: "SessionBinding", networkId: trustRef.current!.networkId, registryAddress: trustRef.current!.registryAddress,
          authorizationHash: authorization.authorizationHash, sessionId: signal.sessionId, institutionId: authorization.payload.institutionId, epoch: authorization.payload.epoch,
          delegationId: authorization.delegationId, recipientId: authorization.recipientId, recipientNonce: challengeContext.challenge.recipientNonce,
          recipientSessionKeyHash: hashCanonical(challengeContext.challenge.recipientSessionPublicKey),
          gatewayFingerprint: protocol.extractSingleSdpFingerprint(peer.localDescription!.sdp), receiverFingerprint: protocol.extractSingleSdpFingerprint(peer.remoteDescription!.sdp),
          fingerprintAlgorithm: "sha-256", transportProfile: "webrtc-bundle-v1", offerSdpHash: hashSdp(peer.localDescription!.sdp), answerSdpHash: hashSdp(peer.remoteDescription!.sdp), issuedAt: now, expiresAt: now + 60,
        };
        sessionBindingSchema.parse(binding);
        const bindingHash = hashCanonical(binding);
        bindingHashRef.current = bindingHash;
        const consumeRequest: GatewayConsumeRequest = { protocol: "callsign", version: 1, type: "GatewayConsumeRequest", networkId: trustRef.current!.networkId, registryAddress: trustRef.current!.registryAddress, role: "gateway", authorizationId: authorization.id, authorizationHash: authorization.authorizationHash, bindingHash, recipientChallengeHash: hashCanonical(challengeContext.challenge), sessionId: signal.sessionId, issuedAt: now, expiresAt: now + 60 };
        gatewayConsumeRequestSchema.parse(consumeRequest);
        const gatewayConsumeRequestJws = await new CompactSign(canonicalBytes(consumeRequest)).setProtectedHeader({ alg: "EdDSA", typ: "callsign/GatewayConsumeRequest+jws", kid: keyRef.current!.kid }).sign(keyRef.current!.privateKey);
        const result = await api<{ receipt: import("@callsign/protocol").ConsumptionReceipt; signedJws: string; issuerKid: string }>(`/authorizations/${authorization.id}/consume`, { method: "POST", body: JSON.stringify({ binding, recipientEnrollmentId: challengeContext.enrollment.id, recipientChallengeJws: challengeContext.challengeJws, gatewayConsumeRequestJws }) });
        const proof: SessionProof = { protocol: "callsign", version: 1, type: "SessionProof", networkId: trustRef.current!.networkId, registryAddress: trustRef.current!.registryAddress, role: "gateway", bindingHash, consumptionReceiptHash: hashCanonical(result.receipt), binding, issuedAt: now, expiresAt: now + 60 };
        const sessionProofJws = await protocol.signPayload(proof, keyRef.current!);
        sendSignal(socketRef.current!, { type: "proof", toUserId: ALICE_ID, sessionId: signal.sessionId, payload: { binding, receipt: result.receipt, receiptJws: result.signedJws, sessionProof: proof, sessionProofJws, gatewayPublicJwk: keyRef.current!.publicJwk, gatewayKid: keyRef.current!.kid } });
        setTransport("1회 영수증 고정 · proof 전송");
      }
    } catch (error) {
      setTransport(error instanceof Error ? `거절: ${error.message}` : "연결 처리 실패");
    }
  }

  async function prepare() {
    setBusy(true);
    try {
      const nextUser = await demoLogin("gateway-demo");
      const nextKey = await generateBrowserSigningKey();
      const registered = await api<{ id: string; kid: string; delegationId: string }>("/gateway/register", { method: "POST", body: JSON.stringify({ publicJwk: nextKey.publicJwk, kid: nextKey.kid, delegationId: `delegation_gateway_c_${crypto.randomUUID().replaceAll("-", "")}` }) });
      const trust = await loadTrustKeys();
      keyRef.current = nextKey; trustRef.current = trust;
      socketRef.current = openSignaling((signal) => { void onSignal(signal); }, (status) => setTransport(status === "SIGNALING_READY" ? "인증된 signaling 준비" : status));
      setUser(nextUser); setKey(nextKey); setRegistration({ ...registered, active: true });
      setMessage("이 브라우저에서 생성한 비추출형 키의 공개키를 등록했습니다. 기관의 위임·승인을 기다립니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "키 등록 실패"); }
    finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true);
    try { const result = await api<{ authorizations: Authorization[] }>("/authorizations"); setAuthorizations(result.authorizations); setMessage(`${result.authorizations.length}개의 승인 연락을 조회했습니다.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "승인 목록 조회 실패"); }
    finally { setBusy(false); }
  }

  function call(authorization: Authorization) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) { setTransport("수신자와 게이트웨이 signaling을 먼저 준비하세요."); return; }
    const sessionId = `call_${crypto.randomUUID().replaceAll("-", "")}`;
    authorizationRef.current = authorization;
    sendSignal(socketRef.current, { type: "invite", toUserId: ALICE_ID, sessionId, payload: authorization });
    setTransport("초대 전송 · 수신자 challenge 대기");
  }

  return (
    <OperationsLayout title="위탁센터 발신" description="발신 종단 키는 이 브라우저에 있고, 서버는 외부 지문에 대신 서명하지 않습니다.">
      <div className="session-bar"><div><span className="session-dot" />{user ? `${user.displayName} · 게이트웨이 역할` : "세션 없음"}</div><div className="button-row"><button className="button secondary" onClick={prepare} disabled={busy || !!registration}>{registration ? "키 등록 완료" : "브라우저 키 등록"}</button><button className="icon-button" aria-label="승인 목록 새로고침" onClick={refresh} disabled={!user || busy}><RotateCcw size={18} /></button></div></div>
      <p className="inline-message" aria-live="polite">{message}</p>
      <section className="console-grid wide-main"><div className="data-panel"><div className="panel-heading"><div><h2>승인된 연락</h2><p>기관이 개별 승인한 연락만 발신 준비를 할 수 있습니다.</p></div><span>{authorizations.length}건</span></div>
        {authorizations.length === 0 ? <EmptyState text="기관 담당자가 연락 승인서를 발급한 뒤 새로고침하세요." /> : <div className="data-list">{authorizations.map((authorization) => <article key={authorization.id}><div><span className="small-label">개별 승인 · 모의</span><h3>{String(authorization.payload.purposeCode ?? "승인 목적")}</h3><p>수신 대상 {authorization.recipientId.slice(0, 22)}…</p></div><button className="button primary" onClick={() => call(authorization)} disabled={!key || !!authorization.cancelledAt}><PhoneCall size={18} />승인 통화 시작</button></article>)}</div>}
      </div><aside className="detail-panel"><KeyRound /><h2>게이트웨이 키</h2><div className="key-row"><span className={`status-dot ${key ? "good" : ""}`} /><div><strong>{key ? "로컬 키 준비됨" : "키 없음"}</strong><small>{key?.kid ?? "브라우저에서 생성 필요"}</small></div></div><p className="technical-note">현재 탭 메모리의 non-extractable private CryptoKey를 사용합니다. IndexedDB 지속 저장은 아직 구현 중입니다.</p><output className="inline-message" data-testid="gateway-transport">{transport}</output></aside></section>
    </OperationsLayout>
  );
}

export function GovernancePage() {
  const [proposalId, setProposalId] = useState("");
  const [signers, setSigners] = useState<string[]>([]);
  const [message, setMessage] = useState("복구안은 운영자 세션에서 만들고, 승인자 세션 두 개가 각각 서명해야 합니다.");
  const [busy, setBusy] = useState(false);

  async function createProposal() {
    setBusy(true);
    try {
      await demoLogin("operator-demo");
      const result = await api<{ proposal: { id: string } }>("/governance/proposals", { method: "POST", body: JSON.stringify({ action: "RECOVER", institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ", payload: { expectedEpoch: "2", action: "replace-separated-keys" } }) });
      setProposalId(result.proposal.id); setSigners([]); setMessage("복구안을 만들었습니다. 승인자 1과 2가 각자 서명하세요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "복구안 생성 실패"); }
    finally { setBusy(false); }
  }
  async function sign(index: 1 | 2 | 3) {
    if (!proposalId) return;
    setBusy(true);
    try {
      await demoLogin(`approver-${index}-demo`);
      const result = await api<{ signerUserId: string; signerCount: number; status: string }>(`/governance/proposals/${proposalId}/sign`, { method: "POST", body: "{}" });
      setSigners((current) => [...current, result.signerUserId]); setMessage(`승인자 ${index} 서명을 기록했습니다. 현재 ${result.signerCount}/2 · ${result.status}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "서명 실패"); }
    finally { setBusy(false); }
  }
  return <OperationsLayout title="공동 운영" description="긴급 정지 이후 복구는 서로 다른 승인자 2명의 명시적 동작이 필요합니다.">
    <div className="governance-layout"><section className="proposal-panel"><div className="proposal-title"><div className="proposal-icon"><LockKeyhole /></div><div><span className="small-label">모의 A시청 · 복구</span><h2>새 관리자·승인키·정지키 등록</h2><p>expected epoch 2 → recovered epoch 3</p></div></div><button className="button primary" onClick={createProposal} disabled={busy}>{proposalId ? "복구안 다시 만들기" : "복구안 만들기"}</button><p className="inline-message">{message}</p></section>
      <section className="approver-list" aria-label="공동 승인자"><h2>서명자 세션</h2>{[1, 2, 3].map((index) => { const signed = signers.some((value) => value.includes(`approver_${index}`)); return <article key={index}><span className={`avatar ${signed ? "signed" : ""}`}>{signed ? <Check /> : index}</span><div><strong>공동 승인자 {index}</strong><small>{signed ? "서명 기록됨" : "아직 서명하지 않음"}</small></div><button className="button secondary" onClick={() => sign(index as 1 | 2 | 3)} disabled={!proposalId || signed || busy}>이 세션으로 서명</button></article>; })}</section>
    </div><p className="technical-note governance-note">이 콘솔은 서로 다른 로그인 세션의 동작을 기록합니다. 현재 API의 해시 기록은 역할 UX 검증용이며, 실제 EIP-712 서명 제출과 Besu 트랜잭션 실행 연결은 별도 진행 상태입니다.</p>
  </OperationsLayout>;
}

export function EvidencePage() {
  type LatestEvidence = { readiness: { status: string; nodeCount: number; witnessCount: number; witnessThreshold: number; sameBlockHash: boolean; registryCodePresent: boolean; commonBlockNumber: string | null }; report: null | { generatedAt: string; summary: { pass: number; fail: number; blocked: number; notRun: number }; checks: Array<{ id: string; label: string; status: string; observation: string; evidence: string }> } };
  const latest = useQuery({ queryKey: ["latest-evidence"], queryFn: () => api<LatestEvidence>("/evidence/latest"), refetchInterval: 5_000 });
  const ready = latest.data?.readiness.status === "ready";
  const rows = latest.data?.report?.checks.filter((check) => ["protocol-unit", "database-integration", "qbft-readiness", "webrtc-e2e"].includes(check.id)) ?? [];
  return <div className="content-page"><div className="page-heading"><div><span className={`mode-tag ${ready ? "live" : "preview"}`}><Radio size={14} />{ready ? "LIVE · 원장과 witness 관측" : "연결 확인 중"}</span><h1>검증 근거</h1><p>실시간 준비 상태와 저장된 실행 증거를 구분해 보여줍니다.</p></div><a className="button secondary" href="/api/evidence/latest" download><Download size={18} />현재 증거 JSON</a></div>
    <section className="evidence-summary"><article><Server /><div><span>QBFT 원장</span><strong>{latest.isLoading ? "확인 중" : `${latest.data?.readiness.nodeCount ?? 0}/4 노드`}</strong><small>{latest.data?.readiness.sameBlockHash ? `동일 블록 #${latest.data.readiness.commonBlockNumber}` : "공통 블록 확인 불가"}</small></div></article><article><ShieldCheck /><div><span>상태 증언</span><strong>{latest.isLoading ? "확인 중" : `${latest.data?.readiness.witnessCount ?? 0}/4 witness`}</strong><small>수락 임계값 {latest.data?.readiness.witnessThreshold ?? 3} · 네이티브 light client 아님</small></div></article><article><Database /><div><span>최근 테스트</span><strong>{latest.data?.report ? `PASS ${latest.data.report.summary.pass}` : "결과 파일 없음"}</strong><small>{latest.data?.report ? new Date(latest.data.report.generatedAt).toLocaleString("ko-KR") : "pnpm test:report 필요"}</small></div></article></section>
    <section className="results-table"><div className="panel-heading"><div><h2>저장된 실행 항목</h2><p>artifacts/test-results.json에 기록된 마지막 실제 실행입니다.</p></div></div><div className="table-scroll"><table><thead><tr><th>검사</th><th>상태</th><th>관측</th><th>증거</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}><td>{row.label}</td><td><span className={`result ${row.status === "PASS" ? "pass" : "blocked"}`}>{row.status}</span></td><td>{row.observation}</td><td><code>{row.evidence}</code></td></tr>) : <tr><td colSpan={4}>아직 저장된 실행 보고서가 없습니다.</td></tr>}</tbody></table></div></section>
    <div className="page-links"><Link to="/compare">중앙·연합·원장 비교 보기<ArrowRight size={18} /></Link><Link to="/design-system">개발용 디자인 시스템 보기<ArrowRight size={18} /></Link></div>
  </div>;
}

export function ComparePage() {
  const rows = [
    { condition: "권한 없는 기관 수정", c1: "접근통제로 거절", c2: "기관 서명으로 거절", b: "계약 권한으로 거절" },
    { condition: "상태 운영자 1곳의 거짓 응답", c1: "운영자 신뢰 필요", c2: "서명 문서로 검출", b: "3-of-4 witness로 검출" },
    { condition: "공동 정지·복구 순서", c1: "동일 승인 로직 필요", c2: "문서 버전 조정 필요", b: "QBFT 상태 전이로 직렬화" },
    { condition: "구성 요소·가용성 비용", c1: "가장 낮음", c2: "기관별 배포 필요", b: "노드 4 + witness 4" },
  ];
  return <div className="content-page"><div className="page-heading"><div><span className="mode-tag preview"><CircleEllipsis size={14} /> 비교 하네스 · 설계 상태</span><h1>블록체인은 어디에 필요한가</h1><p>사용자 효용과 공동 원장의 증분 가치를 같은 말로 포장하지 않습니다.</p></div></div><div className="compare-table table-scroll"><table><thead><tr><th>동일 조건</th><th>C1 중앙</th><th>C2 기관별 서명</th><th>B QBFT + witness</th></tr></thead><tbody>{rows.map((row) => <tr key={row.condition}><th>{row.condition}</th><td>{row.c1}</td><td>{row.c2}</td><td>{row.b}</td></tr>)}</tbody></table></div><div className="compare-callout"><Network /><div><h2>채택 가설</h2><p>독립 기관들이 발신 권한 변경 순서와 정지·복구 규칙을 공동 집행해야 할 때, 한 상태 운영자의 독단적인 응답에 덜 의존할 수 있습니다. 실제 기관의 비용 부담 의사는 아직 검증하지 않았습니다.</p></div></div></div>;
}

export function OfficialPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  async function login(code: "alice-demo" | "bob-demo") { try { const next = await demoLogin(code); const result = await api<{ tasks: Task[] }>("/tasks"); setUser(next); setTasks(result.tasks); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "로그인 실패"); } }
  return <div className="official-page"><section className="official-login"><span className="mode-tag live"><LockKeyhole size={14} /> 독립 로그인</span><h1>모의 공식 업무</h1><p>연락 증명이나 opaque ID만으로 업무를 열지 않습니다. 테스트 계정으로 다시 로그인하고 자기 업무만 확인합니다.</p><div className="button-row"><button className="button primary" onClick={() => login("alice-demo")}>Alice로 로그인</button><button className="button secondary" onClick={() => login("bob-demo")}>Bob으로 로그인</button></div>{error && <p className="error-message">{error}</p>}</section><section className="official-tasks"><div className="panel-heading"><div><h2>{user ? `${user.displayName}의 업무` : "내 업무"}</h2><p>서버가 owner_id를 현재 세션과 함께 조회합니다.</p></div></div>{tasks.length ? tasks.map((task) => <article key={task.id}><FileCheck2 /><div><span className="small-label">{task.status}</span><h3>{task.title}</h3><p>{task.detail}</p></div></article>) : <EmptyState text="로그인하면 현재 계정이 볼 수 있는 업무만 나타납니다." />}</section></div>;
}

export function DesignSystemPage() {
  const states: VerificationState[] = ["CHECKING", "APPROVAL_VERIFIED", "CONNECTING", "CONNECTED_VERIFIED", "UNVERIFIED", "UNAVAILABLE", "REJECTED", "ENDED"];
  return <div className="content-page design-system"><div className="page-heading"><div><span className="mode-tag preview">개발 전용</span><h1>CallSign 디자인 시스템</h1><p>실제 제품 화면과 같은 토큰·컴포넌트·상태를 사용합니다.</p></div></div><section><h2>색과 표면</h2><div className="swatches">{[["배경", "#F6F8FA"], ["표면", "#FFFFFF"], ["본문", "#17242D"], ["보조", "#53636F"], ["경계", "#DCE4E8"], ["확인", "#087F73"], ["경고", "#A15C00"], ["거절", "#C7353C"]].map(([name, color]) => <article key={name}><span style={{ background: color }} /><strong>{name}</strong><code>{color}</code></article>)}</div></section><section><h2>인증 상태</h2><div className="state-grid">{states.map((state) => <article key={state}><StatusBadge state={state} /><code>{state}</code></article>)}</div></section><section><h2>실제 컨트롤</h2><div className="control-showcase"><button className="button primary">주요 행동</button><button className="button secondary">보조 행동</button><button className="button primary" disabled><LoaderCircle className="spin" size={18} />처리 중</button><Dialog.Root><Dialog.Trigger asChild><button className="button quiet">대화상자 열기</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>기술 상세</Dialog.Title><Dialog.Description>초점은 대화상자 안에 머물고 Esc로 닫을 수 있습니다.</Dialog.Description><Dialog.Close asChild><button className="button primary">확인</button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></div></section></div>;
}

function OperationsLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="operations-page"><RoleTabs /><div className="page-heading"><div><span className="mode-tag preview">모의 기관 · 로컬 데모</span><h1>{title}</h1><p>{description}</p></div></div>{children}</div>; }
function EmptyState({ text }: { text: string }) { return <div className="empty-state"><CircleEllipsis /><p>{text}</p></div>; }
