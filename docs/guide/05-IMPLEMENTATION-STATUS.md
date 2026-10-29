# 05. 구현 및 검증 현황

[서비스 가이드](README.md) · 이전: [신뢰·보안](04-TRUST-AND-SECURITY.md)

기준일: **2026-10-30(KST)**. 현재 인증·HTTP·화면 코드 기준은 `5c2842d`이며, 실제 시험 시점은 직전 HEAD와 미커밋 변경을 포함했습니다. [이번 평가](../../artifacts/http-validation-20261030.json)의 소스 hash·원래 실행 HEAD를 따릅니다. 커밋·게시와 서비스 배포 성공은 구분합니다.

기본 `/service` 화면은 등록 기관 주소·키 기반 위임/승인, Asterisk 교환기 제어·서명 검증, 양측 통화 유지 허가와 원격 음성 분석 API에 연결했습니다. 이전 직접 통화 화면은 `/finals`에 보존했습니다. **코드 연결은 실통화나 실환경 성공을 뜻하지 않습니다.**

| 영역 | 구현·연결 상태 | 확인한 검증 | 남은 작업 | 코드·시험 근거 |
|---|---|---|---|---|
| 기관 업무·인증·역할 | 업무 생성·취소·상담원 재할당, 담당/관리 권한, 계정 등록·활성/역할 관리·세션 세대와 회수, 일반/공식 인증 분리·최근 로그인 검사 | 객체 경계 단위 시험 + 실제 HTTPS OIDC fixture·API/PG·CSRF·재인증·계정/세션 세대 회수 | 실제 외부 IdP/MFA·전체 운영 권한 감사. 내부 계정 등록 UI/API는 연결했고 외부 IdP 계정 생성은 포함하지 않음 | [업무·권한](../../services/api/src/service-management.ts), [인증 시험](../../services/api/src/session-scopes.unit.test.ts), [라우트 시험](../../services/api/src/service-routes.unit.test.ts) |
| 위임·개별 승인·검증 모듈 | URI/등록 키 준비, 업무 위임·요청별 콜센터 서명·개별 승인·nonce·양측 소유 증명·일회 소비·서명 영수증을 기본 화면에 연결 | 변조·다른 수신자/세션/chain·등록 키·세대·영수증 재사용 거절 단위 시험 | 실제 신규 배포 trust·Witness/PBX 세션 검증. 실제 SQL 소비/HTTP 영수증 복구는 확인했으나 외부 권한 상태는 fixture | [서버](../../services/api/src/service-authority.ts), [검증](../../packages/verifier/src/service.ts), [시험](../../tests/unit/service-verifier.test.ts) |
| 체인·Witness·공동 관리 | 기존 Besu 4개·Witness 3-of-4·주요 관리 2-of-3 유지. 등록/철회/복구·정책/공식 목록 변경의 새 계약·관리 UI·worker·확정 event/state·최신 증언/활성화 연결 | 서명/domain/내용·중복 세 번째 승인자·정책 세대·snapshot 강등 단위 시험. 기존 로컬 EVM21시험·TS/Solidity 호환 확인 | Besu 배포·trust 전환·Witness 정책 hash·회전/복구 전파. 기존 계약은 자동 upgrade되지 않음 | [worker](../../services/api/src/service-worker.ts), [원장](../../services/api/src/worker-ledger.ts), [사건](../../services/api/src/ledger-events.ts), [관리 서명 시험](../../tests/unit/registration.test.ts) |
| 통화 상태·유지 허가 | 120초 최초 연결과 진행 통화 유지 분리, 양측 갱신 서명, 거절·부재·만료·중복 종료·로그아웃 회수, 숨김/비동기 track 경합 방어·PBX 절대 timeout | 메모리 경계 시험 + 실제 HTTP 양측 proof·서명 lease 발급/DB 저장. 실제 음성 연결 아님 | 실제 장시간/다중 탭/브라우저 절전 동작, 정책값의 운영 승인 | [브라우저 제어](../../apps/web/src/lib/serviceCall.ts), [서버 시험](../../tests/unit/service-authority.test.ts) |
| Direct WebRTC·PBX | 직접 통화 회귀 보존. 기본 SIP 등록/수신·ARI 채널/Call-ID/bridge·증거·실제 인증서 관측·사건 재구독·자동 회수 코드를 연결 | SIP ACK/CANCEL/BYE dialog·ARI 대체 응답·중복 사건·정리 재시도·양측 SDK 검증 시험 | 실제 Asterisk 이미지/ODBC/인증서·양방향 음성·TURN·지원 브라우저 검증 | [SIP](../../apps/web/src/lib/pbxSip.ts), [PBX](../../services/api/src/pbx-runtime.ts), [시험](../../tests/unit/sip-dialog.test.ts), [미실행 통화 시험](../../tests/media/service-pbx.spec.ts) |
| STT·AI·위험 안내 | 실제 remote stream 선택→새 오디오 수신→기존 Deepgram/Anthropic→revision·규칙/모델·근거 UI. 동의 철회·종료·권한 회수 시 전송·늦은 결과 중단 | 전사 수정·부정/인용/정정·늦은 결과·근거 정합성 단위 시험, 타입 검사 | 실제 제공자 형식/보관/한국어 품질·비용·분석 장애 통합(별도 guard smoke 소스는 작성). fixture 평가는 독립 품질 증거가 아님 | [분석](../../services/api/src/service-audio.ts), [전사](../../services/api/src/transcription.ts), [개발 fixture](../../tests/fixtures/korean-risk-evaluation.json) |
| 역할별 화면 | 기관·상담원·수신자·관리 API, 별도 공식 업무, 로딩/실패/빈 목록/재시도·선택 시도와 연결 시도 분리 | 타입/웹 build·단위 시험 + Chromium 실제 로그인·업무 생성/취소·로그아웃·역할 메뉴·모바일 overflow·focus/console | 공동 관리 전체·다른 기기/보조기술 접근성. 계정·재할당은 구조화 양식, 공동 변경 전후 비교·제안 파일 내보내기·서명 파일 가져오기·로컬 digest/서명 확인을 연결. 실제 사용성 확인 필요 | [기본 화면](../../apps/web/src/pages/Service.tsx), [경로](../../apps/web/src/App.tsx) |
| 영속성·복구·운영 | 기관별 SQL claim·서명자 lease/fencing·동일 raw tx 복구·공유 예약/정산·retention, 계정/키/정책 checkpoint·독립 anchor/gate, manifest 인증·복원 세션 폐기, 기본 배포와 GCP 기동 구성 | worker 재시도/claim 유실·anchor 충돌·암호화 변조 단위 시험, YAML/셸/타입 검사 | PostgreSQL 선택 경계15시험은 실제 실행. 독립 anchor 배치·일관 chain snapshot·GCP 복원은 대기. 외부 알림 채널은 미선택, 내부 알림/설정/읽음/만료와 제한된 오프라인 증거 도구는 구현. 고정 단계 runner/증거 수집을 연결. 전체 장애·복원·측정 수집·GCP 실관측은 수동 확인 단계로 남음 | [SQL](../../services/api/drizzle/0004_worker_recovery.sql), [quota](../../services/api/src/quota.ts), [복구](../../services/api/src/consumption-anchor.ts), [운영](../RUNBOOK.md) |

