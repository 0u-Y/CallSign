# Progress

## Understood as

현재 `/home/ana/Desktop/yyw/institution-proof` 자체를 프로젝트 루트로 사용한다. 상위 저장소의 다른 미커밋 변경은 보존한다. P0의 실제 보안 연결과 11쪽 제출물을 우선 완성하고, P1/P2는 실행 결과에 따라 PASS/BLOCKED/NOT-RUN을 정확히 구분한다.

2026-09-14 추가 입력은 공개 제품명을 **CallSign**, 팀명을 **TEAM Signal**, 팀 구성을 양영우·이가은 2인으로 확정한 것으로 이해한다. 선택 제출은 영상이 아니라 **공개 GitHub 소스코드 1건**으로 전환한다. 사용자가 제공한 제안서의 문제·선행사례·팀 이력을 반영하되, 저장소와 다른 기술 스택(Next.js/FastAPI), 미실행 AI, 3-of-4 공동 복구처럼 실제 구현과 충돌하는 표현은 현재 React/Fastify, 규칙 fallback/선택 Ollama, 2-of-3 복구로 정정한다.

## Plan and verification gates

1. 저장소·도구·공식 API 확인 → 고정 버전, ADR, doctor 결과.
2. 계약과 프로토콜 코어 → Foundry/Vitest 변조·권한·freshness 테스트.
3. API, PostgreSQL 1회 소비, 인증 세션 → 통합 테스트와 권한 거절.
4. 두 브라우저 WebRTC + signaling → 실제 datachannel/DTLS/audio stats E2E.
5. 4-node Besu + 4 witness → 동일 블록 snapshot 3-of-4 검증과 장애 시험.
6. 정상·공격 데모 UI → API/verifier 관측값만으로 상태 전이.
7. 반응형/접근성/보안 QA → 390×844, 768×1024, 1440×900 캡처 검수.
8. PPTX→PDF와 제출 문서 → 정확히 11쪽, 렌더 육안 검수, 요구 매핑.
9. 깨끗한 재기동과 전체 테스트 → 실제 결과를 문서·JSON에 동기화.

## Completed

