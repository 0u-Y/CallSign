import PptxGenJS from "pptxgenjs";
import { resolve } from "node:path";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "TEAM Signal";
pptx.subject = "블록체인 기반 기관 발신 인증 서비스 기획제안서";
pptx.title = "CallSign 기획제안서";
pptx.company = "TEAM Signal";
pptx.lang = "ko-KR";
pptx.theme = { headFontFace: "Noto Sans CJK KR", bodyFontFace: "Noto Sans CJK KR", lang: "ko-KR" };

const C = {
  bg: "F6F8FA", white: "FFFFFF", ink: "17242D", muted: "53636F", border: "DCE4E8",
  teal: "087F73", tealDark: "05685F", tealSoft: "E4F4F1", navy: "13232D",
  amber: "A15C00", amberSoft: "FFF1DA", red: "C72F3B", redSoft: "FDECEE",
};
const root = resolve(import.meta.dirname, "..");
const img = (name: string) => resolve(root, `artifacts/screenshots/${name}`);

pptx.defineSlideMaster({
  title: "CALLSIGN",
  background: { color: C.bg },
  objects: [
    { line: { x: 0.45, y: 0.48, w: 0.18, h: 0.18, line: { color: C.teal, width: 2 } } },
    { line: { x: 0.56, y: 0.59, w: 0.18, h: 0.18, line: { color: C.teal, width: 2 } } },
    { text: { text: "CallSign", options: { x: 0.82, y: 0.42, w: 1.3, h: 0.3, fontSize: 12, bold: true, color: C.ink, margin: 0 } } },
    { text: { text: "TEAM Signal", options: { x: 10.65, y: 0.43, w: 1.55, h: 0.25, fontSize: 10, color: C.muted, align: "right", margin: 0 } } },
    { line: { x: 0.45, y: 7.08, w: 12.43, h: 0, line: { color: C.border, width: 1 } } },
  ],
  slideNumber: { x: 12.42, y: 7.15, w: 0.35, h: 0.18, color: C.muted, fontSize: 9, align: "right", margin: 0 },
});

function slide(title: string, section: string) {
  const s = pptx.addSlide("CALLSIGN");
  s.addText(section, { x: 0.58, y: 0.92, w: 3.5, h: 0.28, fontSize: 11, bold: true, color: C.teal, charSpacing: 0.5, margin: 0 });
  s.addText(title, { x: 0.58, y: 1.22, w: 11.8, h: 0.58, fontSize: 31, bold: true, color: C.ink, margin: 0, fit: "shrink" });
  return s;
}

function note(s: PptxGenJS.Slide, text: string) {
  s.addText(text, { x: 0.58, y: 6.79, w: 11.62, h: 0.24, fontSize: 8.2, color: C.muted, margin: 0, fit: "shrink" });
}

function card(s: PptxGenJS.Slide, x: number, y: number, w: number, h: number, title: string, body: string, accent = C.teal) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.border, width: 1 } });
  s.addShape(pptx.ShapeType.ellipse, { x: x + 0.23, y: y + 0.23, w: 0.27, h: 0.27, fill: { color: accent }, line: { color: accent } });
  s.addText(title, { x: x + 0.62, y: y + 0.19, w: w - 0.84, h: 0.34, fontSize: 17, bold: true, color: C.ink, margin: 0, fit: "shrink" });
  s.addText(body, { x: x + 0.24, y: y + 0.7, w: w - 0.48, h: h - 0.87, fontSize: 13.2, color: C.muted, margin: 0, fit: "shrink", valign: "top" });
}

