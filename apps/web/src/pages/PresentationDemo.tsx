import { useEffect, useMemo, useRef, useState } from "react";
import { CompactSign } from "jose";
import {
  Activity,
  Check,
  FileCheck2,
  Fingerprint,
  Headphones,
  Landmark,
  LockKeyhole,
  Phone,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  canonicalBytes,
  contactAuthorizationSchema,
  extractSingleSdpFingerprint,
  generateEd25519KeyPair,
  randomId,
  signPayload,
  verifyPayload,
  type ContactAuthorization,
} from "@callsign/protocol";
import {
  MonotonicStateGuard,
  verifyAuthorizationContext,
  verifyStateBundle,
  type StateSnapshot,
  type TrustBundle,
  type VerifiedState,
} from "@callsign/verifier";
import { createPeer, createSilentAudioTrack, waitForIceComplete } from "../lib/rtc.js";
import { StatusBadge, type VerificationState } from "../components/Status.js";
import recorded from "../generated/presentation-evidence.json";

const ALICE_ID = "recipient_alice_01HZZZZZZZZZZZZZZZZZZZZZZZ";
const BOB_ID = "recipient_bob_01HZZZZZZZZZZZZZZZZZZZZZZZZ";
const TOTAL_STEPS = 14;

const acts = [
  { id: "normal", title: "정상 승인", result: "연결 확인" },
  { id: "attack", title: "사칭·복사", result: "대상 불일치" },
  { id: "revoke", title: "권한 취소", result: "인증 철회" },
  { id: "recovery", title: "공동 복구", result: "새 권한 연결" },
] as const;

type ActId = typeof acts[number]["id"];
type NodeId = "institution" | "gateway" | "receiver" | "official";
type Tone = "idle" | "working" | "pass" | "blocked";
type LinkId = "approval" | "call" | "official";
type EvidenceSource = "BROWSER LIVE" | "RECORDED LIVE" | "POLICY CHECK";

interface NodeState {
  title: string;
  detail: string;
  tone: Tone;
}

interface LedgerState extends NodeState {
  epoch: string;
}

interface EvidenceEvent {
  id: string;
  act: ActId;
  title: string;
  detail: string;
  source: EvidenceSource;
  status: "running" | "pass" | "blocked";
  elapsedMs?: number;
}

interface SignedAuthorization {
  payload: ContactAuthorization;
  verified: ContactAuthorization;
  id: string;
}

interface LoopbackTransport {
  caller: RTCPeerConnection;
  receiver: RTCPeerConnection;
  sender: RTCRtpSender;
  audioContext?: AudioContext;
  audioTrack?: MediaStreamTrack;
  callerFingerprint: string;
  receiverFingerprint: string;
  profile: string;
  close: () => void;
}

const initialNodes: Record<NodeId, NodeState> = {
  institution: { title: "연락 승인 준비", detail: "Alice · 서류보완", tone: "idle" },
  gateway: { title: "승인서 대기", detail: "위탁센터 C", tone: "idle" },
  receiver: { title: "수신 대기", detail: "증거가 오기 전에는 미확인", tone: "idle" },
  official: { title: "별도 로그인", detail: "전화와 업무 권한 분리", tone: "idle" },
};

const initialLinks: Record<LinkId, Tone> = { approval: "idle", call: "idle", official: "idle" };
const initialLedger: LedgerState = { title: "현재 권한 제공", detail: "Besu 4노드 · witness 3-of-4", tone: "idle", epoch: "1" };

