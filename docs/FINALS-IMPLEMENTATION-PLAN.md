# 본선 개발·요구 추적·검증 기록

기준: 2026-10-26, 시작 커밋 `7aa26d9`, 시작 worktree clean. 작업 환경은 사용자가 지정한 64GB 서버컴이며 이후 GCP VM으로 이전한다. 현재 변경은 미커밋 worktree다. 과거 `TEST-RESULTS.md`와 기존 artifacts는 2026-09-14 기록이다.

후속 기준: 전체 목표·현재 상태는 [MASTER-DEVELOPMENT-SPEC](MASTER-DEVELOPMENT-SPEC.md)을 따른다. 아래 A~K 표와44개 결과는2026-10-26 snapshot이다. 넓은 ‘구현 완료’를 전체 영역의 완성으로 승계하지 않는다.2026-10-27 이후 변경은 끝의 후속 이행 기록에 ID별로 구분한다.

Understood as: 기존 스택과 v1 증거를 보존하고, 모의 금융기관의 업무·위임·통화 연결·음성 분석을 코드로 연결한다. 외부 실행 없이 가능한 구현·검증을 진행하고, 실제 인프라/통화/provider/배포 실행은 별도 명시적 요청 뒤에 한다. [AGENTS](../AGENTS.md)의 제한은 다음 세션에도 유효하다. Ponytail full을 적용해 새 외부 패키지 대신 기존 jose/JCS/zod/viem/Fastify/PostgreSQL을 사용했다. API→verifier workspace 의존만 연결했다.

## 요구사항 → 코드 → 시험 → 검증

표의 구현 완료는 해당 코드가 존재하고 로직이 작성됐다는 뜻이다. 운영 성공/표준 적합성 인증/실환경 통과를 뜻하지 않는다. 실환경 검증 대기는 현재 전체 시스템에 공통이다.