// 1 · 표지
{
  const s = pptx.addSlide("CALLSIGN");
  s.background = { color: C.bg };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 5.15, h: 7.5, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText("WEB3 기반 사회문제 해결", { x: 0.62, y: 0.62, w: 3.3, h: 0.32, fontSize: 12, bold: true, color: "54D2C5", margin: 0 });
  s.addText("CallSign", { x: 0.62, y: 1.38, w: 4, h: 0.75, fontSize: 40, bold: true, color: C.white, margin: 0 });
  s.addText("블록체인 기반\n기관 발신 인증 서비스", { x: 0.62, y: 2.36, w: 3.92, h: 1.08, fontSize: 23, bold: true, color: C.white, margin: 0, fit: "shrink" });
  s.addText("기관이 승인한 연락인지,\n전화를 받는 순간 확인", { x: 0.62, y: 3.82, w: 3.8, h: 0.88, fontSize: 17, color: "D8E5EA", margin: 0, fit: "shrink" });
  s.addText("TEAM Signal  ·  2026.09.14", { x: 0.62, y: 6.5, w: 3.8, h: 0.28, fontSize: 11, color: "B9C8CF", margin: 0 });
  s.addImage({ path: img("receiver-connected-live.png"), x: 5.58, y: 1.08, w: 7.18, h: 5.39 });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.47, y: 5.68, w: 3.48, h: 0.45, fill: { color: C.teal }, line: { color: C.teal } });
  s.addText("LIVE · 실제 원장 + 브라우저 연결", { x: 8.57, y: 5.79, w: 3.28, h: 0.2, fontSize: 10, bold: true, color: C.white, align: "center", margin: 0 });
}

// 2 · 개요
{
  const s = slide("발신 확인과 통화 위험 안내를 한 화면에서 구분합니다", "01  개요");
  s.addText("기관이 승인한 연락인지 확인하고, 통화 중 위험한 요구는 별도로 안내합니다.", { x: 0.62, y: 1.94, w: 11.4, h: 0.42, fontSize: 18, color: C.muted, margin: 0 });
  card(s, 0.65, 2.62, 3.67, 2.3, "기관 업무 시스템", "대상과 목적을 지정해 개별 연락 승인서를 발급합니다. 일반 위임만으로 임의 연락을 승인하지 않습니다.");
  card(s, 4.56, 2.62, 3.67, 2.3, "공동 인증망과 연결 검증", "기관 서명·현재 권한·수신 대상·실제 DTLS와 datachannel 문맥을 대조합니다.");
  card(s, 8.47, 2.62, 3.67, 2.3, "사용자 통화 화면", "기관 인증과 통화 내용 위험 신호를 서로 다른 상태와 설명으로 보여줍니다.", C.amber);
  s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 5.34, w: 11.49, h: 0.78, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText("판단 순서", { x: 0.92, y: 5.61, w: 1.12, h: 0.24, fontSize: 14, bold: true, color: "54D2C5", margin: 0 });
  s.addText("기관 승인 확인  →  실제 연결 확인  →  위험 요구 분리 안내  →  공식 업무 경로 재확인", { x: 2.08, y: 5.55, w: 9.4, h: 0.34, fontSize: 16, color: C.white, margin: 0, fit: "shrink" });
  note(s, "모의 기관·합성 데이터 기반 작동형 개념검증. 실제 정부·기관·통신사 참여를 뜻하지 않음.");
}

// 3 · 피해 현황
{
  const s = slide("감소세 속에서도 10개월간 6,324억 원의 피해가 발생했습니다", "02  문제 정의 및 배경 · 피해 현황");
  s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 2.05, w: 5.72, h: 2.38, fill: { color: C.white }, line: { color: C.border } });
  s.addText("12,554건", { x: 1.0, y: 2.48, w: 4.9, h: 0.72, fontSize: 36, bold: true, color: C.ink, margin: 0 });
  s.addText("발생 건수", { x: 1.02, y: 3.35, w: 1.4, h: 0.3, fontSize: 17, bold: true, color: C.tealDark, margin: 0 });
  s.addText("전년 동기간 대비 39.9% 감소", { x: 2.42, y: 3.37, w: 3.25, h: 0.28, fontSize: 14, color: C.muted, margin: 0 });
  s.addShape(pptx.ShapeType.roundRect, { x: 6.62, y: 2.05, w: 5.52, h: 2.38, fill: { color: C.white }, line: { color: C.border } });
  s.addText("6,324억 원", { x: 6.97, y: 2.48, w: 4.85, h: 0.72, fontSize: 36, bold: true, color: C.ink, margin: 0 });
  s.addText("피해액", { x: 6.99, y: 3.35, w: 1.05, h: 0.3, fontSize: 17, bold: true, color: C.red, margin: 0 });
  s.addText("전년 동기간 대비 43.2% 감소", { x: 8.05, y: 3.37, w: 3.35, h: 0.28, fontSize: 14, color: C.muted, margin: 0 });
  s.addText("기존 대책은 차단과 경고에서 성과를 냈습니다. CallSign이 보완하려는 질문은 연락을 받은 순간 ‘해당 기관이 이번 연락을 실제로 승인했는가’입니다.", { x: 0.74, y: 4.92, w: 11.2, h: 0.88, fontSize: 18, color: C.muted, margin: 0, fit: "shrink" });
  note(s, "2025.10~2026.7 누계 · 관계부처 합동 「보이스피싱 근절 종합대책 1년 성과」, 2026.09.02 · admin.korea.kr/briefing/pressReleaseView.do?newsId=156778924");
}

