# CallSign 작업 내용 통합 정리

작성일: 2026-10-27(KST)  
대상: 시작 커밋 `7aa26d9` 이후 작업부터 `40d490c`까지의 5개 커밋  
저장소: https://github.com/0u-Y/CallSign

## 1. 이번에 한 일을 먼저 요약하면

기존 CallSign을 보존하면서 **기관 업무 → 콜센터 위임 → 개별 연락 승인 → 통화 세션 검증 → 상대 음성의 위험 안내**를 연결하는 코드·화면·시험·운영 설정을 추가했다. 이후 전체 개발 명세와 멘토링 자료를 정리하고, 변경을 5개 커밋으로 나누어 `origin/main`에 push했다.

**전체 서비스가 완성되거나 실환경을 통과한 상태는 아니다.** 기존 v2 직접 통화 화면과 새 v3 승인·lease·PBX 코드 사이에 연결할 부분이 남아 있다. 코드 미구현과 실제 환경 미검증을 아래에서 구분한다.

- 변경 규모: **140개 파일**, 추가 7,867줄·삭제 167줄. 이 문서 자체는 이 집계 이후 작성했다.
- 최신 허용 검증: `pnpm light` **18개 파일·82개 테스트 통과, 실패 0**.
- 기동하지 않은 것: DB·블록체인·Witness·PBX·TURN·브라우저·마이크·외부 AI·GCP.
- 보존한 것: 기존 v1 코드·fixture, 원본 기획서, 과거 시험·영상·키·데이터.
- 대표 업무: **모의 금융기관의 이상거래 확인 연락**. 실제 금융기관·통신사와 연동했다고 표현하지 않는다.

## 2. 서비스 설계를 정리했다

| 항목 | 확정한 방향 | 현재 이행 상태 |
|---|---|---|
| 기관·콜센터 식별 | 등록 URI와 등록 키를 기본으로 사용. DID는 선택, 고객 지갑 불필요 | v3 API는 DID resolver 없이 동작하는 코드. 기존 준비 도구·화면의 전환은 남음 |
| VC | 기관이 콜센터에 맡긴 업무 범위의 재사용 위임 증서 | 발급·서명·검증·상태 참조 코드. 원장 자동 등록 worker는 남음 |
| 개별 연락 승인 | 고객·업무·목적·통화 시도·세션키·nonce·권한 세대에 결합 | v2/v3 API와 strict schema 작성 |
| 승인 시간 | 120초는 연결 시작 창. 진행 통화는 별도 lease로 유지 | v3 상태 로직·시험 있음. 기존 v2 UI는 아직 새 lease 흐름에 미연결 |
| 기본 통화 | 상담원 웹 ↔ Asterisk PJSIP/WSS+ARI ↔ 수신자 웹 | PBX 제어·증거·SIP 모듈 부분 구현. 전체 제품 경로 미완성 |
| 공동 운영 | Besu 검증자4, Witness3-of-4, 주요 관리 승인2-of-3 | 기존 구성·계약 유지와 집계/복구 코드 보강. 실환경 미실행 |
| AI | 기관 승인과 별개로 통화 내용의 위험을 안내 | 상대 오디오 분석 코드. 제공자·정확도 검증 없음 |
| native chain proof | Witness와 다른 후속 확장 | 미구현이며 이번 기본 서비스 완료 조건에 새 연구 과제로 추가하지 않음 |

기관 승인, 현재 연결, 내용 위험, 분석 장애는 따로 표시한다. ‘기관 승인’을 ‘안전한 전화’, ‘확인 불가’를 ‘사기’로 표현하지 않는다.

## 3. 기관 업무·인증·권한 코드를 추가했다

- 모의 CRM/FDS 업무에 기관·수신자·상담원 할당·발신 서비스·목적 정책을 연결했다.
- 타 기관 객체, 다른 수신자의 업무, 할당받지 않은 상담원의 발신을 서버 경계에서 거절하도록 했다.
- 일반 업무와 공식 후속 업무의 로그인 세션을 purpose·issuer·client·audience로 분리했다.
- 선택한 세션만 로그아웃하고, CSRF를 검사하며, 이미 사용한 로그인 토큰의 재사용을 차단하는 저장 경로를 추가했다.
- 세션 폐기·권한 변경을 주기적으로 확인해 기존 WebSocket과 분석 작업을 정리하는 코드를 보강했다.
- UI에서 선택한 통화와 실제 연결된 통화를 구분하고, 로그아웃 이후 도착한 늦은 응답을 폐기하도록 했다.

주요 파일: [업무·소유권 모델](../services/api/src/finals-model.ts), [인증](../services/api/src/auth.ts), [OIDC 로그인](../services/api/src/oidc-flow.ts), [세션 연결 회수](../services/api/src/session-connections.ts), [역할 화면](../apps/web/src/pages/Finals.tsx).

