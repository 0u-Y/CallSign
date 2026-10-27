import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateEd25519KeyPair, hashCanonical, type ContactAuthorizationV2, type PurposePolicy, type SigningKeyPair } from "@callsign/protocol";
import type { FinalsTrust, TrustBundle } from "@callsign/verifier";
import { api, logoutSession, setCsrfToken } from "../lib/api.js";
import { FinalsCall } from "../lib/finalsCall.js";
import { streamRemoteAudio } from "../lib/liveMedia.js";

interface Workspace {
  csrfToken: string;
  actor: { userId: string; role: string }; scenario: string; policy: PurposePolicy; services: string[];
  intents: Array<{ id: string; recipientId: string; agentId: string; status: string }>;
  attempts: Array<{ id: string; intentId: string; sessionId: string; status: string }>;
  credentials: Array<{ digest: string; jws: string; revoked: boolean; vc: { id: string; credentialSubject: { id: string } } }>;
  authorizations: Array<{ payload: ContactAuthorizationV2; jws: string; cancelled: boolean }>;
}
interface AnalysisEvent { type: string; code?: string; engine?: string; llm?: string; event?: { segmentId: string; revision: number; status: string; engine: string; signals: Array<{ evidenceSpan: string; explanation: string }> } }
export function FinalsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false); const requestGeneration = useRef(0); const connectedAttempt = useRef<string | null>(null);
  const [login, setLogin] = useState(""); const [official, setOfficial] = useState(false); const [officialResult, setOfficialResult] = useState("");
  const [recipientId, setRecipientId] = useState(""); const [agentId, setAgentId] = useState(""); const [serviceDid, setServiceDid] = useState("");
  const [recoveryJson, setRecoveryJson] = useState(""); const [signatures, setSignatures] = useState(""); const [governanceMessage, setGovernanceMessage] = useState(""); const [keyVersion, setKeyVersion] = useState("2"); const [epoch, setEpoch] = useState("2");
  const [credentialDigest, setCredentialDigest] = useState(""); const [attemptId, setAttemptId] = useState("");
  const [authState, setAuthState] = useState("미확인"); const [callState, setCallState] = useState("연결 전"); const [analysisState, setAnalysisState] = useState("동의 전 · 전송 없음");
  const [riskEvents, setRiskEvents] = useState<Record<string, NonNullable<AnalysisEvent["event"]>>>({}); const [muted, setMuted] = useState(false);
  const keyRef = useRef<SigningKeyPair | null>(null); const permitRef = useRef(""); const callRef = useRef<FinalsCall | null>(null); const audioRef = useRef<HTMLAudioElement | null>(null); const analysisStop = useRef<(() => void) | null>(null);
  useEffect(() => {
    const generation = requestGeneration.current;
    const params = new URLSearchParams(location.search); const code = params.get("code"), state = params.get("state");
    const initialize = async () => {
      if (code && state) {
        history.replaceState(null, "", location.pathname);
        const response = await api<{ csrfToken: string; official: boolean }>("/v2/auth/callback", { method: "POST", body: JSON.stringify({ code, state }) });
        if (requestGeneration.current !== generation) return;
        if (response.official) { location.assign("/official"); return; }
        setCsrfToken(response.csrfToken); setAuthState(response.official ? "공식 업무 별도 인증 완료" : "기관 계정 인증 완료");
      }
      await refresh();
    };
    void initialize().catch(e => { if (requestGeneration.current === generation) setError(message(e)); }); return () => { requestGeneration.current++; analysisStop.current?.(); callRef.current?.close(); }; }, []);
  async function refresh() {
    const generation = requestGeneration.current; const result = await api<Workspace>("/v2/workspace");
    if (generation !== requestGeneration.current) throw new Error("REQUEST_SUPERSEDED");
    setCsrfToken(result.csrfToken); setWorkspace(result); return result;
  }
  function message(e: unknown) { return e instanceof Error ? e.message : "요청 실패"; }
  async function action(fn: () => Promise<void>) {
    const generation = requestGeneration.current; setBusy(true); setError("");
    try { await fn(); if (generation === requestGeneration.current) await refresh(); }
    catch (e) { if (generation === requestGeneration.current) setError(`${message(e)}. 설정과 로그인 상태를 확인한 뒤 다시 시도하세요.`); }
    finally { if (generation === requestGeneration.current) setBusy(false); }
  }
  async function authenticate(event: FormEvent) { event.preventDefault(); const generation = requestGeneration.current; await action(async () => { const response = await api<{ csrfToken: string }>("/v2/login", { method: "POST", body: JSON.stringify({ idToken: login, official }) }); if (generation !== requestGeneration.current) return; if (!official) setCsrfToken(response.csrfToken); setLogin(""); setAuthState(official ? "공식 업무 별도 인증 완료" : "기관 계정 인증 완료"); }); }
  async function startLogin(official: boolean) {
    const generation = requestGeneration.current;
    await action(async () => { const result = await api<{ url: string }>("/v2/auth/start", { method: "POST", body: JSON.stringify({ official }) }); if (generation === requestGeneration.current) location.assign(result.url); });
  }
  async function logout() {
    if (loggingOut) return;
    requestGeneration.current++; setLoggingOut(true);
    analysisStop.current?.(); analysisStop.current = null; callRef.current?.close(); callRef.current = null;
    connectedAttempt.current = null;
    keyRef.current = null; permitRef.current = ""; setRiskEvents({}); setCallState("연결 종료"); setAnalysisState("분석 중단 · 전송 없음");
    setBusy(true); setError("");
    try { await logoutSession("work"); setWorkspace(null); setAuthState("로그아웃됨"); setAttemptId(""); setCredentialDigest(""); }
    catch (e) { setError(`통화와 분석은 중단했습니다. 서버 로그아웃 확인 실패: ${message(e)}`); }
    finally { setBusy(false); setLoggingOut(false); }
  }
  async function authorize() {
    const generation = requestGeneration.current;
    const key = await generateEd25519KeyPair(); if (generation !== requestGeneration.current) return; keyRef.current = key;
    const permit = await api<{ jws: string }>("/v2/sender/permit", { method: "POST", body: JSON.stringify({ attemptId, vcDigest: credentialDigest, browserPublicKey: key.publicJwk }) });
    if (generation !== requestGeneration.current) return; permitRef.current = permit.jws;
    await api("/v2/authorizations", { method: "POST", body: JSON.stringify({ permitJws: permit.jws, vcDigest: credentialDigest }) }); if (generation === requestGeneration.current) setAuthState("승인 발급됨 · 수신자 검증 전");
  }
  async function connect() {
    const generation = requestGeneration.current;
    analysisStop.current?.(); callRef.current?.close(); connectedAttempt.current = null; setRiskEvents({});
    const current = await refresh(); const attempt = current.attempts.find(a => a.id === attemptId); const auth = current.authorizations.find(a => a.payload.attemptId === attemptId && !a.cancelled); const credential = current.credentials.find(c => c.digest === auth?.payload.vcDigest);
    if (!attempt || !auth || !credential) throw new Error("승인된 통화 시도를 선택하세요");
    if (current.actor.role !== "gateway" && current.actor.role !== "recipient") throw new Error("상담원 또는 수신자 계정이 필요합니다");
    const rawTrust = await api<TrustBundle & { finals: Omit<FinalsTrust, "chain"> }>("/v2/public-trust");
    if (generation !== requestGeneration.current) return;
    const pinned = import.meta.env.VITE_FINALS_TRUST_SHA256;
    if (!pinned || hashCanonical(rawTrust) !== pinned) throw new Error("배포 시 고정한 본선 trust bundle hash가 필요합니다");
    const key = current.actor.role === "gateway" ? keyRef.current : await generateEd25519KeyPair(); if (!key) throw new Error("발급한 브라우저 세션이 사라졌습니다. 새 통화 시도를 만드세요");
    if (generation !== requestGeneration.current) return;
    const call = new FinalsCall({ role: current.actor.role, attemptId: attempt.id, sessionId: attempt.sessionId, recipientId: auth.payload.recipientId, key, authorization: auth, permitJws: permitRef.current, vcJws: credential.jws, credentialId: credential.digest, trust: { ...rawTrust.finals, chain: rawTrust }, policy: current.policy,
      state: status => { if (callRef.current !== call) return; setCallState(status); if (!status.includes("통화 중")) { analysisStop.current?.(); analysisStop.current = null; setAnalysisState("분석 중단 · 연결 검증 상태 확인 필요"); } },
      remote: stream => { if (audioRef.current) audioRef.current.srcObject = stream; } });
    callRef.current = call; connectedAttempt.current = attempt.id; try { await call.connect(); } catch (e) { call.close(); if (callRef.current === call) connectedAttempt.current = null; throw e; }
  }
  async function consent() {
    const stream = callRef.current?.remoteStream; const activeAttempt = connectedAttempt.current;
    if (!stream || !activeAttempt || !callState.includes("통화 중")) throw new Error("수락한 상대방 음성이 있어야 분석할 수 있습니다");
    analysisStop.current?.(); setRiskEvents({}); setAnalysisState("STT 연결 중 · 상대 음성만 처리");
    analysisStop.current = streamRemoteAudio(stream, activeAttempt, value => {
      const event = value as AnalysisEvent;
      if (event.type === "provider-ready") setAnalysisState(`${event.engine} / ${event.llm} · 실시간 provider 경로, 실환경 검증 대기`);
      if (event.type === "unavailable") setAnalysisState(`분석 불가: ${event.code} · 안전 여부 판단 불가`);
      if (event.event?.status === "unavailable") setAnalysisState("LLM 분석 불가 · 규칙 근거만 표시, 안전 판정 아님");
      if (event.event) setRiskEvents(previous => ({ ...previous, [event.event!.segmentId]: event.event! }));
    });
  }
  const selectedAttempt = workspace?.attempts.find(a => a.id === attemptId);
  return <div className="finals-workspace">
    <header><h1>이상거래 확인 연락</h1><p>모의 금융기관 본선 업무 화면입니다. 실제 금융기관·통신사와 연동되지 않았습니다. 서버와 계정이 준비돼야 사용할 수 있으며 fixture로 대체하지 않습니다.</p></header>
    {workspace && <button className="button secondary" disabled={loggingOut} onClick={() => { void logout(); }}>업무 계정 로그아웃</button>}
    <section className="finals-controls"><h2>기관 계정으로 로그인</h2><button className="button primary" disabled={busy} onClick={() => { void startLogin(false); }}>기관 인증 서비스 로그인</button><button className="button secondary" disabled={busy} onClick={() => { void startLogin(true); }}>공식 업무 별도 로그인</button><button className="button secondary" disabled={busy} onClick={() => { void action(async () => { await refresh(); }); }}>내 업무 새로고침</button></section>
    {import.meta.env.DEV && <form className="finals-controls" onSubmit={event => { void authenticate(event); }}><h2>역할 계정 인증</h2>
      <label>기관 인증 서비스 ID token<input type="password" value={login} onChange={e => setLogin(e.target.value)} autoComplete="off" required /></label>
      <label className="check-label"><input type="checkbox" checked={official} onChange={e => setOfficial(e.target.checked)} />공식 업무 별도 인증 audience 사용</label>
      <button className="button primary" disabled={busy}>인증하기</button><button type="button" className="button secondary" disabled={busy} onClick={() => { void action(async () => { await refresh(); }); }}>상태 새로고침</button>
    </form>}
    {error && <p role="alert" className="finals-error">{error}</p>}
    <dl className="finals-status" aria-live="polite"><div><dt>계정·승인</dt><dd>{workspace ? `${workspace.actor.role} · ${authState}` : "서버 연결 또는 로그인 필요"}</dd></div><div><dt>세션 결합</dt><dd>{callState}</dd></div><div><dt>음성 분석</dt><dd>{analysisState}</dd></div><div><dt>대화 위험</dt><dd>{Object.values(riskEvents).some(e => e.signals.length) ? "근거 있는 경고 확인 필요" : "확정 경고 없음 · 안전 판정 아님"}</dd></div></dl>
    {!workspace && <p>업무 목록은 로그인한 계정의 기관과 할당 범위에 맞춰 불러옵니다.</p>}
    {workspace?.actor.role === "institution" && <section className="finals-controls"><h2>모의 CRM/FDS 업무 생성</h2><label>수신자 계정 ID<input value={recipientId} onChange={e => setRecipientId(e.target.value)} /></label><label>할당 상담원 ID<input value={agentId} onChange={e => setAgentId(e.target.value)} /></label><label>위탁 서비스 DID<select value={serviceDid} onChange={e => setServiceDid(e.target.value)}><option value="">서비스 선택</option>{workspace.services.map(s => <option key={s}>{s}</option>)}</select></label><button className="button primary" disabled={busy || !recipientId || !agentId || !serviceDid} onClick={() => { void action(async () => { await api("/v2/intents", { method: "POST", body: JSON.stringify({ id: crypto.randomUUID(), recipientId, agentId, serviceDid, expiresAt: Math.floor(Date.now()/1000)+3600 }) }); }); }}>확인 연락 업무 생성</button><button className="button secondary" disabled={busy || !serviceDid} onClick={() => { void action(async () => { await api("/v2/credentials", { method: "POST", body: JSON.stringify({ serviceDid }) }); }); }}>위임 VC 발급</button><p>VC 발급 뒤 원장 등록이 완료돼야 발신할 수 있습니다. 이 버튼은 체인 트랜잭션을 대신 실행하지 않습니다.</p></section>}
    {workspace && <section><h2>내 업무</h2>{!workspace.intents.length ? <p>현재 접근 가능한 업무가 없습니다.</p> : <ul className="finals-list">{workspace.intents.map(i => <li key={i.id}><div><strong>{i.id}</strong><p>{i.status} · 수신자 {i.recipientId} · 상담원 {i.agentId}</p></div>{workspace.actor.role === "gateway" && <button className="button secondary" disabled={busy || i.status !== "open"} onClick={() => { void action(async () => { const a = await api<{ id: string }>("/v2/attempts", { method: "POST", body: JSON.stringify({ intentId: i.id }) }); setAttemptId(a.id); }); }}>새 통화 시도</button>}{workspace.actor.role === "institution" && <button className="button secondary" disabled={busy || i.status !== "open"} onClick={() => { void action(async () => { await api("/v2/cancel", { method: "POST", body: JSON.stringify({ intentId: i.id }) }); }); }}>연락 취소</button>}{workspace.actor.role === "recipient" && <button className="button secondary" disabled={busy} onClick={() => { void action(async () => { const result = await api<{ intent: { id: string } }>(`/v2/official/${encodeURIComponent(i.id)}`); setOfficialResult(`별도 인증 및 업무 소유 확인: ${result.intent.id}`); }); }}>공식 업무 확인</button>}</li>)}</ul>}</section>}
    {officialResult && <p role="status">{officialResult}</p>}
    {workspace && <section className="finals-controls"><h2>위임과 통화</h2><label>유효 위임<select value={credentialDigest} onChange={e => setCredentialDigest(e.target.value)}><option value="">위임 선택</option>{workspace.credentials.filter(c => !c.revoked).map(c => <option key={c.digest} value={c.digest}>{c.vc.credentialSubject.id} · {c.digest.slice(0, 12)}</option>)}</select></label>{workspace.actor.role === "institution" && <button className="button secondary" disabled={busy || !credentialDigest} onClick={() => { void action(async () => { const r = await api<{ ledgerStatus: string }>("/v2/revoke", { method: "POST", body: JSON.stringify({ vcDigest: credentialDigest }) }); setGovernanceMessage(r.ledgerStatus === "confirmed" ? "기관 DB와 원장 위임 철회 확인" : "기관 DB 철회 반영 · 원장 철회 확인 대기"); }); }}>위임 철회</button>}{workspace.actor.role === "institution" && <button className="button secondary" disabled={busy || !credentialDigest} onClick={() => { void action(async () => { const result = await api<{ transactionHash: string }>("/v2/credentials/register-ledger", { method: "POST", body: JSON.stringify({ vcDigest: credentialDigest }) }); setGovernanceMessage(`재사용 위임 등록: ${result.transactionHash}`); }); }}>선택 위임 원장 등록</button>}
      <label>통화 시도<select value={attemptId} onChange={e => setAttemptId(e.target.value)}><option value="">시도 선택</option>{workspace.attempts.map(a => <option key={a.id} value={a.id}>{a.id} · {a.status}</option>)}</select></label>
      {workspace.actor.role === "gateway" && <button className="button primary" disabled={busy || selectedAttempt?.status !== "created" || !credentialDigest} onClick={() => { void action(authorize); }}>Sender 허가와 기관 승인 발급</button>}
      <button className="button secondary" disabled={busy || !attemptId} onClick={() => { void action(connect); }}>마이크 준비 및 연결 대기</button>
      {workspace.actor.role === "gateway" && <button className="button primary" disabled={busy || !callRef.current} onClick={() => { void action(async () => { await callRef.current!.invite(); }); }}>통화 발신</button>}
      {workspace.actor.role === "recipient" && <button className="button primary" disabled={busy || !callState.includes("검증 완료")} onClick={() => { void action(async () => { await callRef.current!.accept(); await audioRef.current?.play(); }); }}>검증한 통화 수락</button>}
      <button className="button secondary" disabled={!callRef.current} onClick={() => { const next = !muted; setMuted(next); callRef.current?.mute(next); }}>{muted ? "음소거 해제" : "음소거"}</button>
      <button className="button secondary" disabled={!callRef.current} onClick={() => {
        const activeAttempt = connectedAttempt.current; const call = callRef.current;
        analysisStop.current?.(); analysisStop.current = null; callRef.current = null; connectedAttempt.current = null;
        try { call?.hangup(); } catch { call?.close(); }
        setCallState("거절 또는 종료됨"); setAnalysisState("분석 중단 · 전송 없음");
        void action(async () => { if (activeAttempt) await api("/v2/end", { method: "POST", body: JSON.stringify({ attemptId: activeAttempt }) }); });
      }}>거절·종료</button>
      {connectedAttempt.current && <p>현재 연결된 통화 시도: {connectedAttempt.current}</p>}
      <audio ref={audioRef} controls aria-label="상대방 통화 음성" />
      {workspace.actor.role === "recipient" && <><button className="button secondary" disabled={busy || !callState.includes("통화 중")} onClick={() => { void action(consent); }}>상대 음성 분석 동의</button><button className="button secondary" onClick={() => { analysisStop.current?.(); analysisStop.current = null; setRiskEvents({}); setAnalysisState("동의 철회 · 분석 및 음성 전송 중단"); }}>분석 동의 철회</button><p>상대 음성만 STT 제공자에게 전송합니다. 서버의 음성 영구 저장은 비활성화되어 있습니다. 인증 결과와 내용 분석 결과는 서로 다릅니다.</p></>}
    </section>}
    {workspace && ["institution", "approver"].includes(workspace.actor.role) && <section className="finals-controls"><h2>공동 운영과 키 회전</h2><p>공동 복구는 서로 다른 승인자 2명의 EIP-712 서명이 필요합니다. 승인자 개인키는 각 승인자의 별도 환경에서 사용하며 브라우저나 플랫폼 API에 전달하지 않습니다.</p>
      <label>복구 요청 JSON<textarea value={recoveryJson} onChange={e => setRecoveryJson(e.target.value)} rows={6} /></label><label>승인 서명 (한 줄에 하나)<textarea value={signatures} onChange={e => setSignatures(e.target.value)} rows={4} /></label>
      <button className="button secondary" disabled={busy || !recoveryJson} onClick={() => { void action(async () => { const r = await api<{ digest: string }>("/v2/governance/recovery-digest", { method: "POST", body: recoveryJson }); setGovernanceMessage(`승인자가 확인할 EIP-712 digest: ${r.digest}`); }); }}>서명할 요청 확인</button>
      <button className="button secondary" disabled={busy || !recoveryJson || !signatures} onClick={() => { void action(async () => { const r = await api<{ transactionHash: string }>("/v2/governance/recover", { method: "POST", body: JSON.stringify({ request: JSON.parse(recoveryJson), signatures: signatures.trim().split(/\s+/) }) }); setGovernanceMessage(`복구 트랜잭션 확인: ${r.transactionHash}. 새 승인키 활성화와 trust bundle 갱신이 필요합니다.`); }); }}>공동 서명 복구 제출</button>
      {workspace.actor.role === "institution" && <><button className="button secondary" disabled={busy} onClick={() => { void action(async () => { await api("/v2/governance/suspend", { method: "POST", body: "{}" }); setGovernanceMessage("기관 정지 반영됨"); }); }}>기관 긴급 정지</button>
      <label>새 승인키 버전<input type="number" min={2} value={keyVersion} onChange={e => setKeyVersion(e.target.value)} /></label><label>복구 후 원장 epoch<input inputMode="numeric" value={epoch} onChange={e => setEpoch(e.target.value)} /></label><button className="button secondary" disabled={busy} onClick={() => { void action(async () => { await api("/v2/governance/activate-key", { method: "POST", body: JSON.stringify({ version: Number(keyVersion), epoch }) }); setGovernanceMessage("새 키 활성화·구승인 무효화 완료. 배포 trust bundle을 갱신하세요."); }); }}>원장과 대조하여 새 키 활성화</button></>}
      {governanceMessage && <p role="status">{governanceMessage}</p>}
    </section>}
    <section aria-live="polite"><h2>위험 요구 근거</h2>{Object.values(riskEvents).filter(e => e.signals.length).map(e => <div key={e.segmentId}><p>전사 {e.segmentId} · revision {e.revision} · {e.engine} · {e.status}</p>{e.signals.map((s, i) => <blockquote key={i}><strong>{s.evidenceSpan}</strong><p>{s.explanation}</p></blockquote>)}</div>)}<p>분석 오류·미지원·무응답은 안전을 의미하지 않습니다. 민감한 요청은 별도 인증한 공식 업무에서 확인하세요.</p></section>
  </div>;
}