// 4 · 기존 대응
{
  const s = slide("차단과 내용 경고를 보완하는 ‘통화별 기관 승인’이 필요합니다", "02  문제 정의 및 배경 · 기존 대응");
  const rows = [
    ["기존 대응", "실제 작동 방식", "CallSign이 보완하는 판단"],
    ["범행 번호 긴급차단", "경찰·통신사 협력으로 범행 번호를 빠르게 차단", "개별 연락에 대한 기관 승인 여부"],
    ["에이닷 전화 AI 경고", "통화 키워드·대화 패턴을 분석해 팝업·소리·진동 경고", "내용 위험과 별도로 발신 기관·권한 확인"],
    ["문자메시지 안심마크", "확인된 문자 발신자의 기관명·로고 표시", "전화 승인과 실제 연결 상대 대조"],
  ];
  s.addTable(rows, { x: 0.65, y: 2.05, w: 12.0, h: 3.7, border: { color: C.border, pt: 1 }, fill: C.white, color: C.ink, fontSize: 14.2, margin: 0.13, rowH: 0.82, colW: [2.6, 4.65, 4.75], autoFit: false });
  s.addText("보완 원칙", { x: 0.72, y: 6.0, w: 1.2, h: 0.27, fontSize: 14, bold: true, color: C.tealDark, margin: 0 });
  s.addText("기존 표준·차단·AI를 대체하지 않고, 승인 → 연결 → 공식 행동 사이의 빈칸을 검증", { x: 1.94, y: 5.96, w: 9.95, h: 0.34, fontSize: 15, color: C.muted, margin: 0, fit: "shrink" });
  note(s, "출처: SKT 에이닷 전화 AI 보이스피싱 탐지(news.sktelecom.com/217274) · 공공·금융기관 안심마크 확대(yna.co.kr/view/AKR20240207101400001)");
}

// 5 · 차별성
{
  const s = slide("기관의 연락 승인과 공동 권한 통제에 초점을 맞춥니다", "03  차별성 및 기대효과");
  const rows = [
    ["비교 기준", "선행사례·기존 접근", "CallSign 설계"],
    ["출처 표시", "문자메시지 안심마크", "통화별 연락 승인 + 연결 상대 검증"],
    ["내용 분석", "AI 통화 위험 탐지", "발신 인증과 위험 분석을 독립 표시"],
    ["발신 인증", "SIP Identity / RCD / STIR 위임", "선행 표준을 참고한 기관 권한·개별 승인 검증"],
    ["운영 권한", "단일 운영자 변경 권한 집중 위험", "2-of-3 중요 변경 + 3-of-4 상태 증언"],
  ];
  s.addTable(rows, { x: 0.65, y: 2.0, w: 12.0, h: 3.58, border: { color: C.border, pt: 1 }, fill: C.white, color: C.ink, fontSize: 13.8, margin: 0.12, rowH: 0.68, colW: [2.35, 4.1, 5.55], autoFit: false });
  card(s, 0.65, 5.86, 3.72, 0.72, "사용자", "사칭 연락 판단 지원");
  card(s, 4.62, 5.86, 3.72, 0.72, "기관", "발신 권한 관리·회수");
  card(s, 8.59, 5.86, 3.72, 0.72, "공동 운영", "무단 변경·침해 확산 완화");
  note(s, "기대효과는 도입 완료 사실이 아니라 검증 가설. 실제 피해 예방·기관 수요·비용 부담은 미검증.");
}