| 요구 | 구현/주요 파일 | 구현 상태 | 검사·시험 | 검증 상태 |
|---|---|---|---|---|
| A 업무·기관·소속·할당·모의 FDS·객체 접근 | `services/api/src/finals-model.ts`, `finals-authority.ts`; 수신자/목적/할당 변경은 strict 거절 | 구현 완료 | `tests/unit/finals.test.ts` 타 기관/다른 상담원/수신자·목적·만료·취소 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| B DID/VC 발급·기간·철회·키 버전·소유 증명 | `packages/protocol/src/finals.ts`, `services/api/src/did.ts`, authority; 등록 키/DID controller·assertion/authentication과 원장 대조 | 구현 완료 | finals/DID 단위 시험; `tests/fixtures/finals-{policy,vc}-vector.json` 독립 hash 벡터 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| C 분리 Issuer/Sender·장기 키·DB role | `finals-server.ts` role별 프로세스, `finals-config.ts`, `0001_finals_authority.sql`; Platform은 DB/개인키를 열지 않음 | 구현 완료 | `platform.test.ts`, finals 권한/PoP 시험, Compose key/port/network 정적 assertion | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| C/H 실제 역할 로그인·공식 업무 별도 인증 | `oidc-flow.ts`, finals-server의 code/S256 PKCE/state/nonce·JWT·별도 client/audience/cookie; public 직접 token 로그인 금지 | 구현 완료 | `oidc.test.ts`, public config 거절; 실제 IdP는 미호출 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| D v1/v2 분리·승인/소비·취소·응답 유실·수신 SDK | `finals-authority.ts`, `finals-store.ts`, `packages/verifier/src/finals.ts`; 서명 영수증 저장, 같은 binding 재시도, nonce 상태 응답, 실제 전송 관측 대조. v1 consume도 같은 승인 행을 잠금 | 구현 완료 | finals의 양측 PoP/재사용/취소·후속취소/변조 status/receipt/미지원 transport. `tests/integration/finals-store.test.ts`는 작성만 함 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| E 재사용 위임·VC digest 원장 연결·witness | `witness-aggregate.ts`, witness `/head`/자기 chain/genesis/기관 관계 검사, verifier의 unique signer/같은 높이 conflict/deadline cap | 구현 완료 | `witness.test.ts`, 기존 verifier 회귀; 느린 fake/같은 서명키 별칭/stale. 실제 장애 주장은 없음 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| E 공동 운영·실제 새 승인키 활성화 | `governance-v2.ts`, `sign-recovery.ts`, authority.activateKey와 v2 관리 API; 별도 승인자 2-of-3, 새 epoch/key quorum 후 구 VC/승인 무효화 | 구현 완료 | `governance.test.ts`, finals 키회전 시험. 실제 계약 복구는 미실행 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| F 직접 마이크·수락 gating·양방향·정리·TURN | `apps/web/src/lib/liveMedia.ts`, `finalsCall.ts`, `services/api/src/media.ts`; 새 PC/ICE는 새 시도, 실제 cert/datachannel 미지원 시 거절 | 구현 완료 | `media.test.ts` fake track·TURN·PBX MAC 경계. `tests/media/finals-call.spec.ts` 실제 getStats/track 시험 작성, 미실행 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| F PBX/Media Edge | `AsteriskAdapter` ARI originate, `MediaEdgeAdapter` HTTPS leg 생성, `verifyPbxMapping`; 신뢰 종단은 edge, 개인 신원 아님 | 구현 중 | 제어/MAC 단위 시험만. 실제 SIP/bridge와 PBX UI/수신 SDK 경로는 없음. 직접 v2 consume은 PBX profile 거절 | 단위 테스트 통과(검사 helper) · 실환경 검증 대기 |
| G 실제 STT·revision·정책/규칙·외부 LLM·동의 | `transcription.ts`, finals-server `/v2/audio`, browser remote MediaRecorder; Deepgram WSS/Anthropic Messages 실제 adapter, 기존 Ollama 보존 | 구현 완료 | `revisions.test.ts`, 기존 risk 회귀. partial/final/역순/수정·부정/인용/자기정정·비밀 강요·늦은 응답·동의 철회·backpressure. 제공자 호출 없음 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| H 역할별 실제 API 화면 | `pages/Finals.tsx` 기관/상담원/수신자/공동 운영/공식 업무, `App.tsx`, config의 finals profile. 로딩·오류·empty·retry, 인증/전송/분석/위험 분리 | 구현 완료(직접 경로) | TypeScript/Vite build, UI 정적 detector. 실제 render/반응형/마이크 시험은 미실행 | 정적 검사 통과 · 실환경 검증 대기 |
| I 서버/GCP 배포·최소 권한·운영 | `infra/deploy`, `infra/gcp`, `migrate-finals.ts`, `prepare-finals.ts`, `provision-finals.ts`, backup/restore/deployment 도구. 키 없는 자동 재발급·bootstrap 없음 | 구현 완료(직접 경로 구성) | Compose 기본+PBX overlay 정적 파서, shell syntax, 플랫폼/내부포트/validator·witness key mount assertion. Terraform 도구 검증 없음 | 정적 검사 통과(Compose/shell) · 실환경 검증 대기 |
| J light/무거운 시험·CI 분리 | `vitest.config.ts`, `vitest.integration.config.ts`, `playwright.finals.config.ts`, `scripts/restricted.mjs`, shell/TS guards, `.github/workflows/*` | 구현 완료 | light는 TCP/UDP/listen/fetch 실수 차단, 최대2worker. guard 차단 exit78 확인. 일반 CI는 실행하지 않음 | 정적 검사 통과 · 단위 테스트 통과 · 실환경 검증 대기 |
| K 문서·4회차·멘토링 | README, ARCHITECTURE/PROTOCOL/STANDARDS/THREAT-MODEL/KNOWN-LIMITATIONS/RUNBOOK, ADR0002, `submission/FINALS-ROUND4.md` | 구현 완료(원문 미확인 항목 별도) | 경로/상태/설명 점검, cold read. 원본 기획/기존 raw 증거 보존 | 정적 검사 통과 |

