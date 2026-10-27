# 본선 개발·요구 추적·검증 기록

기준일: **2026-10-27(KST)**. 기능 코드·시험 기준은 `ab0ec1c`, 개발·멘토링 문서의 최초 게시 커밋은 `40d490c`다. 두 커밋은 main에 push됐으며, 이 문서 정리는 기능 코드와 검증 결과를 변경하지 않는다. 서버컴에서 개발 중이고 GCP VM 이전은 미실행이다.

전체 요구·완료 조건은 [MASTER](MASTER-DEVELOPMENT-SPEC.md), 외부 검토의 진입점은 [멘토링 자료](mentoring/README.md), 이후 실행 절차는 [RUNBOOK](RUNBOOK.md)이다. **현재 서비스는 부분 구현이며, 실행 승인만 기다리는 전체 완료 상태가 아니다.**

## 실행 제한

[AGENTS](../AGENTS.md)를 따른다. 사용자 별도 요청 전 DB·Besu·Witness·PBX·TURN·API/웹 스택·브라우저·마이크를 기동하지 않는다. 이미지 pull/build·migration 적용·체인 초기화/배포·실제 provider·모델·GCP·장애/부하 실행도 금지한다. 기존 프로세스·데이터·키·시험 증거는 보존한다. 기본 개발 검증은 네트워크 없는 `pnpm light`다.

<a id="service-20261027"></a>

## 현재 구현과 남은 작업

확정 설계는 등록 URI/키 기본·DID 선택, 기관→콜센터 업무 위임 VC,120초 연결 시작과 유지 lease 분리, 웹↔Asterisk PJSIP/WSS+ARI↔웹 기본이다. native proof는 기본 완료 gate에서 제외한 후속 확장이다. 이전 DID 필수·짧은 승인 만료 시 전체 통화 종료·별도 외부 Edge 설계는 현행 목표로 승계하지 않는다.

| 요구 ID | 이번 코드·호출 연결 | 구현 상태 | 검증 상태와 남은 코드 |
|---|---|---|---|
| IDENTITY-001/003, CALL-001 | `protocol/service.ts`, `service-authority.ts`, `service-routes.ts`, finals-server의 v3 proxy·Sender service-proof·Issuer route | 부분 구현: 등록 URI VC·요청별 proof·승인 API | 단위·타입 통과. DID 없는 키/trust 준비·기본 UI/profile 전환 미구현 |
| CALL-002/003/004/005 | terminal 거절·부재·오류·취소·종료, 수신자 키/nonce enrollment, 양측 PoP·최초 binding, 동일 저장 JWS 복구, 시작120초/lease30초 분리 | API/순차 상태 로직 작성, 전체 기능 부분 구현 | 순차 fake 12개. UI·양측 transport/갱신 연결·timeout/watchdog·실제 동시성 미완성/미검증 |
| DB-001/002/003, STATE-003, OPS-005 | `0003_service_runtime.sql`, store: 기관/승인 공통 namespace·v1 trigger·v2 backfill·outbox·global quota·recovery gate, `service-current.ts`의 영속 checkpoint | 부분 구현 | 타입 검사. migration/GRANT/SQL 경합 미실행. worker·event cursor 소비기·retention·독립 anchor와 복구 해제·전체 backup 미구현 |
| PBX-001/002/003, CALL-006 | `asterisk.ts`, `pbx-routes.ts`, `pbxSip.ts`, `verifier/service.ts`: 실제 ARI 채널/Call-ID 조회·mute/bridge·JWS·consume 검사·별도 PBX verifier branch·SIP UAS 모듈 | 부분 구현: 제어/암호 경계 코드, UI·운영 미연결 | ARI fake2개·SIP parser/digest2개 통과, 타입 검사. v3 verifier 변조 시험·브라우저 호출/관측·ARI 사건·자동 회수·설정/이미지·통합 suite 미완성 |
| AI-001~004 | `service-audio.ts`, v3 WS proxy·기존 Deepgram/Anthropic 실제 adapter, 동의 generation/1stream·영속 예산 예약·현재 세션/lease 검사 | 부분 구현: v3 서버 경로 작성 | 타입 검사, 기존 revision fake 회귀. v3 UI·삭제/비용/공급자 전체 시험·한국어 독립 평가 미완성 |
| UI/OPS/GOVERNANCE | 기존 v2 화면/배포/관리 코드 보존 | 부분 구현 유지 | URI/lease/PBX 전환·권한 세분화·재인증·새 v3 전체 회수·최소 관리키 경계·배포 연결 남음 |