// 6 · 아키텍처
{
  const s = slide("기관 승인서와 실제 통화를 연결해 발신 확인 결과를 제공합니다", "04  서비스·솔루션 개요 · 아키텍처");
  card(s, 0.65, 2.05, 2.55, 1.42, "기관 업무 시스템", "대상·목적 지정\n승인서 Ed25519 서명");
  card(s, 4.02, 2.05, 2.7, 1.42, "인증 API", "승인서 확인\n원자적 1회 소비 영수증");
  card(s, 7.55, 2.05, 2.55, 1.42, "게이트웨이", "브라우저 로컬키\nWebRTC offer·audio");
  card(s, 10.48, 2.05, 2.15, 1.42, "사용자", "승인·권한·\n실제 연결 확인");
  [3.26, 6.76, 10.12].forEach((x) => s.addShape(pptx.ShapeType.chevron, { x, y: 2.48, w: 0.42, h: 0.52, fill: { color: C.teal }, line: { color: C.teal } }));
  s.addShape(pptx.ShapeType.roundRect, { x: 2.62, y: 4.22, w: 4.3, h: 1.55, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText("Besu 공동 인증망", { x: 2.92, y: 4.52, w: 2.1, h: 0.3, fontSize: 19, bold: true, color: C.white, margin: 0 });
  s.addText("기관키 · 위임 · 취소 · 정지 · 복구\nQBFT 4노드 + Solidity", { x: 2.92, y: 4.98, w: 3.28, h: 0.5, fontSize: 13.5, color: "DCE9ED", margin: 0 });
  s.addShape(pptx.ShapeType.roundRect, { x: 7.38, y: 4.22, w: 3.35, h: 1.55, fill: { color: C.white }, line: { color: C.border } });
  s.addText("위험 요구 안내", { x: 7.69, y: 4.52, w: 1.85, h: 0.3, fontSize: 18, bold: true, color: C.amber, margin: 0 });
  s.addText("동의한 합성 전사문\n규칙 fallback + 선택 Ollama", { x: 7.69, y: 4.98, w: 2.45, h: 0.5, fontSize: 13.2, color: C.muted, margin: 0 });
  s.addShape(pptx.ShapeType.line, { x: 5.9, y: 3.52, w: -0.7, h: 0.64, line: { color: C.teal, width: 2, endArrowType: "triangle" } });
  s.addShape(pptx.ShapeType.line, { x: 9.06, y: 4.16, w: 1.58, h: -0.64, line: { color: C.amber, width: 2, endArrowType: "triangle" } });
  note(s, "통화 음성·개별 승인서·수신자·전사문은 온체인 미저장. AI/규칙 미검출은 안전 보장이 아니며 인증 결과를 변경하지 않음.");
}

// 7 · 기술 스택
{
  const s = slide("핵심 인증 기술과 데모 통화·보조 분석을 구분합니다", "05  핵심기술 스택");
  const rows = [
    ["구분", "실제 기술", "적용 내용"],
    ["공동 인증망", "Hyperledger Besu 26.8.1 / QBFT", "기관·위임·정지·복구 상태 합의, validator 4개"],
    ["권한 관리", "Solidity 0.8.30 / Foundry 1.7.1", "기관별 권한, 취소, 2-of-3 공동 복구"],
    ["연락 인증", "Ed25519 JWS / RFC 8785 JCS / EIP-712", "개별 승인서·영수증·상태 증언·관리 서명"],
    ["데모 통화", "WebRTC BUNDLE / WebSocket", "실제 두 브라우저 DTLS·datachannel·audio 연결"],
    ["서비스", "React 19 / Vite / Fastify 5 / PostgreSQL 17", "사용자·기관 화면, 세션, 승인서 1회 소비, 객체 권한"],
    ["위험 분석", "TypeScript rules + Ollama HTTP adapter", "합성 전사문 근거 검사; 로컬 모델 없으면 규칙으로 표시"],
  ];
  s.addTable(rows, { x: 0.65, y: 1.98, w: 12.0, h: 4.55, border: { color: C.border, pt: 1 }, fill: C.white, color: C.ink, fontSize: 13.2, margin: 0.1, rowH: 0.62, colW: [1.8, 3.7, 6.5], autoFit: false });
  note(s, "실제 도입 시 추가: 기관 업무시스템·전화망 세션 식별 연동, 단말 표시, TLS/TURN, 키 보관·회전. 현재 검증 환경은 localhost Chromium.");
}

// 8 · 블록체인
{
  const s = slide("한 운영자의 침해가 다른 기관의 사칭으로 번지는 경로를 줄입니다", "06  프로젝트 구현 계획 · 블록체인 적용");
  const controls = [
    ["기관별 권한 분리", "자기 기관의 관리자·정지키·위탁 발신 범위만 변경"],
    ["중요 변경 공동 승인", "기관 등록·복구는 서로 다른 승인자 2/3 EIP-712 서명"],
    ["공통 상태 합의", "Besu QBFT 4노드로 변경 순서와 확정 상태 공유"],
    ["검증 경로 분산", "각자 자기 노드를 읽는 witness 4곳 중 동일 상태 3곳 서명"],
    ["우회 권한 제한", "super-admin·임의 업그레이드·반복 정지 epoch 증가 경로 없음"],
  ];
  s.addTable([["통제 항목", "실제 구현"], ...controls], { x: 0.65, y: 2.0, w: 7.68, h: 3.95, border: { color: C.border, pt: 1 }, fill: C.white, color: C.ink, fontSize: 13.1, margin: 0.11, rowH: 0.62, colW: [2.25, 5.43], autoFit: false });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.65, y: 2.0, w: 3.85, h: 1.55, fill: { color: C.tealSoft }, line: { color: C.teal } });
  s.addText("온체인", { x: 8.95, y: 2.3, w: 0.9, h: 0.28, fontSize: 17, bold: true, color: C.tealDark, margin: 0 });
  s.addText("기관 공개키 · 위임 · 만료·취소\n정지·복구 epoch · 디렉터리 hash", { x: 8.95, y: 2.72, w: 3.0, h: 0.58, fontSize: 13.2, color: C.ink, margin: 0 });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.65, y: 3.88, w: 3.85, h: 1.55, fill: { color: C.white }, line: { color: C.border } });
  s.addText("오프체인", { x: 8.95, y: 4.18, w: 1.05, h: 0.28, fontSize: 17, bold: true, color: C.ink, margin: 0 });
  s.addText("개별 승인서 · 수신자 · 업무 상세\nWebRTC SDP · 전사문", { x: 8.95, y: 4.6, w: 3.0, h: 0.58, fontSize: 13.2, color: C.muted, margin: 0 });
  s.addText("중앙 DB로도 인증은 가능합니다. QBFT는 다자간 권한 통제와 상태 변경 순서의 공동 집행이 필요하다는 가설에만 채택합니다.", { x: 0.72, y: 6.2, w: 11.25, h: 0.4, fontSize: 14.5, color: C.muted, margin: 0, fit: "shrink" });
  note(s, "P0은 네이티브 light client가 아닌 별도 3-of-4 witness 신뢰 프로파일. 정상 quorum 공모와 공통 RPC 오동작은 보호 범위 밖.");
}