## 실제 실행한 검사

- `pnpm install --frozen-lockfile --ignore-scripts`: 기존 lockfile/cache 사용. 새 모델·브라우저·이미지 다운로드와 lifecycle 실행 없음. workspace 의존 연결 후에도 frozen install 확인.
- `pnpm light`: 소스 위생/JS 문법, API/witness/web/protocol/verifier·새 운영 스크립트·신규 실환경 시험의 **타입 검사만**, 단위 테스트 **44/44** 통과. 기존 회귀를 포함한 총44개이며 새 테스트44개라는 뜻은 아니다.
- `pnpm test:light --reporter=verbose --reporter=json --outputFile.json=artifacts/finals-light-results.json`: 이번 결과를 별도 기록. [기계 판독 결과](../artifacts/finals-light-results.json), [검증 요약](../artifacts/finals-validation.json). `artifacts/vitest-results.json` 등 과거 증거는 보존.
- `VITE_PROTOCOL_PROFILE=finals pnpm --filter @callsign/web build`: 번들/타입 검사 통과. `punycode` browser externalization, dynamic import 및 500KiB 이상 chunk 경고가 있음. 실제 browser runtime 확인으로 대체하지 않음.
- `docker compose -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml config --no-interpolate --no-env-resolution --format json`: **파서만** 통과. 이미지·daemon·컨테이너·서비스에 접근하지 않음. 기본 구성도 별도 정적 확인.
- 파서 출력에 대한 Node assertion: Platform에 private-key mount/DB credential/ledger network 없음, 내부 DB/RPC host port 없음, 각 validator 자기 private key 한 개, 각 witness 자기 key+deployment만 mount.
- `bash -n scripts/*.sh`, `git diff --check`: 통과.
- 기본 상태의 `node scripts/restricted.mjs chain node -e 'process.exit(99)'`: 차단 exit78. 하위 실행 없음. 이번 작업에서 실행 허용 환경값을 켜지 않음.
- UI 소스 정적 detector: 기존 컴포넌트/CSS world를 유지하는 범위의 검사. 브라우저 기동/캡처/실통화는 없음.

## 남은 구현·설정과 실제 검증

1. **구현 중:** 실제 PBX media bridge/제품과 WebRTC/SIP signaling·RTP 종단을 정하고 별도 PBX 수신 검증/화면을 완성해야 한다. 현재 adapter helper를 전체 경로 완료라고 표시하지 않는다.
2. **운영 보완 필요:** 공유·영속 quota/high-watermark, JSONB aggregate의 retention/규모 정책, 장시간 통화 승인 연장·자동 복구는 없다. 현재 짧은 승인 수명 만료 후 새 시도가 필요하다. 월간 과금은 제공자 콘솔 한도를 병행해야 한다.
3. **외부 정보 또는 자격 증명 필요:** 소유 HTTPS/DID 도메인·DNS/TLS, OIDC issuer/JWKS/authorization/token URL·별도 client/audience·역할 계정, DB별 LOGIN 비밀값, 기관/서비스/witness/관리자/정지/승인자별 키, 실제 chain genesis/registry, image digest, TURN 주소/secret/인증서/IP, 선택 STT/LLM 계정·모델·과금 한도, GCP 프로젝트/IAM/VM/VPC/디스크, 실제 PBX 이미지/설정. 실제 비밀값은 채팅에 요구하지 않는다.
4. **실환경 검증 대기:** PostgreSQL migration/GRANT/경합·commit 후 재시도, OIDC·서비스 간 인증/키 mount, Besu4/witness4·회전·철회, v2 browser microphone/getStats/TURN, 실제 STT/LLM와 한국어 품질/동의철회, GCP 재기동·backup/restore/rollback. Terraform validate/plan도 실행하지 않았다.
5. **외부 정보 필요:** 멘토링 원문/4회차 제출 양식. 원문 없이 멘토 의견을 만들어 쓰지 않는다.