**남음:** 담당자/관리자 permission 세분화, 주요 작업 재인증, 실제 IdP·DB 계정 권한 검증, PBX까지 포함한 로그아웃·철회 회수.

## 4. VC·승인·일회 소비·통화 유지 로직을 작성했다

기관 승인키를 가진 Issuer Gateway, 콜센터 장기키를 가진 Sender Agent, 요청을 전달하는 Platform 역할을 나눴다. Platform과 브라우저에 기관·콜센터 개인키를 전달하지 않는다.

기존 v2를 보존하면서 새 v3에 다음을 추가했다.

1. 등록 기관 URI·콜센터 키·업무 범위·기간·권한 세대·원장 상태 참조를 담은 VC 발급과 JWS 서명.
2. 서버 challenge에 대한 콜센터 키 소유 증명과 상담원·브라우저 세션 공개키 결합.
3. 수신자가 생성한 nonce와 공개키의 최초 등록, 승인·양측 세션 증명·binding 검사.
4. 최초 소비의 binding과 서명 영수증 저장. 같은 binding 재시도는 동일 결과, 다른 binding 재사용은 거절.
5. 거절·부재·오류·취소·종료 상태와 terminal 결과의 중복 처리·늦은 사건 충돌 거절.
6. 최초 연결120초와 진행 lease 분리. 신규 연결의 권한 확인 실패는 차단하고, 진행 중 확인 불가와 명시적 철회를 구분.
7. 서버의 성공 표시 대신 서명 객체·원장 상태·세션·실제 전송 근거를 대조하는 v3 수신 verifier.

주요 파일: [v3 protocol](../packages/protocol/src/service.ts), [서비스 권위 로직](../services/api/src/service-authority.ts), [API](../services/api/src/service-routes.ts), [역할별 서버](../services/api/src/finals-server.ts), [v3 verifier](../packages/verifier/src/service.ts).

**남음:** v3 verifier 자체의 변조 시험과 UI 호출 연결, 양측 수락·갱신·실제 전송 확인, 자동 timeout·재시작 처리. 코드의 lease30초·최대 통화4시간은 임시 정책이며 최종 운영 정책이나 성능 실측값이 아니다.

## 5. SQL·원장 상태·복구의 기반을 추가했다

- 기관 행을 잠그는 transaction 안에서 업무·소비·취소·감사를 갱신하는 저장소를 작성했다.
- v1/v2/v3가 기관·승인 ID의 공통 소비 namespace를 사용하도록 SQL 제약·legacy trigger·backfill을 작성했다.
- 재처리할 작업 의도를 보관하는 outbox, 공유 quota, 원장 event cursor, 복원 후 발급/연결을 막는 recovery gate 테이블을 추가했다.
- 통화·사용자·기관·전체 단위 분석 예산의 저장·예약 경로를 추가했다.
- v3 권한 snapshot의 최고 관측 블록·hash·상태를 저장하고 rollback·같은 높이의 충돌을 거절하는 checkpoint 코드를 추가했다.
- Witness 집계는 동일 snapshot의 서로 다른 유효 서명을 모으고, 느린 하나·단일 RPC에 종속되지 않도록 작성했다.
- 기관 승인키 파일의 private/public 대응 검사와 새 키·세대 확인 후 기존 v2 권한을 무효화하는 회전 경로를 보강했다.

주요 파일: [공통 저장소](../services/api/src/finals-store.ts), [0001 migration](../services/api/drizzle/0001_finals_authority.sql), [0002 세션 migration](../services/api/drizzle/0002_session_scopes.sql), [0003 runtime migration](../services/api/drizzle/0003_service_runtime.sql), [checkpoint 검사](../services/api/src/service-current.ts), [Witness 집계](../services/api/src/witness-aggregate.ts), [공동 관리](../services/api/src/governance-v2.ts).

**SQL은 적용하지 않았다.** 순차 메모리 fake로 PostgreSQL 잠금·원자성·최소 권한을 입증한 것이 아니다. outbox worker, 실제 트랜잭션 제출 재처리, event consumer, retention, 독립 복원 anchor와 gate 해제, 완전한 백업·복원은 코드 작업도 남아 있다. 기존 Solidity 계약·Besu 엔진을 새로 개발했다고 주장하지 않는다.

## 6. 실제 음성·PBX·AI 코드를 추가했다

### 직접 WebRTC와 PBX

기존 직접 통화 경로에는 마이크 준비, 수락 전 track 미부착, 양방향 오디오, 음소거·종료·장치 오류 정리, TURN 단기 credential 코드를 추가했다.

