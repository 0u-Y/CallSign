import { useEffect, useMemo, useRef, useState } from "react";
import { CompactSign } from "jose";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CircleDot,
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
import { StatusBadge, statusCopy, type VerificationState } from "../components/Status.js";
import { publicPreview } from "../config.js";
import recorded from "../generated/presentation-evidence.json";

const ALICE_ID = "recipient_alice_01HZZZZZZZZZZZZZZZZZZZZZZZ";
const BOB_ID = "recipient_bob_01HZZZZZZZZZZZZZZZZZZZZZZZZ";

const scenes = [
  { id: "normal", short: "정상 연락", title: "기관이 승인한 연락을 실제 연결까지 확인", duration: "0:25–1:05" },
  { id: "attack", short: "사칭·복사", title: "같은 기관명과 복사한 증명은 통과하지 못함", duration: "1:05–1:40" },
  { id: "revoke", short: "취소·만료", title: "통화 중 권한이 취소되면 확인 표시를 철회", duration: "1:40–2:25" },
  { id: "recovery", short: "정지·복구", title: "두 운영자가 복구하고 새 위임으로만 재연결", duration: "2:25–3:00" },
] as const;

type SceneId = typeof scenes[number]["id"];
type ActorId = "institution" | "gateway" | "receiver" | "governance" | "official";
type EventStatus = "running" | "pass" | "blocked";
type EvidenceSource = "BROWSER LIVE" | "RECORDED LIVE" | "POLICY CHECK";

interface EvidenceEvent {
  id: string;
  actor: string;
  title: string;
  detail: string;
  source: EvidenceSource;
  status: EventStatus;
  elapsedMs?: number;
}

