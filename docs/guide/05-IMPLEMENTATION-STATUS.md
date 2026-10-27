# 05. 구현 및 검증 현황

[서비스 가이드](README.md) · 이전: [신뢰·보안](04-TRUST-AND-SECURITY.md)

업데이트: 2026-10-27(KST) · 코드·시험 기준: `ab0ec1c`.

현재는 부분 구현 단계입니다. 코드 작성, API·화면 연결, 단위 검증, 실환경 검증을 구분해 기록합니다.

## 영역별 현황

| 영역 | 구현·연결 상태 | 확인한 검증 | 남은 작업 | 코드·시험 근거 |
|---|---|---|---|---|
| 기관 업무·인증·역할 | 모의 FDS·업무 할당·소유권 검사, work/official 세션·OIDC 흐름·logout 코드와 v2 화면 연결. v3 업무 API 추가 | 순수 권한·workspace·scope·세션 회수 단위 시험, 타입 검사 | 실제 IdP·DB 역할, 관리자/담당자 permission 세분화, 주요 작업 재인증, 업무 재할당 UI | [model](../../services/api/src/finals-model.ts), [auth](../../services/api/src/auth.ts), [scope 시험](../../services/api/src/session-scopes.unit.test.ts) |
| VC·승인·verifier | v2 DID/직접 통화 서명 경로 연결. v3는 URI VC·요청별 서비스 proof·별도 승인/소비 API, 수신 verifier 코드 추가 | v2 서명·변조·원장 binding 단위 시험, v3 URI/nonce/소비 단위 시험·타입 검사 | v3 verifier 자체의 음성 관측·PBX 변조 시험과 UI 호출 연결, URI key/trust 준비 도구, 기본 profile 전환 | [protocol v3](../../packages/protocol/src/service.ts), [authority](../../services/api/src/service-authority.ts), [verifier v3](../../packages/verifier/src/service.ts), [시험](../../tests/unit/service-authority.test.ts) |
| 체인·Witness·공동 관리 | Solidity 계약·Besu4·Witness3/4 집계·관리2/3 복구 코드. v3 checkpoint 검사 추가 | 기존 계약/원장 코드 조사, fake witness·서명·복구·키 대조 단위 시험 | v3 객체 전체 회수, durable 트랜잭션/outbox worker·event cursor 소비기, 독립 운영·실제 회전/철회 검증 | [계약](../../contracts/src/InstitutionRegistry.sol), [집계](../../services/api/src/witness-aggregate.ts), [current](../../services/api/src/service-current.ts), [관리](../../services/api/src/governance-v2.ts) |
| 통화 상태·lease | v3 거절·부재·취소·종료·오류·terminal 전이, 120초 시작 창·30초 lease API. 초기 확인 실패 차단과 진행 확인 불가 분리 | fake clock/store로 시작 창 이후 유지·만료·응답 유실·늦은 이벤트·확인 불가/철회 구분 | 화면/양측 media gating, 세션 폐기·철회 시 PBX 강제 회수, 자동 timeout·재시작 reconciliation | [authority](../../services/api/src/service-authority.ts), [회귀 시험](../../tests/unit/service-authority.test.ts) |
| Direct WebRTC·PBX | v2 직접 마이크·TURN·검증 화면 코드. 새 ARI 실제 채널/Call-ID 조회·mute/bridge·증거 JWS API, SIP-WSS 브라우저 모듈·SQL 작성 | fake media·TURN·ARI 채널/증거·SIP parser/SHA-256 인증 단위 시험, 타입 검사 | 새 SIP 모듈을 역할 UI와 verifier에 연결, ARI 사건 구독·재시작·종료 회수, Asterisk 실제 설정·컨테이너·통합 시험 | [직접 경로](../../apps/web/src/lib/finalsCall.ts), [ARI](../../services/api/src/asterisk.ts), [PBX API](../../services/api/src/pbx-routes.ts), [SIP 모듈](../../apps/web/src/lib/pbxSip.ts), [ARI 시험](../../tests/unit/asterisk.test.ts), [SIP 시험](../../tests/unit/sip.test.ts) |
| STT·AI·위험 안내 | v2 remote audio→Deepgram→revision→규칙/Anthropic→화면 코드, Ollama 선택 코드 보존. v3 오디오·동의 generation·요청 quota 서버 경로 | revision·늦은 판정·근거·부정/인용/정정·중단·backpressure fake 시험, 타입 검사 | v3 화면 연결·브라우저 삭제/리소스 정리, 실제 provider 포맷/보관 설정, 한국어 독립 평가·계정 비용 한도 | [transcription](../../services/api/src/transcription.ts), [v3 audio](../../services/api/src/service-audio.ts), [revision 시험](../../tests/unit/revisions.test.ts) |
| 역할별 UI | 기관·상담원·수신자·공동 운영·공식 업무 v2 화면 API 연결, 로딩/오류/권한 상태·logout 경합 보완 | 타입·API helper 단위 시험. 실제 React 렌더·브라우저 미검증 | v3 URI/lease/PBX 기본 화면, 선택 attempt와 연결 attempt 경합·다중 탭·모바일/접근성 검증, 공식 완료 동작 UI | [Finals 화면](../../apps/web/src/pages/Finals.tsx), [API helper](../../apps/web/src/lib/api.ts) |
| 영속성·복구·운영 | 기관 JSONB 잠금·감사, v3 공통 소비 namespace·outbox·quota·checkpoint·복구 gate SQL/저장소, Compose/GCP/backup 코드 | 타입·기존 설정 정적 검사, 순차 fake 상태 검증 | 새 SQL 실제 적용/GRANT·경합, worker·retention·독립 anchor·gate 해제·완전 backup/restore, v3 배포 환경 연결 | [저장소](../../services/api/src/finals-store.ts), [migration](../../services/api/drizzle/0003_service_runtime.sql), [배포](../../infra/deploy/compose.yml), [RUNBOOK](../RUNBOOK.md) |