// 9 · 일정
{
  const s = slide("최종 목표는 승인부터 회수·복구까지 이어지는 통합 데모입니다", "06  프로젝트 구현 계획 · 개발 일정과 최종 목표");
  const phases = [
    ["신청 · 09.14", "완료", "문제·아키텍처\n11쪽 PPT/PDF\n작동 데모 증빙"],
    ["멘토링 전반", "검증", "사용자·기관 인터뷰\n표시·운영 절차 검토\n전송 지원 범위"],
    ["멘토링 후반", "확장", "공격 시나리오\n규칙/LLM 비교\n비용·연동 조건"],
    ["본선 · 11.06–07", "목표", "통합 검증·UI 개선\n실행 데모·발표\nGitHub 결과 확정"],
  ];
  phases.forEach(([title, status, body], index) => {
    const x = 0.62 + index * 3.13;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 2.1, w: 2.78, h: 3.68, fill: { color: index === 0 ? C.tealSoft : C.white }, line: { color: index === 0 ? C.teal : C.border, width: index === 0 ? 2 : 1 } });
    s.addText(status, { x: x + 0.2, y: 2.34, w: 0.72, h: 0.24, fontSize: 11, bold: true, color: index === 0 ? C.tealDark : C.muted, margin: 0 });
    s.addText(title, { x: x + 0.2, y: 2.78, w: 2.32, h: 0.54, fontSize: 19, bold: true, color: C.ink, margin: 0, fit: "shrink" });
    s.addText(body, { x: x + 0.2, y: 3.62, w: 2.3, h: 1.38, fontSize: 14.5, color: C.muted, margin: 0, fit: "shrink" });
  });
  s.addText("현재 구현", { x: 0.72, y: 6.08, w: 1.18, h: 0.28, fontSize: 14, bold: true, color: C.tealDark, margin: 0 });
  s.addText("Besu 4노드 · witness 4개 · 승인/소비 · 두 브라우저 WebRTC · 실제 취소·2-of-3 복구 · 공식 업무 권한 · 규칙 위험 안내", { x: 1.95, y: 6.04, w: 10.2, h: 0.35, fontSize: 14, color: C.muted, margin: 0, fit: "shrink" });
  note(s, "공식 일정: 접수 9.14 · OT/멘토링 시작 9.19 · 멘토링 ~11.5 · 본선 11.6–7 (blockhack.kr, 2026.09.14 확인).");
}