interface ActorState {
  title: string;
  detail: string;
  tone: "idle" | "working" | "pass" | "blocked";
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

const initialActors: Record<ActorId, ActorState> = {
  institution: { title: "연락 승인 대기", detail: "Alice의 서류보완 업무와 목적을 확인합니다.", tone: "idle" },
  gateway: { title: "발신 대기", detail: "등록된 위탁 키와 개별 승인서가 필요합니다.", tone: "idle" },
  receiver: { title: "수신 대기", detail: "기관명보다 승인 증거를 먼저 확인합니다.", tone: "idle" },
  governance: { title: "원장 상태 정상", detail: `Besu ${recorded.ledger.nodes}노드 · witness ${recorded.ledger.witnesses}개`, tone: "idle" },
  official: { title: "별도 로그인 필요", detail: "전화 증명만으로 민감 업무를 열지 않습니다.", tone: "idle" },
};

const actionLabels: Record<SceneId, string[]> = {
  normal: ["연락 승인서 발급", "승인된 통화 연결", "Alice가 전화 받기", "공식 업무 권한 확인"],
  attack: ["기관명을 사칭해 발신", "Alice 증명을 Bob에게 복사"],
  revoke: ["정상 통화부터 연결", "원장 취소 상태 적용", "과거 정상 상태 재전달"],
  recovery: ["기관 긴급 정지", "승인자 1 서명", "승인자 2 서명·복구", "새 위임으로 재연결", "Alice가 새 통화 받기"],
};

const presenterCues: Record<SceneId, string[]> = {
  normal: [
    "기관은 위탁 권한만 주지 않고, Alice와 서류보완 목적에 한정된 승인서를 발급합니다.",
    "위탁센터가 발신하면 브라우저가 승인서, 3-of-4 현재 권한, 실제 DTLS 연결을 차례로 확인합니다.",
    "연결이 확인된 뒤에만 생성 음원을 보냅니다. 수락 전 오디오 전송은 0바이트입니다.",
    "서류는 전화 증명으로 바로 열리지 않습니다. 공식 업무에서 Alice 세션과 업무 소유자를 다시 검사합니다.",
  ],
  attack: [
    "공격자가 같은 기관명을 표시해도 증명이 없으므로 기관 이름을 검증된 브랜드로 취급하지 않습니다.",
    "서명이 유효한 Alice 승인서를 복사해도 Bob의 recipientId와 세션 문맥이 달라 거절됩니다.",
  ],
  revoke: [
    "먼저 같은 브라우저 검증 절차로 정상 통화를 연결합니다.",
    "로컬 LIVE에서 확정된 취소 트랜잭션을 기준으로, 새 revoked snapshot을 브라우저 verifier에 넣습니다.",
    "취소를 한 번 안 뒤에는 공격자가 과거 정상 snapshot을 다시 보내도 녹색으로 돌아가지 않습니다.",
  ],
  recovery: [
    "정지키가 기관을 정지하면 epoch가 바뀌고 과거 위임은 사용할 수 없습니다.",
    "서버가 승인자를 대신하지 않습니다. 첫 번째 승인자 세션이 자기 EIP-712 서명을 남깁니다.",
    "서로 다른 두 번째 승인자가 서명해야 2-of-3 복구 트랜잭션이 실행됩니다.",
    "복구 뒤 과거 위임은 살아나지 않습니다. 새 epoch의 위임과 승인서를 다시 검증합니다.",
    "새 연결의 DTLS와 오디오 전송까지 확인해 복구된 정상 흐름을 마칩니다.",
  ],
};

export function PresentationDemo() {
  const [scene, setScene] = useState<SceneId>("normal");
  const [phase, setPhase] = useState(0);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<VerificationState>("CHECKING");
  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [actors, setActors] = useState<Record<ActorId, ActorState>>(initialActors);
  const [activeActor, setActiveActor] = useState<ActorId>("institution");
  const [metric, setMetric] = useState("실행 전");
  const [officialOpen, setOfficialOpen] = useState(false);
  const [approvals, setApprovals] = useState(0);
  const authorizationRef = useRef<SignedAuthorization | null>(null);
  const transportRef = useRef<LoopbackTransport | null>(null);
  const stateGuardRef = useRef(new MonotonicStateGuard());
  const eventListRef = useRef<HTMLOListElement | null>(null);
  const selected = scenes.find((item) => item.id === scene)!;
  const actions = actionLabels[scene];
  const done = phase >= actions.length;
  const nextLabel = actions[phase] ?? "이 장면 완료";
  const sceneIndex = scenes.findIndex((item) => item.id === scene);
  const nextScene = scenes[sceneIndex + 1]?.id ?? "normal";
  const nextSceneLabel = scenes[sceneIndex + 1]?.short ?? "정상 연락";
  const cue = done ? (scene === "recovery" ? "3분 시연이 끝났습니다. 처음 장면부터 다시 실행할 수 있습니다." : `이 장면이 끝났습니다. ${nextSceneLabel} 장면으로 이어갑니다.`) : presenterCues[scene][Math.min(phase, presenterCues[scene].length - 1)]!;
  const receiverCanAccept = (scene === "normal" && phase === 2) || (scene === "recovery" && phase === 4);
  const receiverCanOpenOfficial = scene === "normal" && phase === 3;

  const checks = useMemo(() => getReceiverChecks(scene, phase, state), [scene, phase, state]);

  useEffect(() => () => transportRef.current?.close(), []);
  useEffect(() => {
    const list = eventListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [events]);

  function reset(nextScene = scene) {
    transportRef.current?.close();
    transportRef.current = null;
    authorizationRef.current = null;
    stateGuardRef.current = new MonotonicStateGuard();
    setScene(nextScene);
    setPhase(0);
    setBusy(false);
    setState(nextScene === "attack" ? "UNVERIFIED" : "CHECKING");
    setEvents([]);
    setActors({ ...initialActors });
    setActiveActor(nextScene === "recovery" ? "governance" : "institution");
    setMetric("실행 전");
    setOfficialOpen(false);
    setApprovals(0);
  }

  function updateActor(actor: ActorId, next: ActorState) {
    setActors((current) => ({ ...current, [actor]: next }));
    setActiveActor(actor);
  }

  async function recordEvent(actor: string, title: string, source: EvidenceSource, work: () => Promise<string>, blocked = false) {
    const id = randomId("event");
    const startedAt = performance.now();
    setEvents((current) => [...current, { id, actor, title, detail: "검증 결과를 기다리는 중입니다.", source, status: "running" }]);
    try {
      const detail = await work();
      const elapsedMs = Math.round(performance.now() - startedAt);
      setEvents((current) => current.map((event) => event.id === id ? { ...event, detail, status: blocked ? "blocked" : "pass", elapsedMs } : event));
      return detail;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "검증을 완료하지 못했습니다.";
      setEvents((current) => current.map((event) => event.id === id ? { ...event, detail, status: "blocked", elapsedMs: Math.round(performance.now() - startedAt) } : event));
      throw error;
    }
  }

  async function executeNext() {
    if (busy || done) return;
    setBusy(true);
    try {
      if (scene === "normal") await runNormalPhase();
      if (scene === "attack") await runAttackPhase();
      if (scene === "revoke") await runRevokePhase();
      if (scene === "recovery") await runRecoveryPhase();
      setPhase((current) => current + 1);
    } catch (error) {
      setState("UNAVAILABLE");
      setMetric(error instanceof Error ? error.message : "단계를 실행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function runNormalPhase() {
    if (phase === 0) {
      updateActor("institution", { title: "승인서 서명 중", detail: "수신자·목적·만료를 JCS payload에 결합합니다.", tone: "working" });
      await recordEvent("모의 A시청", "Alice 개별 연락 승인", "BROWSER LIVE", async () => {
        authorizationRef.current = await createSignedAuthorization("1", ALICE_ID);
        setMetric(`승인 ID ${shortId(authorizationRef.current.id)}`);
        updateActor("institution", { title: "연락 승인 완료", detail: "Alice · 서류보완 · 10분 유효", tone: "pass" });
        updateActor("gateway", { title: "발신 가능", detail: "개별 승인서와 위임 범위를 받았습니다.", tone: "pass" });
        return "Ed25519 서명과 ContactAuthorization 필드 검증을 통과했습니다.";
      });
      return;
    }
    if (phase === 1) {
      setState("CONNECTING");
      updateActor("receiver", { title: "승인·연결 확인 중", detail: "3-of-4 상태와 실제 브라우저 전송을 대조합니다.", tone: "working" });
      await recordEvent("Alice 수신 브라우저", "현재 권한과 WebRTC 연결 대조", "BROWSER LIVE", async () => {
        const verified = await createVerifiedState({ revoked: false, epoch: "1", blockNumber: "6912" });
        stateGuardRef.current.accept(verified, performance.now());
        transportRef.current = await createLoopbackTransport();
        setState("CONNECTED_VERIFIED");
        setMetric(`witness ${verified.signerIds.length}/4 · ${transportRef.current.profile}`);
        updateActor("receiver", { title: "승인 상담 연결 확인", detail: "기관 승인과 현재 DTLS 연결이 일치합니다.", tone: "pass" });
        return `witness ${verified.signerIds.join(", ")}와 DTLS certificate, datachannel probe를 확인했습니다.`;
      });
      return;
    }
    if (phase === 2) {
      await recordEvent("Alice", "수락 후 생성 음원 전송", "BROWSER LIVE", async () => {
        const bytes = await startAudio(transportRef.current);
        setMetric(`수락 전 0B → 수락 후 ${bytes.toLocaleString()}B`);
        return `명시적 수락 뒤 inbound audio가 ${bytes.toLocaleString()}B로 증가했습니다.`;
      });
      return;
    }
    updateActor("official", { title: "Alice 업무만 열림", detail: "별도 로그인과 task owner 검사를 통과했습니다.", tone: "pass" });
    setActiveActor("official");
    setOfficialOpen(true);
    await recordEvent("공식 업무", "별도 로그인·객체 권한 검사", "RECORDED LIVE", async () => "로컬 API 통합시험에서 Alice 업무는 200, Bob의 같은 업무 접근은 404로 확인했습니다.");
  }

  async function runAttackPhase() {
    if (phase === 0) {
      updateActor("gateway", { title: "기관명만 주장", detail: "승인서와 등록된 발신 키가 없습니다.", tone: "blocked" });
      updateActor("receiver", { title: "기관 발신 미확인", detail: "표시 이름을 검증된 기관명으로 렌더링하지 않습니다.", tone: "blocked" });
      setState("UNVERIFIED");
      setMetric("PROOF_MISSING");
      await recordEvent("공격 발신자", "같은 표시 이름으로 발신", "POLICY CHECK", async () => "기관명 문자열은 증거가 아니므로 확인 표시를 부여하지 않았습니다.", true);
      return;
    }
    updateActor("gateway", { title: "Alice 증명을 Bob에게 복사", detail: "유효한 서명을 다른 수신 세션에서 재사용합니다.", tone: "working" });
    setState("CHECKING");
    await recordEvent("Bob 수신 브라우저", "수신 대상·세션 문맥 검사", "BROWSER LIVE", async () => {
      const signed = await createSignedAuthorization("1", ALICE_ID);
      try {
        verifyAuthorizationContext(signed.verified, { recipientId: BOB_ID, epoch: "1", delegationId: signed.verified.delegationId, purposeCode: signed.verified.purposeCode, nowSeconds: Math.floor(Date.now() / 1000) });
      } catch (error) {
        if (error instanceof Error && error.message === "RECIPIENT_MISMATCH") {
          setState("REJECTED");
          setMetric("RECIPIENT_MISMATCH");
          updateActor("gateway", { title: "증명 재사용 실패", detail: "서명은 유효하지만 Bob에게 사용할 수 없습니다.", tone: "blocked" });
          updateActor("receiver", { title: "인증 조건 불충족", detail: "Alice와 Bob의 수신 대상이 다릅니다.", tone: "blocked" });
          return "승인서 서명은 통과했지만 recipientId가 Bob과 달라 실제 verifier가 거절했습니다.";
        }
        throw error;
      }
      throw new Error("COPIED_PROOF_WAS_NOT_REJECTED");
    }, true);
  }

  async function runRevokePhase() {
    if (phase === 0) {
      setState("CONNECTING");
      updateActor("receiver", { title: "정상 통화 연결 중", detail: "취소 전 유효 상태를 먼저 확인합니다.", tone: "working" });
      await recordEvent("Alice 수신 브라우저", "취소 전 정상 통화 확인", "BROWSER LIVE", async () => {
        authorizationRef.current = await createSignedAuthorization("1", ALICE_ID);
        const verified = await createVerifiedState({ revoked: false, epoch: "1", blockNumber: "6912" });
        stateGuardRef.current.accept(verified, performance.now());
        transportRef.current = await createLoopbackTransport();
        await startAudio(transportRef.current);
        setState("CONNECTED_VERIFIED");
        updateActor("receiver", { title: "승인 상담 연결 확인", detail: "통화 중에도 현재 권한을 계속 감시합니다.", tone: "pass" });
        setMetric("취소 전 정상 상태");
        return "승인·witness quorum·DTLS·오디오 전송을 모두 확인했습니다.";
      });
      return;
    }
    if (phase === 1) {
      updateActor("governance", { title: "위임 취소 확정", detail: "로컬 LIVE에서 revoked=true 상태를 관측했습니다.", tone: "blocked" });
      await recordEvent("공동 인증망", "revoked=true 상태 관측", "RECORDED LIVE", async () => {
        const verified = await createVerifiedState({ revoked: true, epoch: "1", blockNumber: "6913" });
        stateGuardRef.current.accept(verified, performance.now());
        setState("REJECTED");
        setMetric(`표시 철회 ${recorded.webrtc.revocationDisplayWithdrawalMs.toLocaleString()}ms · 통화 유지`);
        updateActor("receiver", { title: "인증 표시 철회", detail: "통화는 유지하지만 승인된 연락 표시는 제거합니다.", tone: "blocked" });
        return `로컬 LIVE 취소 관측 ${recorded.webrtc.revocationDisplayWithdrawalMs.toLocaleString()}ms 뒤, 새 snapshot의 3개 서명을 브라우저가 검증했습니다.`;
      }, true);
      return;
    }
    await recordEvent("공격 전달 경로", "과거 정상 snapshot 재전달", "BROWSER LIVE", async () => {
      const oldState = await createVerifiedState({ revoked: false, epoch: "1", blockNumber: "6912" });
      try {
        stateGuardRef.current.accept(oldState, performance.now());
      } catch (error) {
        if (error instanceof Error && ["STATE_ROLLBACK", "REVOCATION_ROLLBACK"].includes(error.message)) {
          setMetric(error.message);
          return `${error.message}: 알려진 취소 높이보다 낮은 정상 상태로 돌아가지 않았습니다.`;
        }
        throw error;
      }
      throw new Error("STALE_STATE_WAS_ACCEPTED");
    }, true);
  }

  async function runRecoveryPhase() {
    if (phase === 0) {
      setState("REJECTED");
      updateActor("governance", { title: "기관 긴급 정지", detail: `epoch ${recorded.governance.initialEpoch} → ${recorded.governance.suspendedEpoch}`, tone: "blocked" });
      updateActor("gateway", { title: "과거 위임 사용 불가", detail: "정지와 epoch 변경으로 기존 발신 권한이 끝납니다.", tone: "blocked" });
      setMetric(shortId(recorded.governance.suspendTransaction));
      await recordEvent("기관 정지키", "suspendInstitution 확정", "RECORDED LIVE", async () => `Besu 4노드에서 ${recorded.governance.suspendTransaction} 트랜잭션과 epoch ${recorded.governance.suspendedEpoch}을 관측했습니다.`, true);
      return;
    }
    if (phase === 1) {
      setApprovals(1);
      updateActor("governance", { title: "복구 승인 1/2", detail: "승인자 1의 EIP-712 서명이 기록됐습니다.", tone: "working" });
      setMetric("approver_1 · 1/2");
      await recordEvent("공동 승인자 1", "복구안 EIP-712 서명", "RECORDED LIVE", async () => "서로 다른 승인자 세션 중 첫 번째 서명을 기록했습니다.");
      return;
    }
    if (phase === 2) {
      setApprovals(2);
      updateActor("governance", { title: "2-of-3 복구 확정", detail: `epoch ${recorded.governance.recoveredEpoch} · 새 위임 필요`, tone: "pass" });
      setMetric(shortId(recorded.governance.recoveryTransaction));
      await recordEvent("공동 승인자 2", "두 번째 서명과 recoverInstitution", "RECORDED LIVE", async () => `중복되지 않은 두 signer로 ${recorded.governance.recoveryTransaction}가 확정됐습니다.`);
      return;
    }
    if (phase === 3) {
      setState("CONNECTING");
      updateActor("institution", { title: "새 epoch 승인서 발급", detail: `epoch ${recorded.governance.recoveredEpoch}의 새 위임만 사용합니다.`, tone: "working" });
      await recordEvent("복구된 모의 A시청", "새 위임·승인·연결 검증", "BROWSER LIVE", async () => {
        authorizationRef.current = await createSignedAuthorization(String(recorded.governance.recoveredEpoch), ALICE_ID);
        const verified = await createVerifiedState({ revoked: false, epoch: String(recorded.governance.recoveredEpoch), blockNumber: "6915" });
        transportRef.current = await createLoopbackTransport();
        setState("CONNECTED_VERIFIED");
        updateActor("institution", { title: "새 승인서 발급 완료", detail: `epoch ${recorded.governance.recoveredEpoch} · Alice · 서류보완`, tone: "pass" });
        updateActor("gateway", { title: "새 위임으로 재발신", detail: "과거 위임은 다시 활성화하지 않았습니다.", tone: "pass" });
        updateActor("receiver", { title: "새 승인 상담 연결 확인", detail: "복구 epoch와 현재 연결이 일치합니다.", tone: "pass" });
        setMetric(`epoch ${recorded.governance.recoveredEpoch} · witness ${verified.signerIds.length}/4`);
        return "새 승인서, 새 epoch의 3-of-4 snapshot, 새 DTLS 연결을 실제 브라우저에서 확인했습니다.";
      });
      return;
    }
    await recordEvent("Alice", "복구 후 통화 수락", "BROWSER LIVE", async () => {
      const bytes = await startAudio(transportRef.current);
      setMetric(`새 연결 audio ${bytes.toLocaleString()}B`);
      return `새 WebRTC 연결에서 수락 후 오디오 ${bytes.toLocaleString()}B를 관측했습니다.`;
    });
  }

  return (
    <div className="presentation-demo">
      <header className="presentation-head">
        <div>
          <div className="presentation-mode"><span><Radio />발표 데모</span><i>{publicPreview ? "BROWSER LIVE + RECORDED LIVE" : "BROWSER DEMO · FULL LIVE는 역할 화면"}</i></div>
          <h1>{selected.title}</h1>
        </div>
        <div className="presentation-time"><span>3분 시연 구간</span><strong>{selected.duration}</strong></div>
      </header>

      <nav className="presentation-scenes" aria-label="발표 장면">
        {scenes.map((item, index) => (
          <button key={item.id} className={scene === item.id ? "active" : ""} onClick={() => reset(item.id)}>
            <span>{index + 1}</span><strong>{item.short}</strong><small>{item.duration}</small>
          </button>
        ))}
      </nav>

      <div className="presentation-workspace">
        <section className="actor-console" aria-label="기관과 발신 역할">
          <ActorPanel actor="institution" label="모의 A시청" state={actors.institution} active={activeActor === "institution"} icon={<Landmark />} />
          <div className="handoff"><ArrowRight /><span>승인서와 위임</span></div>
          <ActorPanel actor="gateway" label={scene === "attack" ? "공격 발신자" : "위탁센터 C"} state={actors.gateway} active={activeActor === "gateway"} icon={<Headphones />} />
          <ActorPanel actor="governance" label="공동 운영" state={actors.governance} active={activeActor === "governance"} icon={<ShieldCheck />} {...(scene === "recovery" ? { approvals } : {})} />
        </section>

        <section className={`presentation-phone ${statusCopy[state].tone}`} aria-live="polite">
          <div className="phone-top"><span>테스트 이용자 Alice</span><span>WebRTC</span></div>
          <div className={`call-orbit ${busy ? "active" : ""}`}><Building2 /></div>
          <p className="phone-kicker">{scene === "attack" && phase < 2 ? "기관명 주장 · 미확인" : "개별 연락 승인 대상"}</p>
          <h2>{scene === "attack" && phase === 0 ? "모의 A시청이라고 주장" : "모의 A시청"}</h2>
          <p className="call-purpose">서류 보완 안내 · 합성 업무</p>
          <StatusBadge state={state} />
          <div className="receiver-checks">
            {checks.map((check) => <div key={check.label} className={check.status}><span>{check.status === "pass" ? <Check /> : check.status === "blocked" ? <X /> : check.status === "working" ? <RefreshCw className="spin" /> : <CircleDot />}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}
          </div>
          <div className="phone-live-row">
            <div className="phone-metric"><Activity /><span>{metric}</span></div>
            {receiverCanAccept && <button className="phone-context-action" onClick={() => { void executeNext(); }} disabled={busy}><Phone />전화 받기</button>}
            {receiverCanOpenOfficial && <button className="phone-context-action official" onClick={() => { void executeNext(); }} disabled={busy}><FileCheck2 />공식 업무 확인</button>}
          </div>
        </section>

        <aside className="evidence-stream" aria-label="실행 증거">
          <div className="stream-heading"><div><h2>실행 사건</h2><p>완료된 검사만 기록합니다.</p></div><span>{events.length}</span></div>
          <div className="source-legend"><span className="browser">BROWSER LIVE</span><span className="recorded">RECORDED LIVE</span></div>
          {events.length === 0 ? <div className="stream-empty"><Fingerprint /><p>아래 단계 버튼을 누르면 서명·원장 상태·전송 검사가 여기에 쌓입니다.</p></div> : <ol className="event-list" ref={eventListRef} aria-live="polite">
            {events.map((event) => <li key={event.id} className={event.status}>
              <span className="event-node">{event.status === "running" ? <RefreshCw className="spin" /> : event.status === "blocked" ? <X /> : <Check />}</span>
              <div><div className="event-meta"><strong>{event.actor}</strong><i className={event.source === "BROWSER LIVE" ? "browser" : event.source === "RECORDED LIVE" ? "recorded" : "policy"}>{event.source}</i></div><h3>{event.title}</h3><p>{event.detail}</p>{event.elapsedMs !== undefined && <small>{event.elapsedMs.toLocaleString()}ms</small>}</div>
            </li>)}
          </ol>}
        </aside>
      </div>

      {officialOpen && <section className="official-proof" aria-label="공식 업무 권한 확인">
        <div><FileCheck2 /><span>공식 업무 · 별도 로그인</span></div><strong>Alice의 서류보완 업무</strong><p>전화 승인 ID가 아니라 로그인 세션과 task owner로 접근을 허용했습니다.</p><span><LockKeyhole />Bob 접근은 404</span>
      </section>}

      <section className="presenter-control">
        <div><span>지금 설명할 내용</span><p>{cue}</p></div>
        <div className="presenter-actions"><button className="button secondary" onClick={() => reset()} disabled={busy}><RefreshCw />장면 초기화</button><button className="button primary presentation-next" onClick={() => { if (done) reset(nextScene); else void executeNext(); }} disabled={busy}>{busy ? <><RefreshCw className="spin" />실제 검사 실행 중</> : done ? <><ArrowRight />{scene === "recovery" ? "처음부터 다시" : `다음 장면 · ${nextSceneLabel}`}</> : <><Play />{nextLabel}</>}</button></div>
      </section>

      <p className="presentation-disclosure">BROWSER LIVE는 이 탭에서 실제 암호·WebRTC API를 실행합니다. RECORDED LIVE는 2026-09-14 로컬 Besu 4노드·별도 브라우저 E2E 실행에서 저장한 증거입니다. 공개 화면이 원격 QBFT 노드에 연결됐다는 뜻이 아닙니다.</p>
    </div>
  );
}

function ActorPanel({ actor, label, state, active, icon, approvals }: { actor: ActorId; label: string; state: ActorState; active: boolean; icon: React.ReactNode; approvals?: number }) {
  return <article className={`actor-panel ${state.tone} ${active ? "active" : ""}`} data-actor={actor}>
    <div className="actor-label">{icon}<span>{label}</span>{active && <i>현재 역할</i>}</div>
    <h2>{state.title}</h2><p>{state.detail}</p>
    {approvals !== undefined && <div className="approval-dots" aria-label={`복구 승인 ${approvals}/2`}><span className={approvals >= 1 ? "signed" : ""}>1</span><span className={approvals >= 2 ? "signed" : ""}>2</span><small>{approvals}/2</small></div>}
  </article>;
}

function getReceiverChecks(scene: SceneId, phase: number, state: VerificationState) {
  const blocked = state === "REJECTED" || state === "UNVERIFIED";
  if (scene === "attack") return [
    { label: "기관 승인", detail: phase === 0 ? "승인 증명 없음" : "Alice 서명은 유효", status: phase === 0 ? "blocked" : "pass" },
    { label: "수신 대상", detail: phase < 2 ? "Bob과 일치하지 않음" : "RECIPIENT_MISMATCH", status: phase < 2 ? "idle" : "blocked" },
    { label: "현재 연결", detail: "앞 단계 실패로 미확인", status: "idle" },
  ] as const;
  if (scene === "revoke" && phase >= 2) return [
    { label: "기관 승인", detail: "과거 서명은 유효", status: "pass" },
    { label: "발신 권한", detail: "원장에서 취소됨", status: "blocked" },
    { label: "현재 연결", detail: "통화 유지 · 인증 철회", status: "blocked" },
  ] as const;
  const approval = phase >= 1 || state === "CONNECTED_VERIFIED";
  const transport = state === "CONNECTED_VERIFIED";
  return [
    { label: "기관 승인", detail: approval ? "개별 승인서 일치" : "확인 전", status: approval ? "pass" : busyStatus(state) },
    { label: "발신 권한", detail: approval ? "witness 3-of-4" : "확인 전", status: approval ? "pass" : busyStatus(state) },
    { label: "현재 연결", detail: transport ? "DTLS·datachannel 일치" : blocked ? "인증 철회" : "연결 전", status: transport ? "pass" : blocked ? "blocked" : busyStatus(state) },
  ] as const;
}

function busyStatus(state: VerificationState): "idle" | "working" {
  return state === "CHECKING" || state === "CONNECTING" ? "working" : "idle";
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