후속 실행의 정확한 순서와 명령/범주는 [RUNBOOK](RUNBOOK.md)에 있다. 현재 인프라·체인·컨테이너·provider·GCP를 기동/변경하지 않았고 기존 프로세스/볼륨/키를 중단·삭제하지 않았다. 커밋·push·배포도 수행하지 않았다.

## 전달 품질 점검

- `shower`: 독립된 문서 cold read에서 실행 범주 조합, 준비 명령/파일 위치, 공식 audience와 '같은 체인의 노드4개' 표현을 보완했다.
- `factchk`: W3C VC/DID/JOSE 원문의 프로파일·날짜, did:web 커뮤니티 사양, TURN 초안 지위를 확인해 [STANDARDS](STANDARDS.md)에 범위를 한정했다.
- `mandela`: 같은 작성자의 fake 테스트는 실제 DB/통화/합의 내성/AI 정확도의 독립 증거가 아니다. 그래서 해당 성공/성능 수치를 만들지 않았다. hash 벡터는 Python 표준 라이브러리로 별도 계산했다.
- `ssotize`는 read-only 일관성 점검만 했다. 현재 구현/검증 상태의 기준은 이 파일이고 README/기존 기록은 여기를 연결한다. 기존 증거를 병합·삭제하지 않았다.
- `re0`: README/프로토콜/아키텍처를 현재 v2와 명시적인 v1 회귀 범위로 정리했다. vendor-neutral portability를 주장하지 않아 detool은 생략했다.

## 2026-10-27 후속 이행: 인증·조회·연결 폐기

Understood as: MASTER 명세를 실제 코드로 이행하되, 기존 변경·v1 증거와 실행 제한을 유지한다. Ponytail full로 기존 의존성만 재사용하고 우선 인증·객체 접근·동작 중 연결 회수 경계를 완성한다. 전체74개 요구를 완료했다는 보고가 아니다.

| ID·작업 | 구현 상태 | 검증 상태·범위 |
|---|---|---|
| AUTH-002: legacy/work/official purpose·issuer/client/audience, 선택 scope logout·CSRF, 별도 replay ledger | 해당 경계 코드 구현 완료. 전체 AUTH-002는 재인증 정책 등 남아 부분 구현 | scope/cookie 전용·로그아웃/토큰 재사용/기본 legacy 격리 fake route 단위 검증. 실제 OIDC/PG/역할/동시성 대기 |
| BUSINESS-001: workspace의 수신자·상담원·공동 승인자별 객체/VC 반환 | 해당 projection 코드 구현 완료. 전체 역할 관리 미완성 | `workspace.test.ts` 소속·타기관·불일치 승인·VC 반환 단위 검증 |
| CALL-006/MEDIA/AI: 세션 폐기 시 live socket/분석 중단·현재 DB 권한 재검사 | 보완 코드 구현 완료. v3 lease와 실제 media·chain 검증 별도 | `session-connections.test.ts` fake clock의 즉시 회수·slow check timeout·cleanup, finals test의 VC/key/epoch/서비스 상태 변화. 실제 WS/통화 미실행 |
| GOVERNANCE-002: 실제 private/public key 대응 검사 | reader 검사 구현 완료. 전체 회전 workflow 미완성 | `signing-key.unit.test.ts` 실제 Ed25519로 잘못된 private seed 거절. 체인/키 파일 변경 없음 |
| UI: 선택 attempt와 연결 attempt 분리, 로그아웃 후 늦은 응답 차단·scope별 CSRF | 코드 구현 완료 | 타입·API helper 단위 검증·독립 소스 검토. 실제 React/브라우저 경합·접근성 대기 |
| DB: `0002_session_scopes.sql`, v1/v2 공통 versioned migration entrypoint | 파일 작성 완료, 적용 안 함 | 소스/타입 검사. `finals-session-scopes.test.ts` 실제 DB 시험 작성·타입 검사만, 실행 안 함 |