// 10 · 팀
{
  const s = slide("코어 보안 구현과 사용자 경험을 두 축으로 나눕니다", "07  팀 구성 및 역할 분담");
  s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 2.02, w: 5.84, h: 4.18, fill: { color: C.white }, line: { color: C.border } });
  s.addText("양영우", { x: 1.02, y: 2.36, w: 1.3, h: 0.42, fontSize: 25, bold: true, color: C.ink, margin: 0 });
  s.addText("충남대학교 컴퓨터융합학부 · 블록체인 복수전공", { x: 1.02, y: 2.9, w: 4.9, h: 0.32, fontSize: 13.5, color: C.tealDark, margin: 0, fit: "shrink" });
  s.addText("아키텍처 및 코어 개발\n기관 인증·권한 관리 · 백엔드 API · 보안 검증\nRust · Python · Foundry · Docker", { x: 1.02, y: 3.42, w: 4.85, h: 1.15, fontSize: 15, color: C.muted, margin: 0, fit: "shrink" });
  s.addText("주요 경험", { x: 1.02, y: 4.92, w: 1.2, h: 0.28, fontSize: 14, bold: true, color: C.ink, margin: 0 });
  s.addText("Grandine·Lighthouse·Foundry 오픈소스 기여\nKAIST OraKle 8기 학회원·9기 학회장\nAvalanche Team1 Korea Collaborator", { x: 1.02, y: 5.28, w: 4.85, h: 0.72, fontSize: 12.8, color: C.muted, margin: 0, fit: "shrink" });

  s.addShape(pptx.ShapeType.roundRect, { x: 6.77, y: 2.02, w: 5.84, h: 4.18, fill: { color: C.white }, line: { color: C.border } });
  s.addText("이가은", { x: 7.14, y: 2.36, w: 1.3, h: 0.42, fontSize: 25, bold: true, color: C.ink, margin: 0 });
  s.addText("충남대학교 컴퓨터융합학부 · 클라우드 부전공", { x: 7.14, y: 2.9, w: 4.8, h: 0.32, fontSize: 13.5, color: C.tealDark, margin: 0, fit: "shrink" });
  s.addText("UX 및 프론트엔드 개발\n사용자 UI·관리자 화면 · API 연동 · 데모 UX\nNext.js · TypeScript · Python · Figma", { x: 7.14, y: 3.42, w: 4.85, h: 1.15, fontSize: 15, color: C.muted, margin: 0, fit: "shrink" });
  s.addText("주요 경험", { x: 7.14, y: 4.92, w: 1.2, h: 0.28, fontSize: 14, bold: true, color: C.ink, margin: 0 });
  s.addText("대전교통공사 RAG 챗봇·열차 민원 시스템 개발\nUNLV Engineering Experiential and Cultural Program\nCNU 창의 SW/AI 축전 대상", { x: 7.14, y: 5.28, w: 4.85, h: 0.72, fontSize: 12.8, color: C.muted, margin: 0, fit: "shrink" });
  note(s, "팀원·소속·역할·경험은 사용자 제공 정보. 대표자 연락처와 개인 GitHub ID는 공개 제안서에 넣지 않음.");
}