원장 등록 outbox worker가 없어 v3 VC pending이 자동 확정되는 제품 경로는 없다. PBX 제어·SDK·SIP 모듈도 역할 화면·ARI 사건 처리·철회/로그아웃 회수까지 연결해야 한다. 기본 UI/배포는 여전히 v2 직접 통화 경로이며 v3가 자동 적용되지 않는다.

v3 코드의 lease30초·최대 통화4시간은 임시 정책이다.120초는 확정된 연결 시작 창이며,4시간을 최종 운영 정책이나 성능 실측값으로 취급하지 않는다. 최신 권한 상태는 관측8초·각 시계오차1초 기준으로10초 상한을 목표로 하며 실환경 검증이 필요하다. 기존 v1/v2의12초/2초는 회귀 정책이다.

## 최신 검증 결과

- `pnpm light`: **18개 파일·82개 통과·실패0**, 소스 위생·타입 검사 통과. 커밋 직전에도 같은 결과를 확인했다. 기존 회귀를 포함한 전체 수이며 `punycode` 경고가 남아 있다.
- [현재 결과·원본 출력·코드 hash](../artifacts/master-implementation-20261027-service.json)를 보존한다. 새 v3 verifier·PBX API·audio는 타입 검사만 한 부분이 있고,82개 통과가 전체 요구 coverage를 뜻하지 않는다.
- 문서 검토 시 상대 링크154개, SVG XML·Markdown fence·MASTER74개 ID/anchor를 검사했다. 독립 검토에서 고객 진입·음성 gate 순서·그림 방향·부재 전이를 보완했다. 브라우저/GitHub 렌더는 미확인이다.
- 메모리 fake는 실제 PostgreSQL 잠금·원자성·QBFT 장애 내성·실제 통화·AI 정확도의 증거가 아니다. 측정 목표를 실측 성능/SLA로 표시하지 않는다.

실제 PG·OIDC·서비스 연결·Besu/Witness·WebRTC/TURN/PBX·STT/LLM·GCP·복구·장애/부하 검증은 미실행이다. 일부 PG·v2 미디어 시험은 작성·타입 검사만 했고 v3 전체 통합 시험은 추가 작성도 필요하다. 이번 문서 정리에서 시험을 재실행하지 않았다.

## 인증·조회·연결 폐기 이행

2026-10-27 인증 단계에서 작성한 경계다. 이후 서비스 profile 이행과 함께 적용하며, 아래 경계의 완료를 전체 AUTH/UI/운영 완료로 확대하지 않는다.

| ID·작업 | 구현 상태 | 검증 상태·범위 |
|---|---|---|
| AUTH-002: legacy/work/official purpose·issuer/client/audience, 선택 scope logout·CSRF, 별도 replay ledger | 해당 경계 코드 구현 완료. 전체 AUTH-002는 재인증 정책 등 남아 부분 구현 | scope/cookie 전용·로그아웃/토큰 재사용/기본 legacy 격리 fake route 단위 검증. 실제 OIDC/PG/역할/동시성 대기 |
| BUSINESS-001: workspace의 수신자·상담원·공동 승인자별 객체/VC 반환 | 해당 projection 코드 구현 완료. 전체 역할 관리 미완성 | `workspace.test.ts` 소속·타기관·불일치 승인·VC 반환 단위 검증 |
| CALL-006/MEDIA/AI: 세션 폐기 시 live socket/분석 중단·현재 DB 권한 재검사 | 보완 코드 구현 완료. v3 lease와 실제 media·chain 검증 별도 | `session-connections.test.ts` fake clock의 즉시 회수·slow check timeout·cleanup, finals test의 VC/key/epoch/서비스 상태 변화. 실제 WS/통화 미실행 |
| GOVERNANCE-002: 실제 private/public key 대응 검사 | reader 검사 구현 완료. 전체 회전 workflow 미완성 | `signing-key.unit.test.ts` 실제 Ed25519로 잘못된 private seed 거절. 체인/키 파일 변경 없음 |
| UI: 선택 attempt와 연결 attempt 분리, 로그아웃 후 늦은 응답 차단·scope별 CSRF | 코드 구현 완료 | 타입·API helper 단위 검증·독립 소스 검토. 실제 React/브라우저 경합·접근성 대기 |
| DB: `0002_session_scopes.sql`, v1/v2 공통 versioned migration entrypoint | 파일 작성 완료, 적용 안 함 | 소스/타입 검사. `finals-session-scopes.test.ts` 실제 DB 시험 작성·타입 검사만, 실행 안 함 |