- 2026-09-14: 작업 루트가 비어 있음을 확인했다.
- 2026-09-14: 상위 Git 저장소에 다른 프로젝트의 미커밋 변경이 있음을 확인하고 작업 범위를 현재 디렉터리로 제한했다.
- 2026-09-14: Node 22.22.2, pnpm 11.13.0, Docker 29.1.2, Foundry 1.7.1, LibreOffice 24.2.7.2를 확인했다.
- 2026-09-14: 제품 요구를 `PRODUCT.md`에 기록했다.
- 2026-09-14: pnpm workspace, PostgreSQL compose, doctor/setup/migrate/seed 명령을 구성했다.
- 2026-09-14: `InstitutionRegistry` 계약과 EIP-712 2-of-3 등록·복구, 위임·취소·정지·epoch 상태 기계를 구현했다. Foundry 5건 PASS.
- 2026-09-14: JCS/Ed25519 signed objects, duplicate-key 선검사, SDP fingerprint 정규화와 순수 verifier를 구현했다.
- 2026-09-14: 3-of-4 동일 snapshot 서명, freshness, monotonic deadline, rollback 방지 검증기를 구현했다.
- 2026-09-14: Fastify 세션·CSRF·역할 검사, PostgreSQL 원자적 1회 consume, 공식 업무 객체 권한 검사를 구현했다.
- 2026-09-14: 위험 분석 시험을 포함해 Vitest 19/19, PostgreSQL/API 통합 9/9, Foundry 5/5, 전체 TypeScript/Vite 빌드 PASS.
- 2026-09-14: 한국어 랜딩, 데모, 수신자, 기관, 게이트웨이, 공동 운영, 근거, 비교, 공식 업무, 디자인 시스템 route를 구현했다. LIVE와 UI PREVIEW 표기를 분리했다.
- 2026-09-14: Besu 26.8.1 QBFT 4노드가 2초 블록을 같은 genesis에서 생성하도록 구성하고, `InstitutionRegistry`를 배포해 네 RPC에서 동일 바이트코드를 확인했다.
- 2026-09-14: 각자 지정된 Besu RPC 하나만 읽는 witness 4개와 브라우저에 고정되는 3-of-4 trust bundle을 구현했다. 1개 중단 시 3서명 제공, 2개 중단 시 503 fail-closed를 실제 확인했다.
- 2026-09-14: 두 Chromium context 사이 BUNDLE WebRTC, SDP 양측 fingerprint, 실제 remote DTLS certificate, 데이터채널 상호 서명 challenge, 1회 소비 영수증을 연결했다.
- 2026-09-14: 수락 전 오디오 RTP 0 bytes와 수락 후 증가를 측정했다. 통화 중 실제 원장 위임 취소 후 약 3초 polling으로 인증 표시가 철회되고 통화는 유지되는 E2E를 구현했다.
- 2026-09-14: 390×844, 768×1024, 1440×900에서 랜딩·데모·수신 화면의 가로 overflow 검사를 7개 브라우저 테스트 묶음으로 통과하고 11개 캡처를 직접 검토했다.
- 2026-09-14: 200% 확대 키보드 CTA, LIVE evidence readiness, 공식 directory hash를 추가해 Vitest 14/14, integration 4/4, Playwright 10/10으로 최종 재실행했다.
- 2026-09-14: 편집 가능한 PPTX에서 11쪽 PDF를 변환하고 모든 페이지를 PNG로 렌더해 잘림·폰트·간격을 육안 검수했다.
- 2026-09-14: 29.12초 LIVE 정상→원장 취소 원시 녹화를 만들고, 최종 3분 영상 편집·업로드는 입력 대기로 구분했다.
- 2026-09-14: 공개 브랜드를 CallSign, 팀명을 TEAM Signal로 갱신하고 사용자 제공 팀 정보를 제안서에 반영했다.
- 2026-09-14: 동의한 합성 전사문의 규칙 기반 위험 설명, localhost 전용 Ollama structured-output adapter, 없는 근거·prompt injection·외부 endpoint 방어를 구현했다.
- 2026-09-14: CallSign 도메인으로 새 레지스트리를 QBFT 원장에 배포하고 4개 노드의 동일 code 및 witness 4개 준비 상태를 확인했다.
- 2026-09-14: CallSign PPTX에서 정확히 11쪽 PDF를 변환하고 11개 페이지 렌더를 모두 열어 검수했다.
- 2026-09-14: 약 30초 LIVE 녹화를 다시 만들고 연결 확인·규칙 위험 안내·원장 취소 뒤 인증 철회 프레임을 직접 검수했다.
- 2026-09-14: 공동 운영 API와 UI를 실제 원장에 연결했다. demo operator가 기관을 정지하고, 서로 다른 승인자 2명이 각 역할 세션에서 EIP-712 서명한 뒤 Besu `recoverInstitution`을 실행해 Active 전환과 epoch 증가를 확인했다.
- 2026-09-14: 공동 복구의 중복 signer·비승인 역할·확정 뒤 추가 서명을 거절하는 통합 시험과 실제 QBFT 브라우저 E2E를 추가했다. 데스크톱·390px 캡처를 열어 가로 넘침과 상태 문구를 검수했다.
- 2026-09-14: 전체 회귀 시험을 Foundry 5/5, Vitest 20/20, API 통합 10/10, Playwright 11/11로 통과했다. 시험 보고서는 PASS 12·FAIL 0·BLOCKED 0·NOT-RUN 3이다.
- 2026-09-14: 공개 GitHub `https://github.com/0u-Y/CallSign`의 `main`에 실제 소스와 증거를 push하고 비로그인 HTTPS 200 접근을 확인했다. 커밋 `11a99f8` 기준 CI를 확인 중이다.
- 2026-09-14: 첫 GitHub Actions에서 workflow PostgreSQL service와 통합 스크립트의 Compose가 같은 55432 포트를 중복 점유하는 실패를 재현했다. `SKIP_DB_START=1`이면 기존 CI DB를 재사용하도록 수정하고 Docker 미호출·통합 10/10을 로컬 회귀 확인했다.
- 2026-09-14: 수정 커밋 `584373a`의 GitHub Actions run `34835227152`에서 install·migration·build·Vitest·Foundry·integration 전 단계를 PASS로 확인했다.
- 2026-09-14: Vercel 프로젝트 `0u-ys-projects/callsign`을 GitHub 저장소와 연결하고 `https://callsign-rouge.vercel.app`에 PUBLIC UI PREVIEW를 배포했다. 루트와 8개 깊은 route의 익명 HTTP 200, 보안 헤더, asset immutable cache를 확인했다.
- 2026-09-14: 호스팅된 `/demo` 네 장면을 Chromium에서 실행해 승인/거절 결과를 관측하고, 로컬 전용 `/receiver`의 `/demo` 이동, 390px 가로 overflow 0, 콘솔 오류 0건을 확인했다.
- 2026-09-14: GitHub 자동 배포에서 Vercel이 binary가 누락된 `pnpm 11.13.0`을 명시적으로 차단하는 로그를 확인했다. 현재 유지되는 11.x `pnpm 11.27.0`으로 packageManager와 witness Dockerfile 핀을 통일했다.

## In progress

- P0와 제출 자료는 현재 검증 범위에서 완료했다. LIVE 인프라와 구분한 Vercel 공개 UI preview도 배포·검증했다. P1 비교 하네스와 P2 네이티브 상태 증명은 후속 범위다.

## Next

- 팀 대표 연락처 등 비공개 제출 폼 입력값을 사용자가 최종 입력한다.
- P1 C1/C2/B 비교 하네스와 P2 native QBFT proof는 현재 P0 회귀 시험 이후 별도 확장한다.

## Environment constraints

- 시스템 `chromium` 명령은 없지만 Playwright 관리 Chromium 153으로 실제 E2E를 수행했다.
- 팀명·팀원·역할은 제공됐다. 대표자 연락처·팀원별 GitHub ID는 제공되지 않았으며 공개 파일에 추정하지 않는다.
- 실제 기관·통신사 연동은 승인 범위 밖이다. 외부 공개 Vercel UI preview 배포는 2026-09-14 사용자 지시로 승인됐다.

## Commands

- `pnpm setup`
- `pnpm demo:up`
- `pnpm demo:seed`
- `pnpm dev`
- `pnpm test`
- `pnpm test:contracts`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm demo:record`
- `pnpm demo:down`