새 migration은 기존 세션을 legacy로 유지해 v2 진입을 거절하고, logout은 선택 session row를 삭제한다. 재사용 방지 기록은 별도 테이블에 남아 session 삭제에 영향받지 않는다. 만료 기록은 다음 로그인 transaction에서 정리한다. 서비스 중단/재시작과 migration 적용은 이번에 하지 않았다.

기본 검증은 `pnpm light`만 사용했다. 초기 type/test 실패는 모듈 경로·cookie 헤더 형태·오류 객체/Date 직렬화 fixture를 수정했고, 실제 key import 실패도 KEYPAIR_MISMATCH로 정규화했다. 최종 결과는 [별도 후속 검증 파일](../artifacts/master-implementation-20261027-auth.json)에 저장한다. 기존44개 결과와 과거 artifacts는 덮어쓰지 않는다. 신규 실제 PG 시험은 light에서 타입만 검사하고 실행하지 않는다.

최종 `pnpm light`: 소스 위생·타입 검사 통과, **15개 파일 66개 테스트 통과·실패0**.66개는 기존 회귀를 포함한 전체 수다. `punycode` deprecation 경고가 남아 있다. DB/체인/마이크/제공자/브라우저·배포·GCP·장애/부하 시험은 미실행, 새 패키지 설치도 없다. `git diff --check` 통과. 커밋·push·배포는 하지 않았다.

독립 cold read에서 attempt 선택 혼선·UI late response·signaling VC 검사·실패 audio socket 정리·만료 누적을 지적받아 보완했다. light fake가 SQL 잠금/GRANT/실제 소켓/React runtime을 증명하지 않음을 그대로 남긴다. 당장 필요한 비밀값/도메인은 추가 요청하지 않았다.

다음 미구현 우선순위: CALL-002 종료·거절·부재 상태 기계와 CALL-003 수신 nonce/협상 검증, CALL-005 v3 시간/lease 계약 → DB outbox/quota/checkpoint·원장 작업 재처리 → native proof/실제 Edge 및 전체 미디어/AI 통합. 실행 허가 전에는 코드·fixture·시험 소스만 진행한다.

## 다음 세션 시작점

이 파일과 AGENTS부터 읽는다. 반복 조사 대신 미검증 항목을 선택한다. 사용자가 실행을 명시적으로 허용하지 않으면 `pnpm light`와 정적 개발만 계속한다. 외부 작업을 실행하려면 먼저 승인 범주·대상 배포·구성/자격 증명을 확인하고 runbook 순서를 따른다. 기존 `demo:up`은 로컬 v1 초기화 도구이며 본선 재시작 명령이 아니다.

<a id="service-20261027"></a>

## 2026-10-27 서비스 결정 이행과 멘토링 검토 자료

확정 설계는 등록 URI/키 기본·DID 선택, 기관→콜센터 업무 위임 VC,120초 연결 시작과 유지 lease 분리, 웹↔Asterisk PJSIP/WSS+ARI↔웹 기본, native proof 후속 확장이다. 앞선 표의 ‘DID 필수·짧은 승인 만료 시 통화 종료·Janus/외부 Edge·native 필수’는 현행 목표로 승계하지 않는다. 기존 v1/v2·44/66개 증거와 원본은 보존했다.