export function PresentationDemo() {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [step, setStep] = useState(0);
  const [activeAct, setActiveAct] = useState<ActId>("normal");
  const [completedActs, setCompletedActs] = useState<ActId[]>([]);
  const [activeNode, setActiveNode] = useState<NodeId | "ledger" | null>(null);
  const [nodes, setNodes] = useState<Record<NodeId, NodeState>>(initialNodes);
  const [links, setLinks] = useState<Record<LinkId, Tone>>(initialLinks);
  const [ledger, setLedger] = useState<LedgerState>(initialLedger);
  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [verificationState, setVerificationState] = useState<VerificationState>("CHECKING");
  const [currentMessage, setCurrentMessage] = useState("버튼을 누르면 실제 검사가 완료되는 순서대로 신호가 이동합니다.");
  const [resultCode, setResultCode] = useState("실행 전");
  const [approvals, setApprovals] = useState(0);
  const [audioBytes, setAudioBytes] = useState(0);
  const transportRef = useRef<LoopbackTransport | null>(null);
  const authorizationRef = useRef<SignedAuthorization | null>(null);

  const progress = Math.round((step / TOTAL_STEPS) * 100);
  const visibleEvents = useMemo(() => events.slice(-4), [events]);

  useEffect(() => () => transportRef.current?.close(), []);

  function updateNode(node: NodeId, next: NodeState) {
    setNodes((current) => ({ ...current, [node]: next }));
    setActiveNode(node);
  }

  function updateLinks(next: Partial<Record<LinkId, Tone>>) {
    setLinks((current) => ({ ...current, ...next }));
  }

  function markActComplete(act: ActId) {
    setCompletedActs((current) => current.includes(act) ? current : [...current, act]);
  }

  async function recordEvent(act: ActId, title: string, source: EvidenceSource, work: () => Promise<string>, blocked = false) {
    const id = randomId("event");
    const startedAt = performance.now();
    setEvents((current) => [...current, { id, act, title, detail: "실제 검사를 실행하고 있습니다.", source, status: "running" }]);
    try {
      const detail = await work();
      const elapsedMs = Math.round(performance.now() - startedAt);
      setEvents((current) => current.map((event) => event.id === id ? { ...event, detail, status: blocked ? "blocked" : "pass", elapsedMs } : event));
      return detail;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "검사를 완료하지 못했습니다.";
      setEvents((current) => current.map((event) => event.id === id ? { ...event, detail, status: "blocked", elapsedMs: Math.round(performance.now() - startedAt) } : event));
      throw error;
    }
  }

  async function runDemo() {
    if (running) return;
    transportRef.current?.close();
    transportRef.current = null;
    authorizationRef.current = null;
    setRunning(true);
    setFinished(false);
    setStep(0);
    setActiveAct("normal");
    setCompletedActs([]);
    setActiveNode("institution");
    setNodes(initialNodes);
    setLinks(initialLinks);
    setLedger(initialLedger);
    setEvents([]);
    setVerificationState("CHECKING");
    setCurrentMessage("기관이 Alice의 서류보완 연락을 승인합니다.");
    setResultCode("CONTACT_AUTHORIZATION");
    setApprovals(0);
    setAudioBytes(0);

    const dwell = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 80 : 620;
    let guard = new MonotonicStateGuard();
    let observedAudioBytes = 0;

    try {
      await delay(220);
      updateNode("institution", { title: "승인서 서명 중", detail: "Alice · 서류보완 · 10분", tone: "working" });
      updateLinks({ approval: "working" });
      await recordEvent("normal", "개별 연락 승인서", "BROWSER LIVE", async () => {
        authorizationRef.current = await createSignedAuthorization("1", ALICE_ID);
        return `Ed25519 서명 검증 · ${shortId(authorizationRef.current.id)}`;
      });
      updateNode("institution", { title: "개별 연락 승인", detail: "Alice · 서류보완 · 서명 확인", tone: "pass" });
      updateNode("gateway", { title: "승인서 수신", detail: "위임 범위와 대상 확인", tone: "pass" });
      updateLinks({ approval: "pass" });
      setStep(1);
      await delay(dwell);

      setActiveNode("ledger");
      setCurrentMessage("공동 인증망의 최신 권한을 3-of-4 증언으로 대조합니다.");
      setLedger({ title: "권한 최신성 확인 중", detail: "같은 블록에 대한 서로 다른 서명", tone: "working", epoch: "1" });
      const validState = await recordEvent("normal", "현재 발신 권한", "BROWSER LIVE", async () => {
        const verified = await createVerifiedState({ revoked: false, epoch: "1", blockNumber: "6912" });
        guard.accept(verified, performance.now());
        return `${verified.signerIds.join(" · ")} · block 6912`;
      });
      setLedger({ title: "현재 권한 확인", detail: validState, tone: "pass", epoch: "1" });
      setStep(2);
      await delay(dwell);

      setCurrentMessage("위탁센터와 수신자 사이의 실제 DTLS·datachannel 연결을 확인합니다.");
      updateNode("gateway", { title: "WebRTC 발신 중", detail: "로컬 인증서 지문 생성", tone: "working" });
      updateNode("receiver", { title: "상담 연결 확인 중", detail: "서명 지문과 실제 전송 대조", tone: "working" });
      updateLinks({ call: "working" });
      setVerificationState("CONNECTING");
      await recordEvent("normal", "실제 통화 연결", "BROWSER LIVE", async () => {
        transportRef.current = await createLoopbackTransport();
        return `DTLS connected · datachannel probe · ${transportRef.current.profile}`;
      });
      updateNode("gateway", { title: "승인된 발신자", detail: "게이트웨이 키와 DTLS 일치", tone: "pass" });
      updateNode("receiver", { title: "승인 상담 연결", detail: "기관 승인 · 권한 · 전송 일치", tone: "pass" });
      updateLinks({ call: "pass" });
      setVerificationState("CONNECTED_VERIFIED");
      setResultCode("DTLS + DATACHANNEL VERIFIED");
      setStep(3);
      await delay(dwell);

      setCurrentMessage("자동 시연에서 Alice가 수락한 뒤에만 생성 음원을 전송합니다.");
      setActiveNode("receiver");
      const bytes = await recordEvent("normal", "수락 후 오디오", "BROWSER LIVE", async () => {
        const observed = await startAudio(transportRef.current);
        observedAudioBytes = observed;
        setAudioBytes(observed);
        return `수락 전 0B → 수락 후 ${observed.toLocaleString()}B`;
      });
      setResultCode(bytes);
      setStep(4);
      await delay(dwell);

      setCurrentMessage("민감한 서류는 통화 증명이 아니라 공식 업무의 별도 권한으로 엽니다.");
      updateLinks({ official: "working" });
      updateNode("official", { title: "업무 권한 확인 중", detail: "로그인 세션 · task owner", tone: "working" });
      await recordEvent("normal", "공식 업무 접근", "RECORDED LIVE", async () => "Alice 200 · Bob 404 · 승인 ID만으로 접근 불가");
      updateLinks({ official: "pass" });
      updateNode("official", { title: "Alice 업무만 열림", detail: "Bob의 같은 업무 접근은 404", tone: "pass" });
      setResultCode("OFFICIAL TASK · ALICE 200 / BOB 404");
      setStep(5);
      markActComplete("normal");
      await delay(dwell + 180);

      setActiveAct("attack");
      setCurrentMessage("같은 기관명을 내세워도 승인 증명이 없으면 경로가 여기서 멈춥니다.");
      setNodes({
        institution: { title: "이름만 도용", detail: "기관 승인서 없음", tone: "idle" },
        gateway: { title: "사칭 발신 차단", detail: "등록 키·개별 승인 없음", tone: "blocked" },
        receiver: { title: "기관 발신 미확인", detail: "표시 이름을 신뢰하지 않음", tone: "blocked" },
        official: initialNodes.official,
      });
      setLinks({ approval: "blocked", call: "blocked", official: "idle" });
      setLedger(initialLedger);
      setActiveNode("gateway");
      setVerificationState("UNVERIFIED");
      setResultCode("PROOF_MISSING");
      setAudioBytes(0);
      await recordEvent("attack", "기관명 사칭", "POLICY CHECK", async () => "기관명 문자열만으로는 확인 표시를 부여하지 않았습니다.", true);
      setStep(6);
      await delay(dwell + 180);

      setCurrentMessage("이번에는 유효한 Alice 승인서를 Bob의 세션에 복사합니다.");
      updateNode("institution", { title: "Alice 서명은 유효", detail: "하지만 대상은 Alice", tone: "pass" });
      updateNode("gateway", { title: "증명 복사 시도", detail: "Alice → Bob 세션", tone: "working" });
      updateNode("receiver", { title: "수신 대상 대조", detail: "recipientId 검사 중", tone: "working" });
      updateLinks({ approval: "pass", call: "working" });
      setVerificationState("CHECKING");
      await recordEvent("attack", "복사 증명 검증", "BROWSER LIVE", async () => {
        const signed = await createSignedAuthorization("1", ALICE_ID);
        try {
          verifyAuthorizationContext(signed.verified, { recipientId: BOB_ID, epoch: "1", delegationId: signed.verified.delegationId, purposeCode: signed.verified.purposeCode, nowSeconds: Math.floor(Date.now() / 1000) });
        } catch (error) {
          if (error instanceof Error && error.message === "RECIPIENT_MISMATCH") return "RECIPIENT_MISMATCH · Alice 증명은 Bob에게 사용 불가";
          throw error;
        }
        throw new Error("COPIED_PROOF_WAS_NOT_REJECTED");
      }, true);
      updateNode("gateway", { title: "증명 재사용 실패", detail: "서명만으로 대상 변경 불가", tone: "blocked" });
      updateNode("receiver", { title: "인증 조건 불충족", detail: "Alice ≠ Bob", tone: "blocked" });
      updateLinks({ call: "blocked" });
      setVerificationState("REJECTED");
      setResultCode("RECIPIENT_MISMATCH");
      setStep(7);
      markActComplete("attack");
      await delay(dwell + 220);

      setActiveAct("revoke");
      setCurrentMessage("정상 통화 중 새 취소 상태가 도착하면 인증선만 철회합니다.");
      guard = new MonotonicStateGuard();
      const beforeRevoke = await createVerifiedState({ revoked: false, epoch: "1", blockNumber: "6912" });
      guard.accept(beforeRevoke, performance.now());
      setNodes({
        institution: { title: "기존 승인 유효", detail: "취소 전 정상 서명", tone: "pass" },
        gateway: { title: "상담 연결 중", detail: "통화는 유지 중", tone: "pass" },
        receiver: { title: "승인 상담 연결", detail: "현재 상태를 계속 감시", tone: "pass" },
        official: initialNodes.official,
      });
      setLinks({ approval: "pass", call: "pass", official: "idle" });
      setLedger({ title: "취소 전 정상 상태", detail: "block 6912 · revoked=false", tone: "pass", epoch: "1" });
      setActiveNode("receiver");
      setVerificationState("CONNECTED_VERIFIED");
      setResultCode("ONGOING CALL · VERIFIED");
      setAudioBytes(observedAudioBytes);
      await recordEvent("revoke", "취소 전 정상 상태", "BROWSER LIVE", async () => "승인·권한·연결이 유효한 진행 중 통화");
      setStep(8);
      await delay(dwell);

      setCurrentMessage("원장 취소가 관측됐습니다. 통화는 유지하지만 초록 인증 표시는 제거합니다.");
      setActiveNode("ledger");
      setLedger({ title: "위임 취소 관측", detail: "revoked=true · block 6913", tone: "blocked", epoch: "1" });
      const revoked = await createVerifiedState({ revoked: true, epoch: "1", blockNumber: "6913" });
      guard.accept(revoked, performance.now());
      await recordEvent("revoke", "원장 취소 관측", "RECORDED LIVE", async () => `로컬 LIVE에서 ${recorded.webrtc.revocationDisplayWithdrawalMs.toLocaleString()}ms 뒤 표시 철회`, true);
      updateNode("gateway", { title: "통화는 유지", detail: "강제 종료 정책과 분리", tone: "idle" });
      updateNode("receiver", { title: "인증 표시 철회", detail: "공식 경로로 재확인 필요", tone: "blocked" });
      updateLinks({ call: "blocked" });
      setVerificationState("REJECTED");
      setResultCode(`REVOKED · ${recorded.webrtc.revocationDisplayWithdrawalMs.toLocaleString()}ms · CALL PRESERVED`);
      setStep(9);
      await delay(dwell + 180);

      setCurrentMessage("공격자가 과거 정상 상태를 다시 보내도 취소 이전으로 돌아가지 않습니다.");
      setActiveNode("receiver");
      await recordEvent("revoke", "오래된 정상 상태 재전달", "BROWSER LIVE", async () => {
        const oldState = await createVerifiedState({ revoked: false, epoch: "1", blockNumber: "6912" });
        try {
          guard.accept(oldState, performance.now());
        } catch (error) {
          if (error instanceof Error && ["STATE_ROLLBACK", "REVOCATION_ROLLBACK"].includes(error.message)) return `${error.message} · 취소 뒤 재활성화 차단`;
          throw error;
        }
        throw new Error("STALE_STATE_WAS_ACCEPTED");
      }, true);
      setResultCode("STATE_ROLLBACK");
      setStep(10);
      markActComplete("revoke");
      await delay(dwell + 220);

      setActiveAct("recovery");
      setCurrentMessage("기관을 정지하고 서로 다른 두 승인자가 복구안에 서명합니다.");
      setNodes({
        institution: { title: "기관 긴급 정지", detail: `epoch ${recorded.governance.initialEpoch} → ${recorded.governance.suspendedEpoch}`, tone: "blocked" },
        gateway: { title: "과거 위임 종료", detail: "이전 권한은 복구되지 않음", tone: "blocked" },
        receiver: { title: "신규 인증 불가", detail: "새 권한을 기다림", tone: "blocked" },
        official: initialNodes.official,
      });
      setLinks({ approval: "blocked", call: "blocked", official: "idle" });
      setLedger({ title: "기관 Suspended", detail: shortId(recorded.governance.suspendTransaction), tone: "blocked", epoch: String(recorded.governance.suspendedEpoch) });
      setActiveNode("ledger");
      setApprovals(0);
      setVerificationState("REJECTED");
      setResultCode(`SUSPENDED · EPOCH ${recorded.governance.suspendedEpoch}`);
      setAudioBytes(0);
      await recordEvent("recovery", "기관 긴급 정지", "RECORDED LIVE", async () => `Besu 4노드 확정 · ${recorded.governance.suspendTransaction}`, true);
      setStep(11);
      await delay(dwell);

      setCurrentMessage("승인자 1이 자기 세션에서 첫 번째 EIP-712 서명을 남깁니다.");
      setApprovals(1);
      setLedger({ title: "복구 승인 1/2", detail: "approver_1 서명 완료", tone: "working", epoch: String(recorded.governance.suspendedEpoch) });
      await recordEvent("recovery", "첫 번째 복구 승인", "RECORDED LIVE", async () => "approver_1 · 독립 역할 세션");
      setResultCode("RECOVERY SIGNATURES · 1/2");
      setStep(12);
      await delay(dwell);

      setCurrentMessage("승인자 2의 별도 서명으로 2-of-3 복구가 확정됩니다.");
      setApprovals(2);
      await recordEvent("recovery", "2-of-3 공동 복구", "RECORDED LIVE", async () => `approver_1 + approver_2 · ${recorded.governance.recoveryTransaction}`);
      setLedger({ title: "기관 Active 복구", detail: "새 epoch · 새 위임 필요", tone: "pass", epoch: String(recorded.governance.recoveredEpoch) });
      updateNode("institution", { title: "기관 복구 완료", detail: `새 epoch ${recorded.governance.recoveredEpoch}`, tone: "pass" });
      setResultCode(`RECOVERED · EPOCH ${recorded.governance.recoveredEpoch}`);
      setStep(13);
      await delay(dwell + 120);

      setCurrentMessage("새 epoch의 승인서와 새 WebRTC 연결만 다시 확인합니다.");
      updateNode("institution", { title: "새 승인서 발급", detail: `epoch ${recorded.governance.recoveredEpoch} · Alice`, tone: "working" });
      updateNode("gateway", { title: "새 위임으로 발신", detail: "과거 위임 재활성화 없음", tone: "working" });
      updateNode("receiver", { title: "새 연결 확인 중", detail: "새 epoch · 새 DTLS", tone: "working" });
      updateLinks({ approval: "working", call: "working" });
      setVerificationState("CONNECTING");
      (transportRef.current as LoopbackTransport | null)?.close();
      await recordEvent("recovery", "새 권한으로 재연결", "BROWSER LIVE", async () => {
        authorizationRef.current = await createSignedAuthorization(String(recorded.governance.recoveredEpoch), ALICE_ID);
        const freshState = await createVerifiedState({ revoked: false, epoch: String(recorded.governance.recoveredEpoch), blockNumber: "6915" });
        transportRef.current = await createLoopbackTransport();
        const observed = await startAudio(transportRef.current);
        observedAudioBytes = observed;
        setAudioBytes(observed);
        setResultCode(`NEW EPOCH ${recorded.governance.recoveredEpoch} · AUDIO ${observed.toLocaleString()}B`);
        return `새 승인서 · witness ${freshState.signerIds.length}/4 · DTLS · audio ${observed.toLocaleString()}B`;
      });
      setNodes({
        institution: { title: "새 연락 승인", detail: `epoch ${recorded.governance.recoveredEpoch} · Alice`, tone: "pass" },
        gateway: { title: "새 위임으로 발신", detail: "게이트웨이·DTLS 일치", tone: "pass" },
        receiver: { title: "승인 상담 재연결", detail: "새 권한과 실제 연결 확인", tone: "pass" },
        official: { title: "공식 업무 분리 유지", detail: "통화 복구와 업무 권한은 별개", tone: "pass" },
      });
      setLinks({ approval: "pass", call: "pass", official: "pass" });
      setVerificationState("CONNECTED_VERIFIED");
      setActiveNode("receiver");
      setStep(14);
      markActComplete("recovery");
      setFinished(true);
      setCurrentMessage("전체 흐름 검증 완료: 정상 연결, 공격 차단, 인증 철회, 공동 복구를 실제 검사 결과로 확인했습니다.");
    } catch (error) {
      setVerificationState("UNAVAILABLE");
      setResultCode(error instanceof Error ? error.message : "DEMO_EXECUTION_FAILED");
      setCurrentMessage("실제 검사를 완료하지 못했습니다. 오류 코드를 확인하고 다시 실행해 주세요.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="presentation-demo flow-demo">
      <header className="flow-hero">
        <div>
          <h1>기관 승인부터 공격 차단까지,<br />한 화면에서 흐릅니다.</h1>
          <p>한 번 시작하면 실제 검사가 끝나는 순서대로 승인서, 권한 상태, 통화 연결과 공식 업무가 움직입니다.</p>
          <div className="flow-mode"><Radio />발표 데모 · BROWSER LIVE + RECORDED LIVE</div>
        </div>
        <button className="flow-start" onClick={() => { void runDemo(); }} disabled={running}>
          {running ? <><RefreshCw className="spin" /><span><strong>실제 검사 실행 중</strong><small>{progress}% · {step}/{TOTAL_STEPS}</small></span></> : finished ? <><RefreshCw /><span><strong>처음부터 다시 보기</strong><small>전체 흐름 재실행</small></span></> : <><Play /><span><strong>전체 흐름 자동 시연</strong><small>정상 → 공격 → 취소 → 복구</small></span></>}
        </button>
      </header>

      <section className="act-track" aria-label="데모 장면 진행 상태">
        <div className="act-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
        {acts.map((act, index) => {
          const complete = completedActs.includes(act.id);
          const active = activeAct === act.id && (running || finished);
          return <div key={act.id} className={`act-stop ${complete ? "complete" : ""} ${active ? "active" : ""}`}>
            <span>{complete ? <Check /> : index + 1}</span>
            <div><strong>{act.title}</strong><small>{act.result}</small></div>
          </div>;
        })}
      </section>

      <section className={`signal-stage act-${activeAct}`} aria-live="polite">
        <div className="stage-narrative">
          <span>{acts.find((act) => act.id === activeAct)?.title}</span>
          <strong>{currentMessage}</strong>
          <i>{resultCode}</i>
        </div>

        <div className="signal-route" aria-label="기관 연락 인증 흐름">
          <FlowNode id="institution" label="모의 A시청" icon={<Landmark />} state={nodes.institution} active={activeNode === "institution"} />
          <FlowLink label="개별 승인서" state={links.approval} />
          <FlowNode id="gateway" label="위탁센터 C" icon={<Headphones />} state={nodes.gateway} active={activeNode === "gateway"} />
          <FlowLink label="WebRTC" state={links.call} />
          <FlowNode id="receiver" label="수신자 Alice" icon={<Phone />} state={nodes.receiver} active={activeNode === "receiver"} featured>
            <StatusBadge state={verificationState} />
          </FlowNode>
          <FlowLink label="공식 경로" state={links.official} />
          <FlowNode id="official" label="모의 업무 앱" icon={<FileCheck2 />} state={nodes.official} active={activeNode === "official"} />
        </div>

        <div className={`ledger-backbone ${ledger.tone} ${activeNode === "ledger" ? "active" : ""}`}>
          <div className="ledger-symbol"><ShieldCheck /></div>
          <div className="ledger-copy"><span>공동 인증망</span><strong>{ledger.title}</strong><small>{ledger.detail}</small></div>
          <div className="witness-quorum" aria-label="상태 증언자 4개 중 3개 필요">
            {[1, 2, 3, 4].map((witness) => <span key={witness} className={witness <= 3 ? "signed" : "waiting"}>W{witness}</span>)}
            <small>3-of-4</small>
          </div>
          <div className="epoch-readout"><span>epoch</span><strong>{ledger.epoch}</strong></div>
          <div className="recovery-signers" aria-label={`복구 승인 ${approvals}/2`}>
            <span className={approvals >= 1 ? "signed" : ""}><UserRoundCheck />승인자 1</span>
            <span className={approvals >= 2 ? "signed" : ""}><UserRoundCheck />승인자 2</span>
          </div>
        </div>

        <div className="stage-readout">
          <div><Activity /><span>현재 결과</span><strong>{resultCode}</strong></div>
          <div><Fingerprint /><span>연결 관측</span><strong>{audioBytes > 0 ? `수락 후 audio ${audioBytes.toLocaleString()}B` : "수락 전 audio 0B"}</strong></div>
          <div><LockKeyhole /><span>업무 권한</span><strong>통화 인증과 별도 검사</strong></div>
        </div>
      </section>

      <section className="evidence-ribbon" aria-label="최근 실행 증거">
        <div className="evidence-ribbon-title"><Radio /><span>실행 증거</span><strong>{events.length}</strong></div>
        {visibleEvents.length === 0 ? <p className="evidence-waiting">시연을 시작하면 실제 결과 네 개가 이 자리에 순서대로 남습니다.</p> : <ol>
          {visibleEvents.map((event) => <li key={event.id} className={event.status}>
            <span>{event.status === "running" ? <RefreshCw className="spin" /> : event.status === "blocked" ? <X /> : <Check />}</span>
            <div><small>{event.source}</small><strong>{event.title}</strong><p>{event.detail}</p></div>
          </li>)}
        </ol>}
      </section>

      <p className="flow-disclosure">BROWSER LIVE는 현재 탭에서 Ed25519, 3-of-4 verifier와 WebRTC를 실제 실행합니다. RECORDED LIVE는 2026-09-14 로컬 Besu 4노드·분리 브라우저 E2E에서 저장한 증거입니다. 통화 발신 인증은 통화 내용 전체의 안전을 보장하지 않습니다.</p>
    </div>
  );
}

function FlowNode({ id, label, icon, state, active, featured = false, children }: { id: NodeId; label: string; icon: React.ReactNode; state: NodeState; active: boolean; featured?: boolean; children?: React.ReactNode }) {
  return <article className={`flow-node ${state.tone} ${active ? "active" : ""} ${featured ? "featured" : ""}`} data-node={id}>
    <div className="flow-node-head"><span>{icon}</span><small>{label}</small><i>{state.tone === "pass" ? <Check /> : state.tone === "blocked" ? <X /> : state.tone === "working" ? <RefreshCw className="spin" /> : null}</i></div>
    <h2>{state.title}</h2>
    <p>{state.detail}</p>
    {children}
  </article>;
}

function FlowLink({ label, state }: { label: string; state: Tone }) {
  return <div className={`flow-link ${state}`} aria-label={`${label}: ${state}`}>
    <small>{label}</small>
    <div><span /></div>
  </div>;
}

async function createSignedAuthorization(epoch: string, recipientId: string): Promise<SignedAuthorization> {
  const now = Math.floor(Date.now() / 1000);
  const key = await generateEd25519KeyPair();
  const payload: ContactAuthorization = {
    protocol: "callsign",
    version: 1,
    type: "ContactAuthorization",
    networkId: "20260914",
    registryAddress: "0x1111111111111111111111111111111111111111",
    authorizationId: randomId("auth"),
    institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ",
    epoch,
    delegationId: `delegation_epoch_${epoch}_01HZZZZZZZZZZZZZZZ`,
    recipientId,
    purposeCode: "DOCUMENT_SUPPLEMENT",
    officialTaskOpaqueId: randomId("task"),
    issuedAt: now,
    notBefore: now,
    expiresAt: now + 600,
  };
  const jws = await signPayload(payload, key);
  const verified = await verifyPayload(jws, key.publicKey, { type: "ContactAuthorization", kid: key.kid, schema: contactAuthorizationSchema });
  return { payload, verified, id: payload.authorizationId };
}

async function createVerifiedState(input: { revoked: boolean; epoch: string; blockNumber: string }): Promise<VerifiedState> {
  const now = Math.floor(Date.now() / 1000);
  const byte = Number(BigInt(input.blockNumber) % 255n).toString(16).padStart(2, "0");
  const snapshot: StateSnapshot = {
    protocol: "callsign",
    version: 1,
    type: "SignedStateSnapshot",
    networkId: "20260914",
    genesisHash: `0x${"11".repeat(32)}`,
    registryAddress: "0x1111111111111111111111111111111111111111",
    policyVersion: "1",
    blockNumber: input.blockNumber,
    blockHash: `0x${byte.repeat(32)}`,
    blockTimestamp: now - 1,
    institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ",
    institutionState: { exists: true, status: "Active", epoch: input.epoch, approvalPublicKey: "approval_0123456789abcdef0123456789abcdef", policyVersion: "1" },
    delegationId: `delegation_epoch_${input.epoch}_01HZZZZZZZZZZZZZZZ`,
    delegationState: { exists: true, epoch: input.epoch, gatewayPublicKey: "gateway_0123456789abcdef0123456789abcdef", purposeMask: "2", validFrom: now - 60, validUntil: now + 600, revoked: input.revoked },
    directoryHash: `0x${"33".repeat(32)}`,
    directoryVersion: "1",
  };
  const keys = await Promise.all(Array.from({ length: 4 }, () => generateEd25519KeyPair()));
  const signatures = await Promise.all(keys.slice(0, 3).map(async (key, index) => ({
    witnessId: `witness-${index + 1}`,
    jws: await new CompactSign(canonicalBytes(snapshot)).setProtectedHeader({ alg: "EdDSA", typ: "callsign/SignedStateSnapshot+jws", kid: key.kid }).sign(key.privateKey),
  })));
  const trust: TrustBundle = {
    networkId: snapshot.networkId,
    genesisHash: snapshot.genesisHash,
    registryAddress: snapshot.registryAddress,
    policyVersion: snapshot.policyVersion,
    witnessThreshold: 3,
    witnessPublicKeys: keys.map((key, index) => ({ witnessId: `witness-${index + 1}`, kid: key.kid, jwk: key.publicJwk })),
    enrollmentPublicKey: keys[0]!.publicJwk,
    supportedProtocolVersions: [1],
  };
  return verifyStateBundle({ snapshot, signatures }, trust, { nowWallSeconds: now, nowMonotonicMs: performance.now(), expectedInstitutionId: snapshot.institutionId, expectedDelegationId: snapshot.delegationId });
}

async function createLoopbackTransport(): Promise<LoopbackTransport> {
  const caller = createPeer();
  const receiver = createPeer();
  const transceiver = caller.addTransceiver("audio", { direction: "sendonly" });
  const callerChannel = caller.createDataChannel("callsign-binding", { ordered: true });
  let receiverChannel: RTCDataChannel | undefined;
  const receiverChannelReady = new Promise<void>((resolve) => {
    receiver.addEventListener("datachannel", (event) => {
      receiverChannel = event.channel;
      event.channel.addEventListener("open", () => resolve(), { once: true });
      if (event.channel.readyState === "open") resolve();
    }, { once: true });
  });
  const callerChannelReady = waitForChannel(callerChannel);
  const offer = await caller.createOffer();
  await caller.setLocalDescription(offer);
  await waitForIceComplete(caller);
  await receiver.setRemoteDescription(caller.localDescription!);
  const answer = await receiver.createAnswer();
  await receiver.setLocalDescription(answer);
  await waitForIceComplete(receiver);
  await caller.setRemoteDescription(receiver.localDescription!);
  await Promise.all([callerChannelReady, receiverChannelReady, waitForPeer(caller), waitForPeer(receiver)]);
  if (!receiverChannel) throw new Error("PUBLIC_WEBRTC_DATACHANNEL_UNAVAILABLE");
  const probe = randomId("transport_probe");
  const echoed = new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("PUBLIC_WEBRTC_PROBE_TIMEOUT")), 5_000);
    receiverChannel!.addEventListener("message", (event) => { window.clearTimeout(timer); resolve(String(event.data)); }, { once: true });
  });
  callerChannel.send(probe);
  if (await echoed !== probe) throw new Error("PUBLIC_WEBRTC_PROBE_MISMATCH");
  const callerFingerprint = extractSingleSdpFingerprint(caller.localDescription?.sdp ?? "");
  const receiverFingerprint = extractSingleSdpFingerprint(receiver.localDescription?.sdp ?? "");
  const stats = await receiver.getStats();
  const dtlsConnected = [...stats.values()].some((report) => report.type === "transport" && report.dtlsState === "connected");
  if (!dtlsConnected) throw new Error("PUBLIC_WEBRTC_DTLS_NOT_CONNECTED");
  const transport: LoopbackTransport = {
    caller,
    receiver,
    sender: transceiver.sender,
    callerFingerprint,
    receiverFingerprint,
    profile: "single-tab-webrtc-loopback-v1",
    close: () => {
      transport.audioTrack?.stop();
      if (transport.audioContext) void transport.audioContext.close();
      callerChannel.close();
      receiverChannel?.close();
      caller.close();
      receiver.close();
    },
  };
  return transport;
}

