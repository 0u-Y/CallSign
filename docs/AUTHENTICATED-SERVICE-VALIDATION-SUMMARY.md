# CallSign 인증·API·웹 통합 검증 작업 결과

> 기록 범위: 이 문서는 제목 아래 날짜의 작업을 정리한 과거 기록이며, 구현 커밋과 별도의 문서 보존 커밋으로 관리한다. 시험 수·미실행 항목·미커밋 표시는 당시 기준이다. 최신 상태는 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)을 따른다.

- 기준일: **2026-10-30(KST)**
- 시작 커밋: `763850104c7bfde986eb63e8517f99677b5f1a07`
- 최종 게시 커밋: `a75398d03faaf1a36735edb6fced60700afea752`
- 저장소·브랜치: [0u-Y/CallSign · main](https://github.com/0u-Y/CallSign/tree/main)

이 문서는 실제 인증·HTTP API·PostgreSQL·웹 화면을 연결해 시험하고, 발견한 문제를 수정한 작업을 정리한다. **선택된 로컬 통합 경로의 검증 결과이며 전체 서비스 배포나 실제 통화 성공을 뜻하지 않는다.**

## 1. 이번에 수행한 작업

- 기존 인증·권한 검사·서비스 로직·SQL 저장소를 그대로 사용하는 통합 시험을 추가하고 실제 실행했다.
- 로컬 HTTPS 로그인 제공자 fixture에서 authorization code·PKCE·JWT 서명·JWKS 경계를 제공했다.
- Platform, Issuer Gateway, Sender Agent를 loopback에서 실행해 실제 서비스 간 HTTP 요청을 검사했다.
- 설치된 Chromium으로 실제 `/service` 화면을 열고 로그인·업무 생성·취소·로그아웃·역할별 화면을 확인했다.
- 기존 PostgreSQL 경계 시험을 같은 작업의 격리 환경에서 다시 실행했다.
- 시험 결과·실패 이력·스크린샷을 보존하고 시험 자원을 정리했다.
- 변경을 4개 커밋으로 보존해 일반 push하고 최종 GitHub Actions 성공을 확인했다.

## 2. 수정한 제품 결함

| 문제 | 수정 | 확인 방법 |
|---|---|---|
| 잘못된 인증 상태·토큰이 서비스 장애와 혼동되는 응답을 반환 | 잘못된 state/code/JWT는401, 제공자429/5xx는 의존성 장애로 구분 | 실제 HTTPS OIDC·HTTP 시험과 제공자 오류 단위 시험 |
| 내부 계정은200자까지 등록되지만 업무 생성에서는 수신자·상담원 ID를100자로 제한 | 업무 생성의 계정 ID 한도를 등록 계약과 같은200자로 통일 | 100자를 넘는 합성 계정으로 브라우저 업무 생성 |
| 선택 항목의 접근 가능한 이름에 option 텍스트가 섞임 | 콜센터·위임·통화 시도 선택에 명확한 접근 이름 부여 | 실제 Chromium label 선택·focus/Tab 검사 |

시험 환경에서는 Vite proxy 대상 갱신, 공식 로그인 후 업무용 CSRF 선택, 업무 생성 완료를 기다리는 방식도 수정했다. 제품 결함과 시험 코드 결함을 구분해 기록했다.

## 3. 실제 실행한 구성과 대체 경계

| 구성요소 | 이번 실행 |
|---|---|
| PostgreSQL | 별도 시험 컨테이너에서 실제 실행. migration0000~0005와 역할별 LOGIN 적용 |
| 인증·세션·CSRF·권한 middleware | 실제 구현 사용. 정상 로그인에 세션 row 직접 주입 없음 |
| Platform·Issuer Gateway·Sender Agent | 실제 서버와 HTTP 라우팅 실행 |
| 기관·콜센터 서명 | 합성 시험키로 실제 서명·검증. 장기 개인키를 브라우저에 전달하지 않음 |
| OIDC 제공자 | 로컬 HTTPS fixture. 실제 code/token/JWKS 교환과 RS256 서명 사용 |
| 웹 | 실제 React/Vite 화면과 설치된 Chromium. API 응답 mock 없음 |
| 원장 현재 권한 | digest별 미확정·정상·철회·확인 불가를 제공하는 명시적 adapter fixture |
| 독립 anchor | 메모리 CAS fixture. 실제 독립 장애·백업 영역의 서비스가 아님 |
| 통화 binding | 합성 fingerprint와 세션 자료. 실제 WebRTC/PBX 관측 증거가 아님 |

기본 실행에서 fixture를 자동 선택하거나 실패 시 fake 성공으로 전환하는 경로는 추가하지 않았다. adapter 주입은 integration 허가, 시험 배포 ID, loopback origin, 같은 `callsign_test_*` DB의 서로 다른 issuer/auth LOGIN을 요구한다.

## 4. 확인한 인증·API 흐름

### 로그인과 권한

- 실제 로그인 시작·callback·code 교환·PKCE·nonce·JWT 서명을 거쳐 세션 발급.
- 정확한 issuer와 subject로 내부 계정 연결. 같은 이름·이메일만으로 계정 연결하지 않음.
- issuer·audience·client·nonce·서명·만료 불일치와 callback 재사용 거절.
- 미등록·비활성·다른 기관의 subject 거절.
- 일반 업무와 공식 업무의 세션·클라이언트·audience 분리.
- 실제 `auth_time` 기반 최근 재인증, Origin·CSRF 검사.
- 로그아웃·계정 비활성화·membership generation 변경 뒤 구 세션 거절.
- 일반 관리자의 공동 승인자 생성·자기 권한 상승·다른 issuer 계정 등록 거절.

### 업무·승인·소비

- 허용된 담당자의 업무 생성·조회·취소와 할당·수신자 경계 검사.
- strict schema, 동일 요청의 멱등 처리, 다른 payload로 같은 요청 ID 재사용 거절.
- 미확정 위임을 정상 권한으로 취급하지 않고 조회 불가·철회 상태 거절.
- Platform → Sender Agent → Issuer의 실제 HTTP 교환으로 콜센터 소유 증명 발급.
- 다른 수신자의 소유 증명 요청은403, Platform을 통한 비공개 sender context 접근은404.
- 실제 서명 개별 승인, 수신자 nonce·공개키, 양측 소유 증명과 binding 검사.
- 동시 HTTP 소비 요청에서 동일한 저장 영수증 반환과 다른 binding 재사용 거절.
- 새 HTTP 요청에서 저장된 영수증 재조회, 실제 DB 소비 row·outbox 확인.
- 양측 갱신 서명에 따른 lease 발급과 영수증·lease의 서명 검증.
- 업무 취소 후 늦은 요청으로 시도가 다시 활성화되지 않음.
- 정책/trust 불일치와 복구 gate 차단 시 신규 업무 거절·부분 저장 방지.

## 5. 실제 브라우저에서 확인한 사용자 동작

기관 계정으로 로그인한 뒤 수신자·상담원·콜센터를 선택해 업무를 만들고 취소했다. 실제 API 응답과 DB 저장 결과를 함께 확인했다. 로그아웃 후 수신자 계정으로 다시 로그인해 기관 전용 메뉴가 표시되지 않는지도 확인했다.

HTTPS에서 Secure·HttpOnly·SameSite cookie,390px 모바일 화면의 가로 overflow, 키보드 Tab/focus, uncaught exception과 console 오류를 검사했다. 인증 전·로그아웃 단계의 정확한 `/auth/me`401만 예상 응답으로 분류했으며 다른 오류는 실패로 유지했다.

- [데스크톱 화면](../artifacts/http-validation-20261030/service-desktop.png)
- [모바일 화면](../artifacts/http-validation-20261030/service-mobile.png)

캡처는 앞선 동일 UI 검증 실행의 합성 계정 화면이다. 실제 고객 데이터·cookie·토큰·브라우저 storage·음성은 포함하지 않았다. 브라우저에는 마이크·카메라 권한을 부여하지 않았다.

## 6. 실행 명령과 결과

| 검사 | 실제 결과 |
|---|---|
| `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec vitest run --config vitest.http.config.ts` | 최신 Sender Agent 포함1파일7시험 PASS·실패/skip0 |
| `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec vitest run --config vitest.integration.config.ts tests/integration/finals-store.test.ts tests/integration/finals-session-scopes.test.ts tests/integration/service-runtime.test.ts tests/integration/database-readiness.test.ts` | 4파일15시험 PASS·실패/skip0 |
| `pnpm light` | 44파일197시험 PASS |
| `pnpm --filter @callsign/web build` | PASS |
| `pnpm exec tsc -p services/api/tsconfig.runtime.json --noEmit` | PASS |
| `pnpm exec tsc -p tsconfig.light.json --noEmit` | PASS |
| 실행 허가 환경변수 없이 `pnpm test:http` | exit78로 기동 전 차단 확인 |
| 문서 상대 링크·JSON·증거 hash·staged diff 검사 | PASS |

실행에는 보호된 시험 DB URL·TLS CA·시험 디렉터리가 필요하다. 위 명령만으로 운영 환경에 실행하지 않는다. 구체적인 준비와 범위는 [RUNBOOK](RUNBOOK.md#authenticated-http-tests)을 따른다.

HTTP 시험을 보완하며 여러 번 실행했지만 **최신 결과는7개**다. 앞선7개와 더하지 않는다. DB15개도 과거 결과를 복사한 것이 아니라 이번 작업에서 다시 실행한 결과다. 기존 계약21시험은 이번에 재실행하지 않았다.

## 7. 시험 환경·실패 기록·자원 정리

초기 관측은 CPU24개, load0.34, 가용 메모리39553MiB, 디스크 여유533GiB였다. swap 사용량은7604MiB였지만 관측 구간의 swap 입출력은0이었다. 이전 보고서의 자원 수치를 사용하지 않았다.

DB에는512MiB·CPU1개·tmpfs256MiB 제한을 적용하고, Node/브라우저 예산2GiB·worker1·단계 제한120초로 진행했다. 첫 DB 관측 메모리는 약95.68MiB, Sender Agent 추가 검증의 새 DB는 약68.93MiB였다.

개발 중 브라우저 heading timeout1회는 독립 원인을 확정하지 못했고 이후 순차 실행에서는 재현되지 않았다. console의 예상401 분류 실패와 새 PostgreSQL 준비 완료 전 migration을 시도한 환경 실패도 따로 보존했다. 후자는 `pg_isready` 확인 후 migration/GRANT를 적용해 진행했다. 실패를 PASS로 바꾸거나 보안 검사를 완화하지 않았다.

두 시험 DB 모두 컨테이너 이름·label·tmpfs를 확인한 뒤 이번 컨테이너만 제거했다. API·Sender·웹·OIDC·브라우저는 종료했고 보호 환경파일·시험 개인키·임시 프로필을 제거했다. 기존 서비스·DB·volume·키는 변경하지 않았다.

## 8. 주요 변경 파일

| 파일 | 변경 목적 |
|---|---|
| [finals-server.ts](../services/api/src/finals-server.ts) | 인증 오류 구분과 엄격히 제한된 외부 adapter 주입 |
| [oidc-flow.ts](../services/api/src/oidc-flow.ts) | code 거절과 제공자 장애 구분 |
| [finals-model.ts](../services/api/src/finals-model.ts) | 계정 ID 길이 계약 통일 |
| [Service.tsx](../apps/web/src/pages/Service.tsx) | 선택 항목 접근 이름 수정 |
| [service-http.test.ts](../tests/integration/service-http.test.ts) | 실제 OIDC·역할별 서버·DB·브라우저 통합 시험 |
| [http-adapter-scope.test.ts](../tests/unit/http-adapter-scope.test.ts) | 시험 adapter가 일반 실행에 사용되지 않도록 guard 검사 |
| [oidc.test.ts](../tests/unit/oidc.test.ts) | 제공자 오류 분류 회귀 |
| [vitest.http.config.ts](../vitest.http.config.ts) | 별도 명시적 HTTP/브라우저 시험 경로 |

`package.json`·타입 검사 구성·기존 integration 구성도 함께 맞췄다. MASTER·진행표·아키텍처·RUNBOOK·알려진 한계·서비스 가이드는 실제 검증 범위와 대체 경계를 반영했다.

## 9. 커밋·push·CI

| 커밋 | 한 줄 메시지 |
|---|---|
| `75d8573` | Verify authenticated service flows through PostgreSQL and Chromium |
| `5c2842d` | Inspect browser diagnostics and isolate HTTP fixture artifacts |
| `2188336` | Record authenticated HTTP evidence and disposable test procedures |
| `a75398d` | Exercise Sender Agent proofs through authenticated service routing |

모두 `origin/main`에 일반 push했다. 공개 이력을 재작성하거나 force push하지 않았다. 최종 원격 SHA와 로컬 SHA가 일치했고 [최종 light CI](https://github.com/0u-Y/CallSign/actions/runs/40926709437)는 completed/success였다. CI의 light 성공과 로컬에서 실행한 HTTP·브라우저 시험은 별도 결과다.

원본 시험은 커밋 사이 worktree에서 실행됐다. 첫 평가의 실행 HEAD는 `75d8573`, Sender Agent 후속의 실행 HEAD는 `2188336`이며 당시 미커밋 소스를 포함한다. 최종 게시 SHA에서 시험을 실행한 것처럼 원본 기록을 바꾸지 않았다. 각 증거의 파일 hash로 시험 소스를 식별한다.

이 작업 종료 시 tracked 수정은 없었고 기존 미추적 파일29개를 보존했다. 이 요약 문서는 이후 별도 요청으로 작성한 파일이므로 **최초 작성 당시에는 커밋·push하지 않은 상태였다.**

## 10. 아직 검증하지 않은 영역과 다음 입력

실제 외부 IdP/MFA·운영 TLS, Besu/QBFT·Witness·체인 배포와 철회 전파, PBX/TURN·양방향 음성, 외부 STT/LLM·한국어 품질, 독립 anchor·실제 백업/복원·부하·GCP는 미검증이다. 이번에는 허용 범위 밖이거나 실제 외부 환경이 없어 실행하지 않았다.

공동 관리 전체 화면·다른 브라우저와 보조기술·다중 탭/장시간 통화도 이번 선택 경로로 완료 판정하지 않는다. 합성 binding과 서명 lease 성공을 실제 연결·음성 회수 성공으로 확대하지 않는다.500ms·5초·10초 등의 설계 목표를 달성한 성능이나 SLA로 보고하지 않는다.

다음 실제 인프라 검증에는 최소한 다음 설정이 필요하다.

1. 배포 도메인·HTTPS 인증서와 실제 OIDC issuer, 업무/공식 client·audience·callback 설정.
2. 기관·콜센터 식별값, 역할별 키 참조, 내부 계정과 승인 주체의 등록 정보.
3. 실제 chain/registry metadata와 공개 trust·웹 pin·Witness 설정.
4. Asterisk/WSS·인증서·TURN·DB 접근 설정과 독립 anchor의 배치 정보.

비밀값 원문을 채팅으로 전달할 필요는 없다. 역할별 보호 파일·환경 참조로 준비한다. 실제 실행은 해당 범위의 별도 허가 후 진행한다.

## 11. 원본 증거와 상세 기록

- [최신 Sender Agent 포함 평가·소스 hash·정리 기록](../artifacts/http-sender-validation-20261030.json)
- [최신 HTTP·브라우저7시험 원본](../artifacts/http-sender-validation-20261030/http-results.json)
- [DB15시험·초기 HTTP 평가·실패 이력·자원 기록](../artifacts/http-validation-20261030.json)
- [PostgreSQL15시험 원본](../artifacts/http-validation-20261030/database-results.json)
- [light·웹 build·runtime 타입 검사 원본](../artifacts/http-source-validation-20261030.json)
- [개발 진행표](FINALS-IMPLEMENTATION-PLAN.md#authenticated-http-validation-20261030)
- [실행 절차](RUNBOOK.md#authenticated-http-tests)
- [전체 요구사항과 완료 조건](MASTER-DEVELOPMENT-SPEC.md)
- [알려진 한계](KNOWN-LIMITATIONS.md)

이 문서는 위 기록의 전달용 요약이다. 새로운 완료 기준이나 별도 설계 명세를 추가하지 않는다.