| 요구 ID | 이번 코드·호출 연결 | 구현 상태 | 검증 상태와 남은 코드 |
|---|---|---|---|
| IDENTITY-001/003, CALL-001 | `protocol/service.ts`, `service-authority.ts`, `service-routes.ts`, finals-server의 v3 proxy·Sender service-proof·Issuer route | 부분 구현: 등록 URI VC·요청별 proof·승인 API | 단위·타입 통과. DID 없는 키/trust 준비·기본 UI/profile 전환 미구현 |
| CALL-002/003/004/005 | terminal 거절·부재·오류·취소·종료, 수신자 키/nonce enrollment, 양측 PoP·최초 binding, 동일 저장 JWS 복구, 시작120초/lease30초 분리 | API/순차 상태 로직 작성, 전체 기능 부분 구현 | 순차 fake 12개. UI·양측 transport/갱신 연결·timeout/watchdog·실제 동시성 미완성/미검증 |
| DB-001/002/003, STATE-003, OPS-005 | `0003_service_runtime.sql`, store: 기관/승인 공통 namespace·v1 trigger·v2 backfill·outbox·global quota·recovery gate, `service-current.ts`의 영속 checkpoint | 부분 구현 | 타입 검사. migration/GRANT/SQL 경합 미실행. worker·event cursor 소비기·retention·독립 anchor와 복구 해제·전체 backup 미구현 |
| PBX-001/002/003, CALL-006 | `asterisk.ts`, `pbx-routes.ts`, `pbxSip.ts`, `verifier/service.ts`: 실제 ARI 채널/Call-ID 조회·mute/bridge·JWS·consume 검사·별도 PBX verifier branch·SIP UAS 모듈 | 부분 구현: 제어/암호 경계 코드, UI·운영 미연결 | ARI fake2개·SIP parser/digest2개 통과, 타입 검사. v3 verifier 변조 시험·브라우저 호출/관측·ARI 사건·자동 회수·설정/이미지·통합 suite 미완성 |
| AI-001~004 | `service-audio.ts`, v3 WS proxy·기존 Deepgram/Anthropic 실제 adapter, 동의 generation/1stream·영속 예산 예약·현재 세션/lease 검사 | 부분 구현: v3 서버 경로 작성 | 타입 검사, 기존 revision fake 회귀. v3 UI·삭제/비용/공급자 전체 시험·한국어 독립 평가 미완성 |
| UI/OPS/GOVERNANCE | 기존 v2 화면/배포/관리 코드 보존 | 부분 구현 유지 | URI/lease/PBX 전환·권한 세분화·재인증·새 v3 전체 회수·최소 관리키 경계·배포 연결 남음 |

실제 최신 `pnpm light`: **18개 파일 82개 통과, 실패0**, 소스 위생·타입 통과. 초기 새 optional 필드 타입 오류는 수정했다. `punycode` deprecation 경고는 남음. 최종 stdout/stderr·기준 커밋·코드 hash는 [별도 현재 증거](../artifacts/master-implementation-20261027-service.json)에 저장했다. 이 단계는 이전66개에 신규16개를 더한 전체 회귀이며 모든 요구사항 coverage나 실환경 성공을 뜻하지 않는다. 새 v3 verifier/route/audio의 타입 통과를 단위 시험 완료로 표시하지 않았다.

코드에는 신규 v3 최대 통화4시간·lease30초 임시 정책이 있다.120초는 사용자 확정 시작 창이고,4시간은 확정 운영 정책이나 성능 측정값이 아니다. 정책·설정화·실환경 검증이 남는다. 현재 상태 freshness는 v3만 관측8초/각 시계1초 기준이며10초 상한은 시계 가정과 현재성 유지가 충족돼야 한다. 기존 v1/v2 12초/2초 회귀 정책은 보존한다.

실행하지 않음: DB/migration·Besu·Witness·OIDC·API/웹 스택·PBX·TURN·브라우저·마이크·외부 AI·모델·GCP·장애/부하. 새 의존성 설치·키 생성·기존 프로세스/데이터 변경·guard 해제·commit/push 없음. 실제 환경 시험이 필요한 것과 아직 코드도 미완성인 것을 위 표에서 구분했다.