export function FinalsOfficialPage() {
  const [tasks, setTasks] = useState<Workspace["intents"]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [detail, setDetail] = useState(""); const [notice, setNotice] = useState("");
  const requestGeneration = useRef(0); const [loggingOut, setLoggingOut] = useState(false);
  async function load() {
    const generation = ++requestGeneration.current; setBusy(true); setError("");
    try { const result = await api<{ intents: Workspace["intents"] }>("/v2/official-tasks"); if (generation === requestGeneration.current) setTasks(result.intents); }
    catch (e) { if (generation === requestGeneration.current) { setTasks([]); setError(e instanceof Error ? e.message : "공식 업무 인증이 필요합니다."); } }
    finally { if (generation === requestGeneration.current) setBusy(false); }
  }
  async function showDetail(id: string) {
    const generation = ++requestGeneration.current; setBusy(true); setError("");
    try { const result = await api<{ intent: { id: string } }>(`/v2/official/${encodeURIComponent(id)}`); if (generation === requestGeneration.current) setDetail(`업무 소유권 확인: ${result.intent.id}. 금융 거래 실행 기능은 제공하지 않습니다.`); }
    catch (e) { if (generation === requestGeneration.current) setError(e instanceof Error ? e.message : "업무 조회 실패"); }
    finally { if (generation === requestGeneration.current) setBusy(false); }
  }
  useEffect(() => { void load(); return () => { requestGeneration.current++; }; }, []);
  async function startLogin() {
    const generation = ++requestGeneration.current; setBusy(true); setError("");
    try { const result = await api<{ url: string }>("/v2/auth/start", { method: "POST", body: JSON.stringify({ official: true }) }); if (generation === requestGeneration.current) location.assign(result.url); }
    catch (e) { if (generation === requestGeneration.current) setError(e instanceof Error ? e.message : "인증 시작 실패"); }
    finally { if (generation === requestGeneration.current) setBusy(false); }
  }
  async function logout() {
    if (loggingOut) return;
    requestGeneration.current++; setLoggingOut(true); setBusy(true); setError(""); setNotice(""); setTasks([]); setDetail("");
    try { await logoutSession("official"); setNotice("공식 업무 계정에서 로그아웃했습니다."); }
    catch (e) { setError(e instanceof Error ? `서버 로그아웃 확인 실패: ${e.message}` : "로그아웃 실패"); }
    finally { setBusy(false); setLoggingOut(false); }
  }
  return <div className="finals-workspace"><h1>모의 금융기관 공식 업무</h1><p>통화 승인과 별개로 공식 업무 계정의 인증과 업무 소유권을 확인합니다. 전화에서 인증번호나 송금을 요구하지 않습니다.</p>
    <div className="finals-controls"><button className="button primary" disabled={busy} onClick={() => { void startLogin(); }}>공식 업무 계정으로 로그인</button><button className="button secondary" disabled={busy} onClick={() => { void load(); }}>{busy ? "확인 중" : "내 업무 다시 확인"}</button></div>
    {error && <p role="alert" className="finals-error">{error}</p>}
    <button className="button secondary" disabled={loggingOut} onClick={() => { void logout(); }}>공식 업무 로그아웃</button>
    {notice && <p role="status">{notice}</p>}
    <section><h2>내 이상거래 확인 업무</h2>{!busy && !tasks.length && <p>별도 인증 후 접근 가능한 업무가 표시됩니다.</p>}<ul className="finals-list">{tasks.map(t => <li key={t.id}><div><strong>{t.id}</strong><p>{t.status}</p></div><button className="button secondary" disabled={busy} onClick={() => { void showDetail(t.id); }}>업무 확인</button></li>)}</ul></section>
    {detail && <p role="status">{detail}</p>}
  </div>;
}