새 PBX 경로에는 ARI 실제 채널·SIP Call-ID 조회, 양측 SDP 보고 대조, 준비 시 mute, 수락·lease 조건 확인 후 bridge 구성·멤버 확인·unmute와 별도 연결 증거 JWS를 작성했다. 브라우저용 SIP-WSS 등록·SHA-256 digest 인증·수신 INVITE/ACK·WebRTC answer 모듈도 작성했다.

주요 파일: [직접 통화](../apps/web/src/lib/finalsCall.ts), [마이크·remote audio](../apps/web/src/lib/liveMedia.ts), [ARI 제어](../services/api/src/asterisk.ts), [PBX API](../services/api/src/pbx-routes.ts), [브라우저 SIP](../apps/web/src/lib/pbxSip.ts).

**PBX 전체 통화 경로는 미완성이다.** 역할 UI·SDK 연결, 실제 DTLS 관측, ARI 사건 구독·자동 회수·재시작 조정, Asterisk 실제 설정·이미지·배포·통합 시험이 남아 있다. PBX 증거는 해당 시스템의 연결 문맥이며 상담원 개인의 신원 증명이 아니다.

### 상대 음성 위험 분석

- 상대 remote stream을 서버로 보내 Deepgram 스트리밍 STT와 규칙·Anthropic LLM에 연결하는 코드를 작성했다. 기존 Ollama 선택 코드도 보존했다.
- segment/revision·partial/final·중복/역순·늦은 판정·부정/인용/자기정정을 고려해 경고를 갱신·철회하도록 했다.
- 근거가 실제 전사 원문에 있는지 검사하고, 전사문 지시를 모델의 도구 실행·통화 제어에 연결하지 않았다.
- 동의 철회·세션 종료 시 분석 중단, 요청/시간/크기 한도·backpressure와 v3 영속 quota 경로를 추가했다.
- 원음 영구 저장은 기본 비활성화하고 분석 불가를 안전으로 표시하지 않는다.

주요 파일: [전사·revision·제공자 adapter](../services/api/src/transcription.ts), [v3 분석 WS](../services/api/src/service-audio.ts), [규칙](../services/api/src/risk.ts).

**제공자는 호출하지 않았다.** v3 화면 연결·전체 삭제 경로·제공자 보관 조건·실제 비용·한국어 오탐/미탐/지연 검증은 남아 있다.

## 7. 가벼운 개발과 운영 준비를 분리했다

- 기본 `pnpm light`에 소스 위생·타입 검사·작은 오프라인 시험만 포함했다.
- light는 최대 worker2, fetch/TCP/UDP/listen 차단을 유지한다.
- 인프라·체인·미디어·성능 실행에는 기본 guard를 두고 이번 작업에서 해제하지 않았다.
- 일반 push/PR CI는 light만 실행하도록 바꾸고 DB 통합 CI는 명시적 수동 경로로 분리했다.
- Dockerfile·Compose·HTTPS/프록시·TURN 예시·GCP Terraform/systemd·migration·키 준비·배포·backup/restore 스크립트를 작성했다.
- 일반 재시작에서 체인 초기화·계약 재배포·키 재발급을 자동 실행하지 않도록 구성했다.

주요 근거: [package.json](../package.json), [기본 CI](../.github/workflows/ci.yml), [수동 통합 CI](../.github/workflows/integration-manual.yml), [배포 구성](../infra/deploy/compose.yml), [GCP](../infra/gcp/main.tf), [RUNBOOK](RUNBOOK.md).

**운영 준비도 부분 구현이다.** 새 URI/lease/PBX 기본 구성으로의 배포 연결, 최소 관리키 접근, 일관 백업·복원, 릴리스·관측과 실제 환경 검증이 남아 있다. 이미지 build/pull·서비스 기동·Terraform plan/apply는 하지 않았다.

## 8. 개발 명세와 멘토링 자료를 정리했다

전체 목표·현재 상태·완료 조건을 [MASTER-DEVELOPMENT-SPEC.md](MASTER-DEVELOPMENT-SPEC.md)의 **74개 요구 ID**로 정리했다. 아키텍처·프로토콜·위협 모델·표준·한계·runbook·ADR·제출 초안도 맞췄다.

멘토에게 GitHub 링크 하나로 전달할 수 있도록 [docs/mentoring](mentoring/README.md)에 다음을 모았다.

| 파일 | 역할 |
|---|---|
| `README.md` | 진입점·읽는 순서·사용자 제공 멘토링 질문1개 |
| `01-SERVICE-OVERVIEW.md` | 대상·역할·고객 진입·도입 부담·보장 범위 |
| `02-ARCHITECTURE.md` | 서비스·키·DB·음성·원장·AI 신뢰 경계 |
| `03-CALL-FLOW.md` | 위임·승인·일회 소비·통화 유지·종료·복구 |
| `04-TRUST-AND-SECURITY.md` | 등록 키·세 정족수·재사용 방지·개인정보·한계 |
| `05-IMPLEMENTATION-STATUS.md` | 코드·연결·검증·남은 작업 구분 |
| `assets/architecture.svg` | 전체 구조도. 미연결 경로는 점선으로 구분 |