멘토링 검토 폴더는 [docs/mentoring](mentoring/README.md)이다.6개 문서+구조도 SVG, Mermaid sequence/state/trust diagram을 작성하고 코드·원본 문서에 상대 링크했다. 사용자 제공 질문은 하나만 사용했다. 멘토링3차 원문은 확인하지 못해 의견을 추정하지 않았다. 문서 정리 단계에서는 코드 변경 없이 구현 현황을 요약했다. 최신 코드가 main에 push된 것으로 표현하지 않았으며 접근 권한은 현재 확인하지 않았다.

후속 개발의 남은 코드는 위 ID 표와 MASTER의 완료 조건을 따른다. 특히 outbox worker가 없어 v3 VC pending이 자동 원장 등록되는 제품 흐름은 아직 없다. PBX 새 모듈도 전체 사용 가능 경로가 아니다. 이 상태를 실행 허가만 남은 전체 완료라고 보고하지 않는다.

멘토링 문서 검토 완료: 독립 cold read가 고객 진입/기관·콜센터 부담 누락, PBX unmute와 브라우저 송신 gate 순서, SVG 요청/응답 방향, 소비 후 부재·실패 전이를 지적했다. 개요·sequence/state·그림을 수정했고 후속 재검토에서 남은 ‘시작 창 내 부재’ 문구도 ‘시작 창 종료까지 미수락’으로 바로잡았다.6개 검토 문서·구조도 SVG와 원본17개 문서의 상대 링크154개를 검사해 누락0, MASTER74개 ID/anchor 보존, Markdown fence·SVG XML·질문1개·로컬 내부 주소 미포함·git diff --check를 확인했다. Mermaid는 소스 검사만 했고 브라우저/GitHub 렌더는 미실행이다. 공식 W3C VC/JOSE와 Asterisk ARI/인증 원문은 읽기만 했다. fake 시험은 실제 PG/Besu/브라우저/provider의 독립 oracle을 대체하지 않는다. 검토 폴더는 요약이며 요구 기준·작업 기록은 MASTER와 이 파일이다. 원격은 origin의0u-Y/CallSign, 현재 main이므로 전달 예정 URL은 https://github.com/0u-Y/CallSign/tree/main/docs/mentoring 이다. 아직 push하지 않았고 현재 원격 공개 여부/접근성은 확인하지 않았다.


## 2026-10-27 커밋·전달 정리

사용자가 명시적으로 커밋·push를 요청했다. 기존 변경140개 파일을 백엔드/프로토콜, 웹, 실행 가드/배포, 시험/증거, 문서의5개 단위로 분리하고 한 줄 메시지를 사용한다. 코드·시험의 기준 커밋은 `ab0ec1cc55de26b9be832aa874d786beb9c8921c`다. 멘토링 README/현황과 MASTER의 현재 기준점을 이 커밋으로 갱신했으며, 과거 artifact·미커밋 조사/검증 이력은 덮어쓰지 않았다.

커밋 전 `pnpm light` 재실행: 소스 위생·타입 검사 통과,18개 파일82개 테스트 통과·실패0. 기존 punycode 경고는 남음. 추가 파일의 개인키/실제 API 비밀값 패턴과 대형 생성물을 검사해 후보0, 적용 Git hook은 없고 sample만 있음을 확인했다. origin/main을 읽어 시작 커밋과 동일함을 확인했다. 일반 push/PR workflow는 light만 수행하고, 인프라 integration은 수동 실행으로 분리돼 있다. guard 해제·인프라·실통화·provider·GCP 실행은 하지 않았다. 이 커밋/전달은 남은 코드나 실환경 검증을 완료 처리하는 작업이 아니다.

전달 대상은 `origin main`, 멘토링 URL은 https://github.com/0u-Y/CallSign/tree/main/docs/mentoring 이다. 원격 반영은 push 결과와 로컬/원격 HEAD 일치로 확인한다. 저장소 공개 범위 변경·메일 발송·배포는 수행하지 않는다.
