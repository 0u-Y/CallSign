import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, Check, ChevronDown, CircleDot, FileCheck2, Headphones, Landmark, Link2, Phone, PhoneOff, Play, Radio, RotateCcw, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { CompactSign } from "jose";
import { canonicalBytes, generateEd25519KeyPair, randomId } from "@callsign/protocol";
import { MonotonicStateGuard, verifyStateBundle, type StateSnapshot, type TrustBundle } from "@callsign/verifier";
import { api, demoLogin } from "../lib/api.js";
import { generateBrowserSigningKey } from "../lib/browserKeys.js";
import {
  ALICE_ID,
  GATEWAY_ID,
  createPeer,
  createRecipientChallenge,
  loadTrustKeys,
  openSignaling,
  sendSignal,
  verifyIncomingAuthorization,
  verifyLedgerAuthorization,
  verifyObservedTransport,
  verifyProofPackage,
  waitForIceComplete,
  type AuthorizationRow,
  type Enrollment,
  type SignalMessage,
  type TrustKeys,
} from "../lib/rtc.js";
import { StatusBadge, statusCopy, type VerificationState } from "../components/Status.js";
import { publicPreview } from "../config.js";

const scenes = [
  { id: "normal", title: "기관이 승인한 정상 연락", short: "정상 연락", summary: "세 개의 독립된 검증 결과가 실제 순서대로 연결됩니다." },
  { id: "copy", title: "같은 이름과 복사된 증명", short: "사칭·복사", summary: "기관명을 같게 표시해도 증명이 없거나 수신 대상이 다르면 선이 끊깁니다." },
  { id: "revoked", title: "권한 취소와 오래된 상태", short: "취소·만료", summary: "새 취소를 알게 된 뒤에는 과거 정상 snapshot으로 돌아가지 않습니다." },
  { id: "recovery", title: "공동 승인 복구", short: "정지·복구", summary: "2명의 승인자가 복구하고 새 epoch의 위임만 다시 사용할 수 있습니다." },
] as const;

type SceneId = typeof scenes[number]["id"];

export function LandingPage() {
  return (
    <div className="landing-page">
      <section className="hero-section">
        <div className="hero-copy">
          <span className="mode-tag preview"><CircleDot size={14} /> UI PREVIEW · 모의 데이터</span>
          <h1>이 연락, 정말 기관이 승인했을까요?</h1>
          <p>기관이 승인한 연락인지 전화를 받는 순간 확인하고, 통화 중 위험한 요구는 별도로 안내합니다.</p>
          <div className="hero-actions">
            <Link className="button primary" to="/demo"><Play size={18} />3분 데모 시작</Link>
            <Link className="button quiet" to="/evidence">기술 구조 보기<ArrowRight size={18} /></Link>
          </div>
          <p className="scope-note">실제 기관 연동이 아닌, 모의 기관·합성 데이터 기반 작동형 개념검증입니다.</p>
        </div>
        <EvidenceSwitchboard state="CONNECTED_VERIFIED" compact />
      </section>
      <section className="steps-section" aria-labelledby="steps-heading">
        <h2 id="steps-heading">믿으라는 이름 대신, 확인할 수 있는 경로</h2>
        <div className="steps-line">
          <article><Landmark aria-hidden="true" /><h3>기관이 연락을 승인합니다</h3><p>위임만으로는 부족합니다. 수신자와 목적을 정한 개별 승인서가 필요합니다.</p></article>
          <article><Link2 aria-hidden="true" /><h3>실제 연결과 묶습니다</h3><p>승인서·수신 세션·게이트웨이 키·WebRTC 전송 문맥을 대조합니다.</p></article>
          <article><FileCheck2 aria-hidden="true" /><h3>공식 업무로 이어집니다</h3><p>민감한 서류는 전화 증명만으로 열지 않고, 별도 로그인과 객체 권한을 확인합니다.</p></article>
        </div>
      </section>
    </div>
  );
}

