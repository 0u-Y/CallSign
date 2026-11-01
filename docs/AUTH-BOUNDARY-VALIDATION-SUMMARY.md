# CallSign 인증·API·브라우저 후속 검증 결과

> 기록 범위: 이 문서는 제목 아래 날짜의 작업을 정리한 과거 기록이며, 구현 커밋과 별도의 문서 보존 커밋으로 관리한다. 시험 수·미실행 항목·미커밋 표시는 당시 기준이다. 최신 상태는 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)을 따른다.

작성일: 2026-10-30(KST)

이번 작업은 기존 로그인 성공 경로에 더해 공동 관리, 권한 회수, 세션 만료, 다중 탭, 응답 유실과 분석 동의 철회 경계를 검증하고 발견한 결함을 수정한 작업이다. 관련 코드·시험·증거는 GitHub `main`에 게시했다. **실제 체인·PBX 통화·외부 AI까지 검증한 전체 서비스 완료 보고서는 아니다.**

## 1. 코드와 검증 기준

| 구분 | 기준 |
|---|---|
| 작업 시작 HEAD | `a75398d03faaf1a36735edb6fced60700afea752` |
| 통합 시험 당시 상태 | 시작 HEAD 이후의 미커밋 소스. 원본 증거의 파일별 hash로 식별 |
| 구현·시험 보존 커밋 | `bcdbd6b49dcd656d89a69e4b55db4f88834fb98f` |
| 최종 게시 branch | `main` |
| 최종 게시 SHA | `c59edac6475bd49f450a2836e6fd7e67df80b2c0` |
| 원격 확인 | 게시 시점 로컬 HEAD와 `origin/main` SHA 일치 |
| 최종 CI | [light 성공](https://github.com/0u-Y/CallSign/actions/runs/40935474501) |

시험 당시 소스 hash가 구현 보존 커밋의 해당 파일과 일치함을 대조했다. 이후 실행 준비 도구의 단위 시험 구성만 변경했으며, 통합 시험을 최종 커밋에서 다시 실행한 것으로 기록하지 않았다. 이 요약 문서는 위 게시 이후 별도 요청으로 작성한 파일이며 최초 작성 당시에는 커밋·push하지 않은 상태였다.

## 2. 발견하고 수정한 제품 결함

| 문제 | 수정 내용과 사용자에게 달라진 동작 | 주요 코드 |
|---|---|---|
| 공식 경로의 표시 정보만 바꾸면 현재 Witness 확인을 건너뛰고 활성화할 수 있었음 | 정책 버전이 같아도 확인된 이벤트 이후의 최신 서명 증거·세대·정책·등록 키·경로를 검사한다. 제출·처리 중·확정·활성화·실패를 구분한다. | [관리 API](../services/api/src/service-management.ts), [검증 연결](../services/api/src/finals-server.ts), [공동 변경 화면](../apps/web/src/components/ConfigurationReviewPanel.tsx) |
| 다른 탭에서 계정을 바꾼 뒤 이전 계정의 늦은 응답이나 입력 초안이 남을 수 있었음 | 기존 탭 통지 채널과 요청 세대를 이용해 이전 목록·초안·연결·분석 상태를 비운다. 이전 작업이 새 요청 잠금을 해제하거나 이전 결과를 반영하지 못한다. | [서비스 화면](../apps/web/src/pages/Service.tsx), [관리 화면](../apps/web/src/components/ServiceAdministration.tsx) |
| 공식 업무 화면의 초기 효과 재실행에서 로딩 잠금이 남아 업무 목록을 읽지 못했음 | 효과 정리와 요청 세대를 맞추고, 세션 만료 때 목록과 CSRF 토큰을 제거한다. 재로그인 안내와 로그아웃 후 버튼 상태도 복구한다. | [공식 업무 화면](../apps/web/src/pages/Service.tsx) |
| 권한 없는 기관 담당자에게 업무 생성·취소·위임 발급 버튼이 활성화됐음 | 역할 이름뿐 아니라 실제 permission을 확인해 버튼을 비활성화하고 이유를 표시한다. 서버의 권한 거절은 그대로 유지한다. | [서비스 화면](../apps/web/src/pages/Service.tsx) |
| 동의 철회와 주기적 감시 사이에 추가 오디오 프레임이나 늦은 분석 결과가 처리될 여지가 있었음 | 프레임 수락·전사·위험 결과 송신 때 현재 세션·동의·revision을 재검사한다. 분석 중단을 먼저 수행하고 취소 신호를 전달한다. | [분석 WebSocket](../services/api/src/service-audio.ts) |

관련 요구사항은 AUTH-001/002, BUSINESS-001, CONTRACT-002, GOVERNANCE-002, CALL-002/005, AI-001/002, UI-001~005, TEST-001/004, OPS-001이다. 영역 전체 완료를 의미하지 않으며 세부 범위는 [MASTER](MASTER-DEVELOPMENT-SPEC.md)와 [진행 기록](FINALS-IMPLEMENTATION-PLAN.md#authenticated-boundaries-20261030)을 따른다.

## 3. 실제로 확인한 사용자 흐름과 실패 경계

### 공동 관리

- 현재 설정과 변경 내용, 기관·체인·계약·작업·nonce·만료·digest를 확인하고 제안 파일을 내보냈다.
- 서로 다른 승인자의 독립 브라우저 context에서 별도로 생성한 시험 서명 파일을 가져와 정족수를 충족했다. 브라우저에는 장기 개인키를 전달하지 않았다.
- 중복·미등록·변조·다른 기관/작업/제안·만료 서명과 오래된 경쟁 제안을 거절했다.
- 중복 제출이 같은 결과로 복구되고 원장 작업이 중복 생성되지 않는지 SQL로 확인했다.
- 제출만으로 활성화되지 않고, 잘못된 이벤트·계약 상태·Witness 서명·freshness·경로는 거절되는지 확인했다.
- 표시 정보 변경은 기존 합성 통화 lease를 유지하고, 권한 정책 변경은 확정 이벤트에서 이전 시도를 취소하는지 확인했다.

### 계정·세션·다중 탭

- 한 탭의 일반 로그아웃 후 다른 탭의 보호 API 접근이 거절되고 화면이 정리되는지 확인했다.
- 일반 세션과 공식 업무 세션의 쿠키·CSRF·로그아웃 문맥을 분리해 확인했다.
- 다른 계정 로그인 이후 이전 계정의 보류 응답을 전달해도 목록·입력 초안이 복구되지 않는지 확인했다.
- 계정 비활성화, membership generation 변경, 세션 만료 후 기존 세션 거절과 재로그인 안내를 확인했다.
- 권한 없는 화면의 버튼 비활성화와 직접 HTTP 요청의 거절을 별도로 확인했다.

서버의 권한 거절과 화면 정리는 같은 시점이라는 보장이 아니다. 다른 탭은 계정 변경 통지 또는 다음 보호 요청·5초 갱신에서 상태를 인지한다.

### 응답 유실·통화 상태·분석

- 업무 저장 후 실제 응답을 버리고 같은 요청 키·본문으로 재시도해 저장된 업무가 하나인지 확인했다. 처리 중 중복 동작과 취소 후 상태도 검사했다.
- 최초 연결 시작 창 120초, 진행 통화 lease 만료, 종료된 시도의 재등록 거절을 구분했다.
- 동의 전에는 분석 제공자 연결이 시작되지 않고, 철회 후 다음 합성 프레임은 전송되지 않는지 확인했다.
- 제공자 중단·AbortSignal·늦은 LLM 응답 폐기·전사 수정/역순 revision·분석 장애 표시를 확인했다. 분석 불가를 안전 판정으로 바꾸지 않았다.

## 4. 실제 실행한 검사와 결과

| 검사 | 최종 확인 결과 | 근거 |
|---|---|---|
| HTTP API·PostgreSQL·HTTPS OIDC fixture·Chromium | 2개 파일·17개 PASS, 실패/skip 0 | [시험 원본](../artifacts/service-boundaries-20261030/http-results.json) |
| 기존 PostgreSQL 경계 회귀 | 4개 파일·15개 PASS, 실패/skip 0 | [DB 원본](../artifacts/service-boundaries-20261030/database-results.json) |
| 통합 작업 시점 light | 44개 파일·198개 PASS | [소스 검사](../artifacts/service-boundary-source-final-20261030.json) |
| CI 보완 후 최신 light | 44개 파일·205개 PASS | [후속 소스 검사](../artifacts/service-boundary-ci-source-20261030.json) |
| 웹 빌드·API runtime 타입 검사 | PASS | [소스 검사](../artifacts/service-boundary-source-final-20261030.json) |
| 문서 링크·diff·대기 스크립트 구문 | 추가 링크 존재·diff 검사·`bash -n` 통과 | 진행 기록 |
| GitHub Actions | 최종 게시 커밋의 light 성공 | [CI 실행](https://github.com/0u-Y/CallSign/actions/runs/40935474501) |

198개에서 205개로 늘어난 것은 기존 8개 CLI 검사를 한 시험에서 독립 시험으로 나눴기 때문이다. 새로운 제품 보장이 7개 추가됐다는 뜻이 아니다. 과거 실행·중간 재실행의 시험 수는 합산하지 않았다.

실제 실행 명령은 다음과 같다. 아래는 실행 이력이며, **현재 다시 기동하도록 허용하는 명령이 아니다.** 보호 파일과 격리 대상 준비는 [인증 후속 검증 절차](RUNBOOK.md#인증-후속-경계-검증)를 따른다.

```bash
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec vitest run --config vitest.http.config.ts --reporter=verbose --reporter=json --outputFile=PROTECTED_TEST_ROOT/http-network-rechecked.json

CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec vitest run --config vitest.integration.config.ts tests/integration/service-runtime.test.ts tests/integration/finals-session-scopes.test.ts tests/integration/finals-store.test.ts tests/integration/database-readiness.test.ts --reporter=verbose --reporter=json --outputFile=PROTECTED_TEST_ROOT/database-scoped.json

pnpm evidence:collect artifacts/service-boundary-source-final-20261030.json light web runtime
pnpm evidence:collect artifacts/service-boundary-ci-source-20261030.json light
```

통합 명령은 자격정보를 출력하지 않는 임시 launcher에서 각 120초 제한으로 실행했다. `PROTECTED_TEST_ROOT`는 당시 보호 디렉터리 표기이며 현재는 정리된 자원이다. 원본 증거 경로를 그대로 재사용해 덮어쓰면 안 된다.

## 5. 실제 구성요소와 대체 경계

| 실제 구현을 실행한 부분 | 명시적으로 대체한 부분 |
|---|---|
| 인증 middleware, 세션, CSRF, Platform·Issuer Gateway·Sender Agent, 최소권한 SQL, PostgreSQL, HTTPS 웹, Chromium | 합성 계정의 로컬 HTTPS OIDC 제공자 |
| 원장 이벤트 소비와 DB 반영 로직 | RPC·계약 조회 응답·원장 로그 fixture |
| Witness 집계·실제 Ed25519/JWS 서명 검증·freshness 검사 | 4개 시험키와 fixture 전송 경로. 실제 Witness 서비스는 기동하지 않음 |
| 승인·소유 증명·소비·lease 로직과 서명 | 합성 통화 binding, 메모리 CAS anchor |
| WebSocket·동의·quota·전사 revision·분석 orchestration | 합성 프레임과 지연·실패 STT/LLM 제공자. 외부 제공자 호출 없음 |

브라우저의 업무 API 본문을 성공 mock으로 교체하지 않았다. 늦은 응답과 유실은 실제 응답을 보류하거나 버리는 방식으로 만들었다. 화면은 데스크톱·390px 모바일 폭에서 렌더링하고 키보드 focus·overflow·콘솔·네트워크 실패를 확인했다. [데스크톱 화면](../artifacts/service-boundaries-20261030/joint-desktop.png)과 [모바일 화면](../artifacts/service-boundaries-20261030/joint-mobile.png)은 합성 데이터다.

## 6. 실패 이력과 남은 불확실성

- **제품 결함:** 공식 업무의 초기 로딩 잠금, 표시 변경의 Witness 검증 우회, 이전 계정 응답/초안 처리, 버튼 권한 표시, 동의 철회 경계를 수정했다.
- **시험 결함:** 관리 상태·파일 검토 완료 전 진행, 숨겨진 option의 표시 대기, UI 갱신보다 짧은 polling, 합성 이벤트의 동일 transaction hash, 유효하지 않은 빈 본문으로 인한 선행400 응답을 수정했다. assertion을 제거하거나 보안 검사를 완화하지 않았다.
- **DB 환경:** PostgreSQL 이미지 초기화용 Unix socket을 준비 완료로 오인한 connection reset이 있었다. 실제 loopback TCP 준비를 확인하도록 대기 코드를 고쳤다.
- **범위 선택 오류:** 전체 integration glob을 실행해 별도 시연·독립 anchor 환경이 필요한 5개 시험이 실패했다. 실패 원본을 보존했고, 지정된 네 파일·15개 DB 시험만 해당 회귀 PASS로 집계했다.
- **브라우저 환경:** 빈 화면·로그인 버튼 timeout과 `ERR_NETWORK_CHANGED`를 관측했다. 실패 진단을 남겼으며 최종 제한된 재실행은 통과했다. 과거 heading timeout이나 호스트 네트워크 변경의 원인을 확정하거나 완전히 해결했다고 주장하지 않는다.
- **첫 push의 CI 실패:** 8개 CLI를 한 단위 시험에서 실행해 기본5초를 초과했다. 동일 명령·assertion·worker·timeout을 유지한 채 독립 시험으로 분리했고, 후속 CI는 성공했다.

[실패 로그 묶음](../artifacts/service-boundaries-20261030/development-commands.json)과 [CI 실패 원본](../artifacts/service-boundaries-20261030/ci-preparation-failure.json)을 보존했다. 제한 시간 확대·무제한 retry·fixture 자동 fallback으로 통과시키지 않았다.

## 7. 자원 사용과 정리

- 서버 CPU24개, 시작 available memory 39,503MiB, 디스크 여유533GiB를 관측했다. 관측 구간 swap 입출력은0이었다.
- 시험 DB는512MiB·CPU1·tmpfs256MiB, 시험 worker1·각 명령120초로 제한했다. DB 메모리 관측값은 약98.01MiB였다.
- Node/브라우저2GiB는 중단 판단용 예산이며 강제 cgroup 메모리 제한을 적용했다고 주장하지 않는다. 가용 메모리8GiB 미만·지속 swap·기존 작업 영향이 중단 기준이었다.
- 시험 identity `callsign_test_ecd6632fa7`의 label을 대조하고 해당 컨테이너·tmpfs·임시 키·인증서·자격파일·서버·브라우저를 정리했다.
- 기존 서비스·DB·키·volume은 변경하지 않았다. 기존 미추적 진행 포인터28개와 사용자 요약2개는 보존하고 커밋에서 제외했다.

## 8. 커밋과 게시 결과

| 커밋 | 한 줄 메시지 | 내용 |
|---|---|---|
| `bcdbd6b` | Enforce configuration confirmation and isolate asynchronous session work | 제품 수정·통합 회귀·fixture 격리·TCP 준비 확인 |
| `7b8e2a0` | Record scoped authentication boundary verification and resource cleanup | 문서·시험 결과·화면·정리 증거 |
| `343feb2` | Preserve bounded diagnostic logs with verification evidence | ignore 대상 로그를 공유 가능한 JSON 증거에 보존 |
| `c59edac` | Isolate preparation CLI checks within their individual test budgets | CI 시간 초과의 시험 구성 수정·후속 light·실패 기록 |

일반 push만 사용했고 공개 이력을 재작성하지 않았다. 최종 게시 저장소는 [0u-Y/CallSign](https://github.com/0u-Y/CallSign), branch는 `main`이다. 원격 SHA와 로컬 최종 SHA 일치를 확인했다. 이 요약 파일은 추가 문서 요청으로 작성했으며 최초 작성 당시에는 미커밋 파일이었다.

## 9. 아직 검증하지 않은 영역과 다음 단계

실제 Besu/QBFT 합의·원장 전파·Witness 서비스, PBX/TURN·DTLS/RTP·실제 오디오 중단, 운영 IdP/MFA/TLS, 외부 STT/LLM 품질·취소·보관·과금, 독립 영속 anchor·백업/복원·장애·성능·GCP는 미검증이다. 계약·typed-data를 변경하지 않아 기존 EVM 시험은 반복하지 않았다.

다음 실제 인프라 검증에는 해당 범위의 별도 실행 허가와 배포 identity·계약 metadata·공개 trust, DNS/TLS·OIDC 등록값, 역할별 보호 파일, PBX/TURN 설정이 필요하다. 비밀값 원문을 문서나 채팅에 넣지 않는다. 현재 결과만으로 실제 통화 성공·AI 정확도·분산 내성·성능 목표·복구 성공을 발표할 수 없다.

상세 기준은 [MASTER](MASTER-DEVELOPMENT-SPEC.md), 실제 변경 이력은 [진행 기록](FINALS-IMPLEMENTATION-PLAN.md#authenticated-boundaries-20261030), 실행 순서는 [RUNBOOK](RUNBOOK.md), 미검증 경계는 [알려진 한계](KNOWN-LIMITATIONS.md)에 연결한다. 이 문서는 피드백 전달을 위한 결과 요약이며 별도의 개발 기준을 만들지 않는다.