독립 문서 검토에서 고객 진입 누락, 음성 허용 순서, 그림 방향, 소비 후 부재 전이를 지적받아 수정했다. 상대 링크154개, SVG XML, Markdown fence, MASTER ID/anchor를 점검했다. 브라우저·GitHub 렌더는 확인하지 않았다. 3차 멘토링 원문은 없어 발언·채택 내역을 지어내지 않았다.

전달 링크: https://github.com/0u-Y/CallSign/tree/main/docs/mentoring

## 9. 실제 검증과 미실행 항목

| 구분 | 결과 |
|---|---|
| `pnpm light` | 소스 위생·타입 통과, **18개 파일82개 테스트 통과·실패0**. 커밋 전 재확인 |
| `git diff --check`·staged 검사 | 통과 |
| 문서 링크·그림 정적 검사 | 상대 링크 누락0, SVG XML 유효. 렌더 검증 아님 |
| 실제 PG·브라우저 시험 소스 | 일부 작성·타입 검사. 실행하지 않음 |
| 비밀값·대형 생성물 검사 | 추가될 파일에서 해당 패턴 후보0. 완전한 보안 감사는 아님 |
| push | 성공. 당시 로컬 HEAD와 원격 main 일치 확인 |
| GitHub CI 결과 | 이 정리에서 확인하지 않음. 로컬 light 성공과 구분 |

[현재 개발 증거](../artifacts/master-implementation-20261027-service.json)와 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)에 세부 범위를 남겼다. 과거44개·66개 결과는 보존하되 현재 결과에 합산하지 않는다. `punycode` deprecation 경고는 남아 있다. 새 v3 verifier/PBX API/audio 전체가 단위 검증됐다는 뜻도 아니다.

DB·Besu·Witness·OIDC·API/웹 스택·PBX·TURN·브라우저·마이크·외부 STT/LLM·Ollama·GCP·장애/부하 검증은 수행하지 않았다. 메모리 fake를 실제 통화·합의·DB 원자성의 증거로 제시하지 않는다. p95 검증500ms·철회 반영5초는 목표이며 실측 성능이나 SLA가 아니다.

## 10. 커밋과 push 결과

| 커밋 | 한 줄 메시지 |
|---|---|
| `7fb20f7` | feat: add delegated contact authority and versioned call verification |
| `3339e90` | feat: add authenticated workspaces and browser call controls |
| `3235b6d` | chore: guard infrastructure execution and prepare deployment profiles |
| `ab0ec1c` | test: cover authorization boundaries and preserve offline evidence |
| `40d490c` | docs: unify development specs and mentoring review materials |

5개 커밋을 `origin/main`으로 push했고 최종 반영은 `40d490cf12e07b54568e7eef548c9216114e617d`였다. push 직후 작업 트리는 clean이었다. 저장소 공개 범위 변경·서비스 배포·메일 발송은 하지 않았다. **이 요약 파일은 push 이후 별도로 작성했으며 현재 미커밋·미push 상태다. 위 5개 커밋에는 포함되지 않는다.**

## 11. 남은 작업을 구분하면

**아직 코드 작업이 필요한 것:** v3 기본 화면·trust/키 준비 전환, 양측 verifier·lease·PBX 연결, ARI 사건/철회/logout 자동 회수, durable outbox·원장 작업/event worker, 독립 복원 anchor·gate 해제·retention·완전 backup, 관리 역할·재인증·키 경계, v3 전체 시험·한국어 평가.

**외부 설정과 실제 실행이 필요한 것:** 소유 도메인/DNS/TLS, OIDC 계정/client/audience, 역할별 DB LOGIN, 기관·콜센터·PBX·Witness·관리 승인자 키, 체인·계약/trust metadata, 검토한 이미지, TURN·PBX 주소/포트, STT/LLM 계정·보관/비용 정책, GCP 프로젝트/IAM/VM/디스크. 실제 비밀값은 문서·채팅·Git에 넣지 않는다.

이 문서는 완료한 5개 커밋의 작업 요약이다. 새 기능 요구나 전체 완료 선언을 대신하지 않는다. 이후 개발의 기준은 [MASTER](MASTER-DEVELOPMENT-SPEC.md), 실제 검증과 변경의 기준은 [진행표](FINALS-IMPLEMENTATION-PLAN.md)다. 이번 요약 작성에서는 기능 코드 변경·서비스 실행·테스트 재실행·추가 commit/push를 하지 않았다.