export function DemoPage() {
  const [scene, setScene] = useState<SceneId>("normal");
  const [state, setState] = useState<VerificationState>("CHECKING");
  const [reason, setReason] = useState("실행 전입니다. 아래 버튼은 실제 브라우저 verifier fixture를 호출합니다.");
  const [running, setRunning] = useState(false);
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<{ status: string; profile: string }>("/health"), enabled: !publicPreview });
  const selected = scenes.find((item) => item.id === scene)!;

  async function run() {
    setRunning(true);
    setState("CHECKING");
    setReason("서명과 필드, witness threshold, freshness를 확인하고 있습니다.");
    try {
      const result = await runPreviewFixture(scene);
      setState(result.state);
      setReason(result.reason);
    } catch (error) {
      setState("UNAVAILABLE");
      setReason(error instanceof Error ? error.message : "검증을 실행하지 못했습니다.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { setState("CHECKING"); setReason("장면을 선택했습니다. 실제 검증 fixture를 실행해 결과를 확인하세요."); }, [scene]);

  return (
    <div className="demo-page">
      <div className="demo-topline">
        <span className={`mode-tag ${health.data ? "live" : "preview"}`}><Radio size={14} />{publicPreview ? "PUBLIC · UI PREVIEW" : health.data ? "LIVE · 로컬 API 연결" : "UI PREVIEW · API 확인 중"}</span>
        {publicPreview ? <a href="https://github.com/0u-Y/CallSign#실행" className="text-link">LIVE 로컬 실행 안내<ArrowRight size={16} /></a> : <Link to="/receiver" className="text-link">두 창으로 실제 통화 열기<ArrowRight size={16} /></Link>}
      </div>
      <ol className="scene-rail" aria-label="핵심 데모 장면">
        {scenes.map((item, index) => <li key={item.id}><button className={scene === item.id ? "active" : ""} onClick={() => setScene(item.id)}><span>{index + 1}</span>{item.short}</button></li>)}
      </ol>
      <section className="demo-intro">
        <div><h1>{selected.title}</h1><p>{selected.summary}</p></div>
        <button className="button primary" onClick={run} disabled={running}>{running ? <><RotateCcw className="spin" size={18} />검증 중</> : <><Play size={18} />이 장면 실행</>}</button>
      </section>
      <div className="demo-stage">
        <div className="route-column">
          <EvidenceSwitchboard state={state} />
          <details className="reason-panel"><summary>왜 이런 결과인가요?<ChevronDown size={18} /></summary><p>{reason}</p><p className="technical-note">이 화면의 빠른 재현은 브라우저 안에서 실제 Ed25519와 3-of-4 검증 함수를 실행하는 합성 fixture입니다. Besu LIVE 통합 결과와 구분합니다.</p></details>
        </div>
        <ReceiverCard state={state} />
      </div>
    </div>
  );
}

export function ReceiverPage() {
  const [state, setState] = useState<VerificationState>("UNVERIFIED");
  const [message, setMessage] = useState("테스트 세션을 준비하면 수신 대기 상태가 됩니다.");
  const [prepared, setPrepared] = useState(false);
  const [transportProfile, setTransportProfile] = useState("");
  const [audioBytes, setAudioBytes] = useState(0);
  const keyRef = useRef<Awaited<ReturnType<typeof generateBrowserSigningKey>> | null>(null);
  const enrollmentRef = useRef<Enrollment | null>(null);
  const trustRef = useRef<TrustKeys | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const authorizationRef = useRef<AuthorizationRow | null>(null);
  const challengeRef = useRef<Awaited<ReturnType<typeof createRecipientChallenge>> | null>(null);
  const bindingHashRef = useRef("");
  const gatewayKeyRef = useRef<{ publicJwk: import("jose").JWK; kid: string } | null>(null);
  const stateGuardRef = useRef(new MonotonicStateGuard());
  const stateDeadlineRef = useRef<number | null>(null);
  const statePollRef = useRef<number | null>(null);
  const ledgerVerifiedRef = useRef(false);
  const transportVerifiedRef = useRef(false);
  const directoryHashRef = useRef<string | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && authorizationRef.current) {
        ledgerVerifiedRef.current = false;
        setState("UNAVAILABLE");
        setMessage("백그라운드에서 돌아와 정상 표시를 먼저 숨겼습니다. 최신 원장 상태를 다시 확인합니다.");
        void refreshLedgerState();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      socketRef.current?.close(); peerRef.current?.close();
      if (stateDeadlineRef.current !== null) window.clearTimeout(stateDeadlineRef.current);
      if (statePollRef.current !== null) window.clearInterval(statePollRef.current);
    };
  }, []);

  async function refreshLedgerState(): Promise<void> {
    const authorization = authorizationRef.current?.payload;
    const gateway = gatewayKeyRef.current;
    const trust = trustRef.current;
    if (!authorization || !gateway || !trust) return;
    try {
      const verified = await verifyLedgerAuthorization(authorization, gateway.publicJwk, trust);
      stateGuardRef.current.accept(verified, performance.now());
      ledgerVerifiedRef.current = true;
      directoryHashRef.current = verified.snapshot.directoryHash;
      if (stateDeadlineRef.current !== null) window.clearTimeout(stateDeadlineRef.current);
      stateDeadlineRef.current = window.setTimeout(() => {
        ledgerVerifiedRef.current = false;
        setState("UNAVAILABLE");
        setMessage("상태 snapshot의 monotonic freshness deadline이 지나 인증 표시를 철회했습니다.");
      }, Math.max(0, verified.deadlineMonotonicMs - performance.now()));
      setState(transportVerifiedRef.current ? "CONNECTED_VERIFIED" : "APPROVAL_VERIFIED");
      setMessage(transportVerifiedRef.current ? `witness ${verified.signerIds.length}개와 현재 전송을 확인했습니다.` : `witness ${verified.signerIds.length}개가 같은 확정 블록의 위임 상태를 증언했습니다.`);
    } catch (error) {
      ledgerVerifiedRef.current = false;
      const reason = error instanceof Error ? error.message : "STATE_VERIFICATION_FAILED";
      setState(reason.includes("REVOK") || reason.includes("NOT_ACTIVE") ? "REJECTED" : "UNAVAILABLE");
      setMessage(`원장 상태 확인 철회: ${reason}. 통화 연결은 강제로 끊지 않습니다.`);
    }
  }

  async function onSignal(signal: SignalMessage) {
    try {
      if (signal.type === "invite") {
        const row = signal.payload as AuthorizationRow;
        const trust = trustRef.current!;
        await verifyIncomingAuthorization(row, trust);
        authorizationRef.current = row;
        const challenge = await createRecipientChallenge({ key: keyRef.current!, enrollment: enrollmentRef.current!, sessionId: signal.sessionId, networkId: trust.networkId, registryAddress: trust.registryAddress });
        challengeRef.current = challenge;
        setState("CONNECTING");
        setMessage("개별 승인서의 서명과 수신 대상을 확인했습니다. 실제 연결 문맥을 만들고 있습니다.");
        sendSignal(socketRef.current!, { type: "challenge", toUserId: GATEWAY_ID, sessionId: signal.sessionId, payload: { challenge: challenge.payload, challengeJws: challenge.jws, enrollment: enrollmentRef.current, recipientPublicJwk: keyRef.current!.publicJwk, recipientKid: keyRef.current!.kid } });
      }
      if (signal.type === "offer") {
        const payload = signal.payload as { sdp: string };
        const peer = createPeer();
        peerRef.current = peer;
        peer.addEventListener("connectionstatechange", () => {
          if (["failed", "disconnected", "closed"].includes(peer.connectionState)) { setState("ENDED"); setMessage("브라우저 전송 연결이 끝나 인증 표시를 철회했습니다."); }
        });
        peer.addEventListener("datachannel", (event) => {
          channelRef.current = event.channel;
          event.channel.addEventListener("message", async (messageEvent) => {
            const value = JSON.parse(String(messageEvent.data)) as Record<string, unknown>;
            if (value.type === "gateway-transcript") {
              const gateway = gatewayKeyRef.current!;
              const transcript = value.transcript as import("@callsign/protocol").TransportTranscript;
              const { verifyTransportTranscript, makeTransportTranscript } = await import("../lib/rtc.js");
              await verifyTransportTranscript(String(value.jws), transcript, gateway.publicJwk, gateway.kid, "gateway");
              const receiver = await makeTransportTranscript("receiver", transcript.bindingHash, transcript.receiverNonce, transcript.gatewayNonce, keyRef.current!, trustRef.current!);
              event.channel.send(JSON.stringify({ type: "receiver-transcript", transcript: receiver.payload, jws: receiver.jws }));
            }
            if (value.type === "confirmed") {
              const expected = authorizationRef.current ? (await import("@callsign/protocol")).extractSingleSdpFingerprint(peer.remoteDescription!.sdp) : "";
              const observed = await verifyObservedTransport(peer, event.channel, expected);
              setTransportProfile(observed.profile);
              setAudioBytes(observed.bytesReceived);
              transportVerifiedRef.current = true;
              if (ledgerVerifiedRef.current) {
                setState("CONNECTED_VERIFIED");
                setMessage("3-of-4 원장 상태와 실제 DTLS 인증서·데이터채널 문맥을 모두 확인했습니다.");
              } else {
                setState("UNAVAILABLE");
                setMessage("실제 전송은 확인했지만 최신 원장 상태를 확증하지 못해 연결 인증을 유보합니다.");
              }
            }
          });
        });
        await peer.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        await peer.setLocalDescription(await peer.createAnswer());
        await waitForIceComplete(peer);
        sendSignal(socketRef.current!, { type: "answer", toUserId: GATEWAY_ID, sessionId: signal.sessionId, payload: { sdp: peer.localDescription!.sdp } });
      }
      if (signal.type === "proof") {
        const payload = signal.payload as {
          binding: import("@callsign/protocol").SessionBinding;
          receipt: import("@callsign/protocol").ConsumptionReceipt;
          receiptJws: string;
          sessionProof: import("@callsign/protocol").SessionProof;
          sessionProofJws: string;
          gatewayPublicJwk: import("jose").JWK;
          gatewayKid: string;
        };
        const row = authorizationRef.current!;
        const peer = peerRef.current!;
        gatewayKeyRef.current = { publicJwk: payload.gatewayPublicJwk, kid: payload.gatewayKid };
        bindingHashRef.current = await verifyProofPackage({ ...payload, authorization: row.payload, authorizationHash: row.authorizationHash, issuerPublicKey: trustRef.current!.issuerPublicKey, issuerKid: trustRef.current!.issuerKid, localSdp: peer.localDescription!.sdp, remoteSdp: peer.remoteDescription!.sdp });
        await refreshLedgerState();
        if (statePollRef.current === null) statePollRef.current = window.setInterval(() => { void refreshLedgerState(); }, 3_000);
        const channel = channelRef.current!;
        const receiverNonce = randomId("transport_receiver");
        channel.send(JSON.stringify({ type: "hello", bindingHash: bindingHashRef.current, receiverNonce }));
        setState("CONNECTING");
        setMessage("승인서·1회 영수증·양측 SDP 문맥을 확인했습니다. 현재 DTLS 인증서와 상호 challenge를 대조합니다.");
      }
      if (signal.type === "hangup") { peerRef.current?.close(); setState("ENDED"); setMessage("상대가 통화를 종료했습니다."); }
    } catch (error) {
      setState("REJECTED");
      setMessage(error instanceof Error ? `검증 거절: ${error.message}` : "검증 조건이 일치하지 않습니다.");
    }
  }

  async function prepare() {
    setState("CHECKING");
    setMessage("Alice 테스트 세션과 비추출형 수신 키를 준비하고 있습니다.");
    try {
      await demoLogin("alice-demo");
      const key = await generateBrowserSigningKey();
      const [enrollment, trust] = await Promise.all([
        api<Enrollment>("/recipient/enroll-session", { method: "POST", body: JSON.stringify({ publicJwk: key.publicJwk, kid: key.kid }) }),
        loadTrustKeys(),
      ]);
      sessionStorage.setItem("ip_receiver_enrollment", enrollment.id);
      keyRef.current = key;
      enrollmentRef.current = enrollment;
      trustRef.current = trust;
      socketRef.current = openSignaling((signal) => { void onSignal(signal); }, (status) => {
        if (status === "SIGNALING_READY") setMessage("수신 세션과 인증된 signaling 연결이 준비됐습니다. 게이트웨이에서 연락을 시작하세요.");
        if (status.endsWith("ERROR") || status.endsWith("CLOSED")) { setState("UNAVAILABLE"); setMessage("signaling 연결을 사용할 수 없습니다."); }
      });
      setPrepared(true);
      setState("CHECKING");
      setMessage("수신 세션이 준비됐습니다. 게이트웨이 창에서 승인 연락을 시작하세요.");
    } catch (error) {
      setState("UNAVAILABLE");
      setMessage(error instanceof Error ? error.message : "세션을 준비하지 못했습니다.");
    }
  }

  async function openOfficialDirectory() {
    try {
      const directory = await api<{ origin: string; path: string; directoryHash: string }>("/directory/inst_mock_a_city_01HZZZZZZZZZZZZZZZZ");
      if (directoryHashRef.current && directory.directoryHash.toLowerCase() !== directoryHashRef.current.toLowerCase()) throw new Error("DIRECTORY_HASH_MISMATCH");
      const target = new URL(directory.path, directory.origin);
      if (target.origin !== window.location.origin || target.pathname !== "/official" || target.search || target.hash) throw new Error("DIRECTORY_TARGET_NOT_ALLOWED");
      window.location.assign(target.href);
    } catch (error) {
      setMessage(error instanceof Error ? `공식 경로 확인 실패: ${error.message}` : "공식 경로를 확인하지 못했습니다.");
    }
  }

  return (
    <div className="receiver-page">
      <section className="receiver-settings">
        <span className="mode-tag live"><Radio size={14} /> LIVE · 수신자 브라우저</span>
        <h1>기관 연락 수신</h1>
        <p>설정과 테스트 계정 선택은 전화 화면 밖에서 처리합니다. 마이크는 사용자가 통화를 수락한 뒤에만 선택할 수 있습니다.</p>
        <div className="setup-checklist">
          <p className={prepared ? "done" : ""}><span>{prepared ? <Check /> : "1"}</span> Alice 테스트 세션</p>
          <p><span>2</span> 게이트웨이 창 연결</p>
          <p><span>3</span> 실제 승인 연락 수신</p>
        </div>
        <button className="button primary" onClick={prepare} disabled={prepared}>{prepared ? "세션 준비 완료" : "테스트 세션 준비"}</button>
        <Link className="button secondary" to="/gateway" target="_blank">게이트웨이 창 열기<ArrowRight size={18} /></Link>
      </section>
      <div className="receiver-side"><ReceiverCard state={state} message={message} interactive onOfficial={() => { void openOfficialDirectory(); }} onAccept={() => {
        channelRef.current?.send(JSON.stringify({ type: "accept" }));
        setMessage("통화를 수락했습니다. 발신 측 생성 음원의 실제 수신 바이트를 확인합니다.");
        window.setTimeout(async () => {
          const stats = await peerRef.current?.getStats();
          let received = 0;
          stats?.forEach((report) => { if (report.type === "inbound-rtp" && report.kind === "audio") received += Number(report.bytesReceived ?? 0); });
          setAudioBytes(received);
          if (received > 0) setMessage(ledgerVerifiedRef.current ? "수락 뒤 생성 음원의 실제 RTP 수신 바이트 증가와 최신 원장 상태를 확인했습니다." : "수락 뒤 실제 RTP 수신은 확인했지만 최신 원장 상태를 확증하지 못했습니다.");
        }, 1200);
      }} /><output className="technical-note" data-testid="transport-profile" data-audio-bytes={audioBytes}>{transportProfile && `관측 프로파일: ${transportProfile} · 오디오 수신 ${audioBytes} bytes`}</output><TranscriptRiskPanel ready={prepared} /></div>
    </div>
  );
}