// 11 · 증빙과 레퍼런스
{
  const s = slide("소스·자동 시험·실제 실행 화면으로 구현 범위를 증명합니다", "08  개발증빙 및 레퍼런스");
  s.addShape(pptx.ShapeType.roundRect, { x: 0.65, y: 2.0, w: 5.95, h: 4.36, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText("실제 개발증빙", { x: 1.0, y: 2.35, w: 2.2, h: 0.34, fontSize: 21, bold: true, color: C.white, margin: 0 });
  s.addText("• Foundry 계약 5/5\n• Vitest 프로토콜·위험 분석 20/20\n• PostgreSQL/API 통합 10/10\n• Playwright 11/11\n• QBFT 4노드 동일 block/code\n• witness 1개 중단 제공 / 2개 중단 503\n• WebRTC·revoke·2-of-3 복구 LIVE 캡처", { x: 1.0, y: 2.95, w: 4.95, h: 2.4, fontSize: 14.3, color: "DCE9ED", margin: 0, fit: "shrink" });
  s.addText("선택 제출 · GitHub 소스코드 1건", { x: 1.0, y: 5.72, w: 4.6, h: 0.3, fontSize: 14, bold: true, color: "54D2C5", margin: 0 });
  s.addText("github.com/0u-Y/CallSign", { x: 1.0, y: 6.05, w: 4.6, h: 0.2, fontSize: 10.5, color: "DCE9ED", margin: 0 });

  s.addShape(pptx.ShapeType.roundRect, { x: 6.9, y: 2.0, w: 5.71, h: 4.36, fill: { color: C.white }, line: { color: C.border } });
  s.addText("주요 출처", { x: 7.24, y: 2.35, w: 1.5, h: 0.34, fontSize: 21, bold: true, color: C.ink, margin: 0 });
  s.addText("피해·사례\n정부합동 보이스피싱 대책 1년 성과 · 2026.09.02\nSKT 에이닷 전화 AI 보이스피싱 탐지\n공공·금융기관 문자 안심마크 확대\n\n발신·연결 표준\nRFC 8224 SIP Identity · RFC 9795 RCD\nRFC 9060 STIR 위임 · W3C WebRTC\n\n구현 기술\nBesu QBFT · EIP-712 · RFC 8785 JCS", { x: 7.24, y: 2.91, w: 4.72, h: 2.93, fontSize: 12.6, color: C.muted, margin: 0, fit: "shrink" });
  s.addText("코드 경로", { x: 7.24, y: 5.9, w: 0.8, h: 0.22, fontSize: 11, bold: true, color: C.tealDark, margin: 0 });
  s.addText("contracts/src · services/api · packages/verifier · tests/e2e · artifacts", { x: 8.08, y: 5.87, w: 4.0, h: 0.27, fontSize: 10.2, color: C.muted, margin: 0, fit: "shrink" });
  note(s, "상세 URL: admin.korea.kr/...newsId=156778924 · news.sktelecom.com/217274 · yna.co.kr/view/AKR20240207101400001 · rfc-editor.org · docs.besu-eth.org · eips.ethereum.org/EIPS/eip-712");
}

const output = resolve(root, "submission/CallSign_기획제안서.pptx");
await pptx.writeFile({ fileName: output });
console.log(output);