## 최신 선택 경로 검증

실제 HTTPS OIDC fixture·issuer/platform HTTP·PostgreSQL·Chromium의1파일7시험과 DB 회귀4파일15시험이 각각 PASS입니다. 이번 light는44파일197시험, 웹 build·API/runtime/harness 타입도 PASS입니다. [원본 결과·대체 경계·실패 이력·자원 정리](../../artifacts/http-validation-20261030.json)를 확인할 수 있습니다. 과거 시험과 합산하지 않습니다.

브라우저는 실제 화면에서 로그인·업무 생성/취소·로그아웃·수신자 메뉴·Secure cookie와390px 화면·Tab/focus를 확인했습니다. API 응답을 mock하지 않았습니다. 실제 체인/Witness·PBX/TURN/음성·외부 IdP/MFA·STT/LLM·독립 anchor·복원/GCP는 미검증입니다. 합성 binding과 서명 lease가 실제 연결 성공을 의미하지 않습니다.

## 2026-10-29 실행 준비 당시 기록

당시 **`pnpm light`는42개 파일·191개 시험 통과**, 웹 build·API runtime 타입 검사도 통과했습니다. [최종 오프라인 실행](../../artifacts/execution-validation-rechecked-20261029.json)은 설정 누락 때문에 전체 BLOCKED이며 통과한 코드 검사와 구분합니다. runtime preflight는 **BLOCKED62·PASS14·SKIPPED1**입니다. 기존 차단2개는 실제 저장소 artifact/hash·고정 PBX IP로 확인했고 빠져 있던 키/이미지/URI/인증서/provider 검사를 추가했습니다. [항목별 준비 결과](../../artifacts/execution-preparation-rechecked-20261029.json)에 사용자/외부 입력43검사와 이후 생성값19검사를 나눴습니다. 숫자를 줄이기 위한 가짜 주소/digest는 넣지 않았습니다.