‘v3’는 시작 승인과 진행 lease를 구분하기 위한 새 wire schema입니다. **v2 화면이 자동으로 v3를 사용하는 것은 아닙니다.** 버전 혼용·자동 downgrade는 허용하지 않습니다. 기존 `compose.pbx.yml`의 외부 media-edge 이미지 전제와 DID 기반 준비 도구는 확정한 새 구조와 아직 맞지 않습니다. 이 차이는 문서에서 숨기거나 완료로 승계하지 않았습니다.

## 현재 확인한 검증

이번 개발 단계에서 실제 실행한 최신 `pnpm light`는 **18개 파일, 82개 테스트 통과·실패 0**입니다. 소스 위생·JavaScript 문법·API/Witness/웹·선별 스크립트/시험 TypeScript 검사와 네트워크 없는 단위 시험이며, worker 동시 실행 상한 2와 fetch/TCP/UDP/listen 차단을 유지했습니다. `punycode` deprecation 경고는 남아 있습니다.

82개는 기존 회귀를 포함한 전체 수입니다. v3 통화/소비 12개, ARI fake 2개, SIP parser/digest 2개가 이전 인증 단계 이후 추가됐습니다. 이 수치가 모든 요구사항의 시험 coverage를 뜻하지 않습니다. 새 v3 verifier·PBX API·서비스 오디오의 전체 경로는 타입 검사만 한 부분이 있습니다.

현재 기록은 [진행표의 서비스 이행 구간](../FINALS-IMPLEMENTATION-PLAN.md#service-20261027)과 [현재 light 증거](../../artifacts/master-implementation-20261027-service.json)를 따릅니다. 과거 44개·66개 결과 및 2026-09-14 시험은 역사 기록으로 보존하며 현재 성공 증거로 합산하지 않습니다.

## 실행하지 않은 검증

| 환경 | 현재 상태 | 실제로 확인해야 할 것 |
|---|---|---|
| PostgreSQL | 미실행 | migration·role·공통 제약·동시 소비/취소·rollback·commit 뒤 재시도 |
| Besu·Witness | 미실행 | 같은 chain/genesis·정족수·블록 진행·철회·새 키·장애 시 실제 동작 |
| OIDC·서비스 간 연결 | 미실행 | 외부 로그인·별도 공식 업무 audience·세션 회수 |
| 브라우저·마이크·TURN·PBX | 미실행 | 수락 전 송신 0·양방향 오디오·관측 증거·종료 전파·relay·lease |
| Deepgram·Anthropic·Ollama | 미호출·미추론 | 스트리밍 포맷·정확도·수정·취소·보관 조건·비용 |
| GCP·복구·부하 | 미실행 | 인프라·재시작·일관 백업/복원·자원·성능·비용 |

실제 PostgreSQL 시험 소스는 [저장소 경합](../../tests/integration/finals-store.test.ts)과 [세션 scope](../../tests/integration/finals-session-scopes.test.ts), 미디어 소스는 [기존 v2 실제 브라우저 시험](../../tests/media/finals-call.spec.ts)에 있습니다. **새 v3 PBX·복원·provider 전체 시험은 추가 작성도 필요**합니다. ‘실행만 기다리는 상태’로 묶지 않습니다.

승인 검증 p95 500ms(네트워크·Witness 포함), 철회 반영 p95 5초(체인 확정 후 화면까지), 상태 최대 수명 10초는 **설계 목표**입니다. 측정값·달성 성능·SLA가 아닙니다. 최초 승인 발급·ICE 연결·STT 지연은 별도로 측정해야 합니다.

## 우선 해결할 구현 차이

1. 등록 URI/lease/PBX가 확정 목표이지만 기존 배포·화면은 DID/v2 Direct 경로입니다. 새 프로파일의 끝단 연결이 최우선입니다.
2. SQL 테이블이 있어도 worker·독립 복구 anchor·PBX 회수 없이는 내구성과 진행 통화 철회가 완성되지 않습니다.
3. 관리 역할·재인증·기관 승인키와 체인 관리키의 운영 격리는 보완이 필요합니다.

개발 항목과 상태는 [MASTER 요구 ID](../MASTER-DEVELOPMENT-SPEC.md)와 [개발 현황](../FINALS-IMPLEMENTATION-PLAN.md)에 연결해 관리합니다.