type RiskResult = {
  signals: Array<{ category: string; evidenceSpan: string; explanation: string }>;
  recommendedAction: string;
  limitations: string;
  engine: "ollama" | "rules";
  model: string | null;
  authenticationIndependent: true;
};

const riskFixture = "보안 확인을 위해 인증번호를 알려주시고 원격제어 앱을 설치하세요. 이 내용은 가족에게 비밀로 해주세요.";

function TranscriptRiskPanel({ ready }: { ready: boolean }) {
  const [result, setResult] = useState<RiskResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function analyze() {
    setRunning(true);
    setError("");
    try {
      setResult(await api<RiskResult>("/risk/analyze", { method: "POST", body: JSON.stringify({ transcript: riskFixture, consent: true }) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "전사문을 분석하지 못했습니다.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="risk-panel" aria-labelledby="risk-title">
      <div className="risk-heading">
        <span className="risk-icon"><AlertTriangle size={18} /></span>
        <div><h2 id="risk-title">통화 내용 위험 안내</h2><p>발신 인증과 독립된 읽기 전용 보조 기능</p></div>
      </div>
      <p className="fixture-label">동의한 합성 전사문</p>
      <blockquote>“{riskFixture}”</blockquote>
      {!result && !error && <button className="button secondary" type="button" onClick={() => { void analyze(); }} disabled={!ready || running}>{running ? <><RotateCcw className="spin" size={18} />분석 중</> : ready ? "위험 요구 분석" : "테스트 세션 준비 후 분석"}</button>}
      {error && <div className="risk-error" role="alert"><p>{error}</p><button className="button secondary" type="button" onClick={() => { void analyze(); }}>다시 분석</button></div>}
      {result && <div className="risk-result" aria-live="polite" data-testid="risk-result">
        <p className="risk-engine">{result.engine === "ollama" ? `LOCAL LLM · ${result.model}` : "규칙 기반 분석"}</p>
        {result.signals.length > 0 ? <ul>{result.signals.map((signal) => <li key={`${signal.category}:${signal.evidenceSpan}`}><strong>{signal.category}</strong><q>{signal.evidenceSpan}</q><span>{signal.explanation}</span></li>)}</ul> : <p>현재 규칙에서 찾은 위험 신호가 없습니다.</p>}
        <p className="risk-action"><strong>권장 행동</strong>{result.recommendedAction}</p>
        <small>{result.limitations}</small>
      </div>}
    </section>
  );
}

function EvidenceSwitchboard({ state, compact = false }: { state: VerificationState; compact?: boolean }) {
  const verified = state === "CONNECTED_VERIFIED";
  const approval = ["APPROVAL_VERIFIED", "CONNECTING", "CONNECTED_VERIFIED"].includes(state);
  const rejected = ["REJECTED", "UNVERIFIED", "UNAVAILABLE"].includes(state);
  const rows = [
    { label: "기관 승인 확인", description: approval || verified ? "개별 연락 승인서 서명과 수신 대상을 확인했습니다." : rejected ? "승인서가 없거나 대상이 일치하지 않습니다." : "기관 승인서를 확인하고 있습니다.", ok: approval || verified },
    { label: "발신 권한 확인", description: approval || verified ? "현재 epoch의 위임과 목적 범위를 확인했습니다." : rejected ? "현재 유효한 발신 위임을 확인하지 못했습니다." : "3-of-4 상태 snapshot을 확인하고 있습니다.", ok: approval || verified },
    { label: "현재 연결 확인", description: verified ? "서명 문맥과 현재 DTLS·datachannel을 대조했습니다." : rejected ? "현재 연결 문맥을 확증하지 못했습니다." : "실제 브라우저 연결을 기다리고 있습니다.", ok: verified },
  ];
  return (
    <section className={`switchboard ${compact ? "compact" : ""}`} aria-label="검증 경로와 현재 상태">
      {!compact && <div className="switchboard-heading"><div><h2>검증 경로와 현재 상태</h2><p>모의 데이터 · 상세 hash는 접어둠</p></div><StatusBadge state={state} /></div>}
      <div className="route-flow"><span className="route-end"><Phone size={18} />연락 요청</span><div className={`route-line ${approval ? "active" : rejected ? "broken" : ""}`}><i /><i /><i /></div><span className="route-end"><Headphones size={18} />상담 연결</span></div>
      <div className="evidence-rows">
        {rows.map((row, index) => <article key={row.label} className={row.ok ? "ok" : rejected ? "fail" : "pending"}><span className="node">{row.ok ? <Check size={16} /> : rejected ? <X size={16} /> : index + 1}</span><div><h3>{row.label}</h3><p>{row.description}</p></div></article>)}
      </div>
      {compact && <div className="switchboard-receiver"><p>모의 A시청</p><StatusBadge state={state} /><small>통화 내용 전체의 안전을 의미하지 않습니다.</small></div>}
    </section>
  );
}

function ReceiverCard({ state, message, interactive = false, onAccept, onOfficial }: { state: VerificationState; message?: string; interactive?: boolean; onAccept?: () => void; onOfficial?: () => void }) {
  const copy = statusCopy[state];
  const [accepted, setAccepted] = useState(false);
  return (
    <section className="receiver-card" aria-live="polite">
      <div className="receiver-meta"><span>모의 기관</span><span>합성 데이터</span></div>
      <div className="caller-symbol" aria-hidden="true"><Building2 /></div>
      <p className="caller-label">표시 이름</p><h2>{state === "UNVERIFIED" ? "기관명 주장 · 미확인" : "모의 A시청"}</h2>
      <StatusBadge state={state} />
      <p className="receiver-message">{message ?? copy.body}</p>
      <div className="call-actions">
        <button className="call-button accept" disabled={!interactive || state === "CHECKING"} onClick={() => { setAccepted(true); onAccept?.(); }}><Phone size={22} />{accepted ? "통화 수락됨" : "전화 받기"}</button>
        <button className="call-button reject" disabled={!interactive}><PhoneOff size={22} />거절</button>
      </div>
      <button type="button" className="official-link" onClick={onOfficial ?? (() => window.location.assign("/official"))}><FileCheck2 size={18} />공식 업무에서 확인</button>
      <p className="safety-copy">인증 결과와 통화 내용의 안전성은 별개입니다.</p>
    </section>
  );
}

async function runPreviewFixture(scene: SceneId): Promise<{ state: VerificationState; reason: string }> {
  if (scene === "copy") return { state: "REJECTED", reason: "Alice용 recipientId와 nonce가 Bob 세션에 일치하지 않아 RECIPIENT_MISMATCH로 거절됐습니다." };
  const now = Math.floor(Date.now() / 1000);
  const base: StateSnapshot = {
    protocol: "callsign", version: 1, type: "SignedStateSnapshot", networkId: "20260914", genesisHash: `0x${"11".repeat(32)}`,
    registryAddress: "0x1111111111111111111111111111111111111111", policyVersion: "1", blockNumber: scene === "recovery" ? "44" : "42", blockHash: `0x${(scene === "recovery" ? "44" : "22").repeat(32)}`,
    blockTimestamp: now - 1, institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ", institutionState: { exists: true, status: "Active", epoch: scene === "recovery" ? "3" : "1", approvalPublicKey: "approval_0123456789abcdef0123456789abcdef", policyVersion: "1" },
    delegationId: scene === "recovery" ? "delegation_new_01HZZZZZZZZZZZZZZZZZ" : "delegation_01HZZZZZZZZZZZZZZZZZZZ",
    delegationState: { exists: true, epoch: scene === "recovery" ? "3" : "1", gatewayPublicKey: "gateway_0123456789abcdef0123456789abcdef", purposeMask: "1", validFrom: now - 60, validUntil: now + 600, revoked: scene === "revoked" },
    directoryHash: `0x${"33".repeat(32)}`, directoryVersion: "1",
  };
  const keys = await Promise.all(Array.from({ length: 4 }, () => generateEd25519KeyPair()));
  const signatures = await Promise.all(keys.slice(0, 3).map(async (key, index) => ({ witnessId: `witness-${index + 1}`, jws: await new CompactSign(canonicalBytes(base)).setProtectedHeader({ alg: "EdDSA", typ: "callsign/SignedStateSnapshot+jws", kid: key.kid }).sign(key.privateKey) })));
  const trust: TrustBundle = { networkId: base.networkId, genesisHash: base.genesisHash, registryAddress: base.registryAddress, policyVersion: "1", witnessThreshold: 3, witnessPublicKeys: keys.map((key, index) => ({ witnessId: `witness-${index + 1}`, kid: key.kid, jwk: key.publicJwk })), enrollmentPublicKey: keys[0]!.publicJwk, supportedProtocolVersions: [1] };
  await verifyStateBundle({ snapshot: base, signatures }, trust, { nowWallSeconds: now, nowMonotonicMs: performance.now(), expectedInstitutionId: base.institutionId, expectedDelegationId: base.delegationId });
  if (base.delegationState.revoked) return { state: "REJECTED", reason: "3개 witness가 같은 확정 block에서 revoked=true를 증언해 발신 권한 확인이 철회됐습니다." };
  if (scene === "recovery") return { state: "APPROVAL_VERIFIED", reason: "복구 후 epoch=3과 새 위임이 일치했습니다. 실제 통화가 연결되기 전이므로 APPROVAL_VERIFIED까지만 표시합니다." };
  return { state: "APPROVAL_VERIFIED", reason: "서로 다른 3개 witness의 동일 payload 서명, 기관 Active, epoch와 위임 범위를 확인했습니다. 실제 WebRTC 연결 전이므로 연결 확인은 부여하지 않습니다." };
}