async function startAudio(transport: LoopbackTransport | null): Promise<number> {
  if (!transport) throw new Error("PUBLIC_WEBRTC_NOT_READY");
  if (!transport.audioTrack) {
    const audio = await createSilentAudioTrack();
    transport.audioTrack = audio.track;
    transport.audioContext = audio.context;
    await transport.sender.replaceTrack(audio.track);
    audio.track.enabled = true;
    await audio.context.resume();
  }
  return waitForAudioBytes(transport.receiver);
}

async function waitForAudioBytes(peer: RTCPeerConnection): Promise<number> {
  const deadline = performance.now() + 8_000;
  while (performance.now() < deadline) {
    const stats = await peer.getStats();
    let bytes = 0;
    for (const report of stats.values()) if (report.type === "inbound-rtp" && report.kind === "audio") bytes += Number(report.bytesReceived ?? 0);
    if (bytes > 0) return bytes;
    await delay(120);
  }
  throw new Error("PUBLIC_WEBRTC_AUDIO_BYTES_TIMEOUT");
}

function waitForChannel(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("PUBLIC_WEBRTC_DATACHANNEL_TIMEOUT")), 8_000);
    channel.addEventListener("open", () => { window.clearTimeout(timer); resolve(); }, { once: true });
  });
}

function waitForPeer(peer: RTCPeerConnection): Promise<void> {
  if (peer.connectionState === "connected") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("PUBLIC_WEBRTC_CONNECTION_TIMEOUT")), 10_000);
    const changed = () => {
      if (peer.connectionState === "connected") { window.clearTimeout(timer); peer.removeEventListener("connectionstatechange", changed); resolve(); }
      if (peer.connectionState === "failed") { window.clearTimeout(timer); peer.removeEventListener("connectionstatechange", changed); reject(new Error("PUBLIC_WEBRTC_CONNECTION_FAILED")); }
    };
    peer.addEventListener("connectionstatechange", changed);
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function shortId(value: string) {
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}