`0002_session_scopes.sql`은 기존 세션을 legacy로 유지한다. logout은 선택 scope의 세션을 회수하고, 별도 replay ledger는 세션 삭제 뒤에도 같은 ID token의 재사용을 막는다. 실제 DB migration·GRANT·동시성은 미검증이다.

## 검증 이력과 보관 자료

| 시점·범위 | 당시 결과 | 보존 근거 |
|---|---|---|
| 2026-10-27 서비스 profile |18개 파일82개 통과 | [service 결과](../artifacts/master-implementation-20261027-service.json) |
| 2026-10-27 인증 경계 |15개 파일66개 통과 | [auth 결과](../artifacts/master-implementation-20261027-auth.json) |
| 2026-10-26 초기 v2 개발 |10개 파일44개 통과, 당시 웹·Compose·shell 정적 검사 | [과거 보고서](archive/2026-10-26/FINALS-DEVELOPMENT-REPORT.md), [raw 결과](../artifacts/finals-light-results.json), [요약](../artifacts/finals-validation.json) |
| 2026-09-14 v1 |당시 별도 환경의 시험 결과 | [과거 시험 기록](TEST-RESULTS.md) |

44·66개 결과를 현재82개 결과에 합산하지 않는다. [이전 4회차 초안](archive/2026-10-26/FINALS-ROUND4.md)은 보관 자료이며 현재 검토 자료를 대체하지 않는다. 원본 기획 PPTX/PDF·과거 raw 증거는 유지한다.3차 멘토링 원문은 확인하지 못해 발언·반영 내역을 추정하지 않는다.

## 커밋·문서 정리 기록

기존 변경140개 파일을 백엔드/프로토콜, 웹, 실행 가드/배포, 시험/증거, 문서의5개 커밋으로 나누어 main에 push했다. `7fb20f7`, `3339e90`, `3235b6d`, `ab0ec1c`, `40d490c`가 해당 이력이다. 이 전달은 배포나 실환경 성공을 뜻하지 않는다.

후속 문서 정리에서는 과거 보고서·4회차 초안을 `docs/archive/2026-10-26/`으로 옮기고 링크를 수정했다. 현행 진행표는 최신 상태부터 읽도록 정리했으며 중복 현황·도구 사용 메모와 설명 문서의 로컬 절대 경로를 제거했다. 원본 검증 JSON은 수정하지 않았다. 정리 후 상대 링크150개·Markdown fence·SVG XML·MASTER74개 ID/anchor·문서 전용 diff를 검사했고, 기존 JSON 증거의 바이트가 HEAD와 동일함을 확인했다. 사용자 요청으로 별도 작성한 로컬 `WORK-SUMMARY.md`는 그대로 보존한다.

## 다음 개발 시작점

이 문서와 AGENTS·MASTER를 읽고 현재 ID 표의 코드 미구현부터 진행한다. 우선순위는 v3 화면/양측 수락·갱신 → DB outbox/원장 worker·복구 → PBX 사건/자원 회수·배포 → 관리 재인증·역할/키 경계 → 전체 통합 시험 소스다. 실제 실행은 별도 허가 뒤 RUNBOOK을 따른다. 기존 `demo:up`은 v1 로컬 초기화 도구이며 본선 일반 재시작 명령이 아니다.