[최신 진행표](../FINALS-IMPLEMENTATION-PLAN.md#execution-readiness-20261029)와 [RUNBOOK](../RUNBOOK.md#단계별-검증과-판정)이 준비 순서·자동/수동 범위·실패 복구의 기준입니다. [이전10월27일 증거](../../artifacts/pre-execution-20261027.json)의171개 시험과 계약 소스 오프라인 컴파일은 과거 기록입니다. 이번에는 계약 코드를 바꾸지 않아 컴파일을 재실행하지 않았습니다. source/설정/환경 identity와 이번 dry-run은 [증거 색인](../../artifacts/execution-readiness-rechecked-20261029.json)에 있습니다.

이 실행 준비 시점에는 DB·체인·Witness·OIDC·Asterisk·TURN·브라우저/마이크·STT/LLM·GCP·장애/부하·실제 백업/복원이 **미실행**이었습니다. 이후 DB/계약/선택 HTTP·화면 검증은 아래 기록과 구분합니다. 신규 PostgreSQL 계정/세션·quota/claim·signer lease·checkpoint, 독립 HTTPS anchor 시험과 PBX 브라우저 시험은 소스·타입 검사만 했습니다. 검증 p95 500ms, 철회 반영 p95 5초, 상태 최대 수명 10초는 설계 목표이며 실측값이나 SLA가 아닙니다.

PBX 증거는 고정한 인증서와 실제 ARI 관측을 브라우저 DTLS 관측에 대조하는 보장입니다. 서버가 DTLS handshake를 독립 수집했다고 주장하지 않습니다. 별도 외부 미디어 서버를 가정하지 않으며 Asterisk가 음성 종단입니다. 임의 SIP proxy·PSTN·단말 OS·자동 전환은 지원 범위가 아닙니다.

이 표는 [MASTER](../MASTER-DEVELOPMENT-SPEC.md)와 [진행표](../FINALS-IMPLEMENTATION-PLAN.md)의 검토용 설명입니다. 코드·검증을 바꾸면 근거와 함께 갱신하며 별도 완료 기준을 만들지 않습니다.

공식 `/official` 경로의 표시명만 변경하면 기존 통화를 유지합니다. 허용 질문·금지 요구 등 정책 hash가 바뀌면 공동 승인과 새 epoch를 요구해 구 VC/승인/통화를 무효화하고 새 trust/웹 pin을 게시합니다. 신규 배포는 authority checkpoint 기준을 명시하며 구 DB/anchor를 flag 변경만으로 자동 채택하지 않습니다.

신규 발급/연결은 현재 원장 정책·키와 게시한 trust/웹 pin이 일치할 때만 허용합니다. 공동 변경 UI는 사람이 읽는 전후 비교와 파일 교환을 지원하며 장기 개인키는 브라우저에 입력하지 않습니다. 단계 runner가 MANUAL로 표시한 항목은 운영자의 실제 관측과 출처 hash 검토가 필요하고 자동 PASS가 아닙니다.

## 실행 준비 후속 확인

최신 light는42개 파일·193개 시험 통과이며 웹 build/runtime 타입도 통과했습니다. [현재 증거](../../artifacts/readiness-refinement-complete-20261029.json)는 전체 설정 누락으로 BLOCKED이며 실환경 성공이 아닙니다. 수동/자동 방식, 실행 여부, PASS/FAIL/미판정, 증거 검토를 별도로 기록하도록 수정했습니다. 검토된 수동 PASS/FAIL을 표현하며 옛 MANUAL은 미판정으로 읽습니다. 첫 DB 검증은 AI/PBX/전체 배포 설정을 기다리지 않고 소스 통과와 별도 시험 DB 조건을 요구합니다. [최신 진행표](../FINALS-IMPLEMENTATION-PLAN.md#readiness-refinement-20261029)와 [RUNBOOK 입력·첫 검증 절차](../RUNBOOK.md#실행-전-정합성-보완--2026-10-29-후속)를 따릅니다.

## 첫 DB 실검증

2026-10-29 별도 승인 후 격리 PostgreSQL17.6의 선택된4파일15시험이 통과했습니다. 실제 SQL 소비/응답 유실·quota·worker 경합·계정 회수·migration hash와 auth LOGIN 금지 SQL을 확인했습니다. 메모리 anchor와 tmpfs DB이므로 독립 복구·영속 disk 장애·체인·통화·AI 검증으로 확대하지 않습니다. [현재 시도·자원·commit 기록](../FINALS-IMPLEMENTATION-PLAN.md#postgres-validation-20261029)을 따르며 앞선 DB 미실행 문구는 과거 상태입니다.

## 로컬 계약 실행 확인

2026-10-30 Foundry 로컬 EVM에서 권한·서명·상태 전이21시험, 제한 fuzz32회가 통과했습니다. 실제 앱 함수로 생성한 서명·calldata를 계약에 전달하고 consumer event bytes도 대조했습니다. light43파일194시험·웹 build·API runtime 타입도 통과했습니다. [최신 기록](../FINALS-IMPLEMENTATION-PLAN.md#contract-validation-20261030)의 도구·시험 HEAD·커밋 재구성 대응을 따릅니다. 이 결과는 Besu/Witness·배포·통화·AI·독립 복구 성공을 뜻하지 않습니다.
