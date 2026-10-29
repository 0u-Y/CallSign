# CallSign 실행 준비·검증 체계 작업 정리

작성 기준: **2026-10-29(KST)**. 이번 실행 준비 작업을 피드백받기 위한 문서다. 제품 전체를 새로 구현한 결과나 실환경 시험 보고서는 아니다.

## 1. 작업 기준과 현재 상태

- 확인한 HEAD: `a9d67f0b4b50a022b0e20de1e4071ec49cdcbd8a`.
- 이전 개발 결과와 이번 수정은 **미커밋 worktree**에 있다. HEAD만으로 재현할 수 없다. 이번 작업에서 commit·push·배포하지 않았다.
- 기존 업무·위임·개별 승인·검증 모듈·통화 유지 허가·PBX·AI·worker 코드를 재사용했다.
- 기존 작업 요약과 시험 증거를 보존했다. 이 문서는 사용자의 별도 요청에 따라 만든 전달용 요약이며 요구사항이나 운영 절차의 새 기준이 아니다.
- 실제 금융기관·통신사와 연동한 서비스가 아니다. 대표 업무는 모의 금융기관의 이상거래 확인 연락이다.

현재 도달한 상태는 **실행 준비 도구와 선택된 자동 검사의 연결, 남은 설정·수동 관측의 명시**다. DB 원자성·실제 통화·합의 내성·AI 품질·복구 성공을 검증한 상태는 아니다.

## 2. 이번에 바꾼 기능

### 설정 준비와 최초 설치

설정 검사 도구(preflight)에 누락 이유뿐 아니라 필요한 입력 형식, 준비 주체, 선행 조건, 다음 절차를 연결했다. 최초 준비 검사와 전체 서비스 설정 검사를 분리했다. 최초 준비에서 보류한 생성값·제공자 설정은 전체 검사에서 다시 요구한다.

키·공개 신뢰 설정·PBX·네트워크·DB 구조 적용·최초 계정 준비 도구는 기본적으로 검사/dry-run만 한다. 실제 파일 생성·DB 적용에는 `--apply`와 기존 실행 guard가 모두 필요하다. 공동 승인 서명 도구도 기본은 공개 요청 검토이며 실제 서명에는 `--sign`과 별도 실행 허가가 필요하다.

기존 대상의 임의 재생성을 막고 부분 생성 목록을 남기도록 보완했다. DB 적용 이력에는 SQL 파일 hash를 연결해 이전 적용 내용이 다르거나 확인되지 않으면 운영자의 검토를 요구한다. 역할별 DB LOGIN provisioning SQL도 작성했다. 실제 키 생성·SQL 적용은 하지 않았다.

최초 준비 순서는 다음과 같이 정리했다.

> 배포 공개 설정 → 앱 이미지·역할별 키·최초 계정 파일 → DB 구조·최소권한 LOGIN·내부 계정 → 체인·계약 metadata와 PBX 설정 → 공개 trust → 그 hash를 고정한 웹 이미지 → 독립 anchor·서비스 → 공동 기관 등록·위임 확정

공개 trust는 기관 등록 완료를 기다리지 않도록 하고, 최초 내부 계정 등록만으로 복구 gate가 열리지 않도록 수정했다. 실제 독립 anchor와 최초 checkpoint를 확인해야 신규 발급·연결이 가능하다. 새 배포와 기존 배포 복원은 서로 다른 절차다.

### 단계별 검증 runner

작은 고정 명령 runner를 추가했다. 임의 shell 명령이나 새 workflow 언어를 받지 않는다. 기본 동작은 dry-run이고, 정확한 단계·환경 JSON·새 증거 파일을 지정해야 한다.

| 단계 | 자동으로 연결한 검사 | 수동 관측 또는 남은 경계 |
|---|---|---|
| offline | 소스 위생·타입·순수 단위·웹 build·설정·규칙 회귀 | 실제 서비스 성공을 판정하지 않음 |
| database | 독립 PostgreSQL 연결의 소비·경합·응답 유실·quota·worker·migration hash·GRANT | 시험 DB와 최소권한 계정을 먼저 준비해야 함 |
| chain | 제한된 오프라인 Foundry 계약 시험 경로 | 실제 Besu/Witness·정책/키 회수 관측은 MANUAL |
| media | 두 웹의 실제 PBX 통화 시험 경로 | TURN·철회·lease 경계의 종합 관측은 MANUAL |
| provider | 동의받은 작은 입력으로 STT/LLM 각각1요청 시험 경로 | 동의 중단·늦은 응답·보관/품질 확인은 MANUAL |
| recovery | 별도 HTTPS anchor의 실제 CAS 시험 경로 | 실제 재시작·일관 백업/복원은 MANUAL |
| performance | 실제 표본을 읽는 오프라인 분위수 판정 | 실제 표본 수집은 MANUAL |
| cloud | 동일 릴리스·재시작·복원 확인의 증거 계약 | GCP 작업과 실관측은 MANUAL; 클라우드 API 자동 호출 없음 |

runner는 서비스 기동·migration·이미지 build·장애 주입을 자동 수행하지 않는다. 운영 환경과 다른 명시적 시험 배포/DB를 요구하며 기존 guard를 유지한다. Node 자식의 허용 네트워크를 제한하고 listen을 막는다. 이것은 브라우저·네이티브 실행 파일까지 통제하는 OS 수준 sandbox가 아니다.

코드·설정·계약·trust·환경 식별값이 바뀌면 이전 결과를 그대로 쓰지 않는다. 같은 입력으로 resume해도 검사를 다시 수행한다. 제공자 요청은 비용·결과 불명을 확인해야 하므로 일반 resume을 차단한다. 시간 초과 시 이번 실행의 자식 process group만 회수한다.

### 판정과 증거 수집

실행 ID·시각·HEAD·미커밋 소스 hash·설정/계약/trust/환경 식별값, 요구 ID, 기대 조건, 실제 assertion, 실패 이유와 증거 파일 hash를 연결했다.

- 결과는 PASS·FAIL·SKIPPED·BLOCKED·MANUAL로 구분한다.
- SQL/브라우저 시험은 실제 assertion이 실행됐는지 확인한다. HTTP200·연결 문구·종료 코드0만으로 성공을 선언하지 않는다.
- 자동화하지 않은 항목은 실제 관측 파일과 동일 환경/hash를 검토해도 MANUAL로 남는다.
- 진행 파일은 완료 증거가 아니다. 중단 위치를 남기고 실패 원인을 보존한다.
- 로그는64KiB, 파일은 각각2MiB·최대20개로 제한하고 비밀값·DB URL·JWT·이메일·전화번호를 가린다. 공유 전 사람의 추가 검토가 필요하다.
- 실제 원음·화면·브라우저 trace·성능 결과를 이번에 만들지 않았다.

### 공동 관리 화면과 신뢰 설정 전환

공동 변경 화면에 현재/제안 정책·공식 경로의 읽기 쉬운 비교, 기관·체인·계약·작업·nonce·만료·서명 digest 표시를 연결했다. 제안 파일 내보내기와 서명 파일 가져오기를 지원하고 등록 승인자·중복·만료·서명 내용을 로컬에서 검사한다. 변경 내용이 달라지면 이전 서명을 사용하지 못하게 한다. 장기 개인키를 웹에 입력하지 않는다.

정책·기관키·콜센터키와 게시된 공개 trust/웹 pin이 다르면 신규 업무·위임·시도·challenge·승인·소비를 차단하도록 연결했다. 관리·복구 경로는 필요한 범위로 유지한다. 정책 확정 후 새 trust·웹 배포가 일부만 성공해도 구 권한을 다시 활성화하지 않는다. 구 탭이 API의 새 키를 자동 신뢰하도록 바꾸지 않았다.

### 통합 시험과 성능 판정 보완

실제 PostgreSQL에서 commit된 소비 결과를 응답 유실 뒤 다른 연결로 복구하는 시험, 적용 SQL hash와 실제 인증 DB 계정 권한 시험을 작성했다. PBX 시험에는 시험 배포 identity 선검사, 수락 전 양측 송신0·수신 track 차단, 실제 양방향 RTP·decoded audio 관측을 보강했다. 이 시험들은 작성·타입 검사만 했으며 실행하지 않았다.

성능 판정은 구간별 최소100표본, 성공/실패 수, 같은 관측자의 monotonic clock, nearest-rank 분위수를 요구한다. 철회는 체인 확정 관측까지의 불확실성 상한도 포함하며 근거가 없으면 BLOCKED다. 검증500ms·철회5초·상태 최대10초는 목표이며 달성값이나 SLA가 아니다. 합성 표본은 계산 로직 시험용이다.

## 3. 주요 코드·설정과 요구사항

| 요구 ID | 주요 파일 | 역할 |
|---|---|---|
| OPS-001/002/004/007, TEST-001/004 | [preflight](../scripts/preflight.ts), [항목 분류](../scripts/preflight-requirements.ts), [준비 순서](../scripts/execution-input.ts), [준비 계획](../scripts/prepare-execution.ts) | 입력·생성 순서·차단 원인·실행 범주 |
| TEST-001~004, OPS-005/006 | [runner](../scripts/validation-runner.ts), [단계 정의](../scripts/validation-stages.ts), [Node 제한](../scripts/validation-network-guard.mjs), [증거 수집](../scripts/collect-evidence.ts) | 고정 명령·guard·실패/재개·판정·증거 |
| OPS-001/004, DB-001 | [DB LOGIN SQL](../infra/deploy/provision-logins.sql), [migration](../scripts/migrate-finals.ts), [최초 계정](../scripts/provision-finals.ts) | 최소권한·적용 이력·초기 blocked gate |
| GOVERNANCE-001/002, BUSINESS-003, UI-003/004 | [공통 서명 payload](../packages/protocol/src/configuration.ts), [관리 화면](../apps/web/src/components/ConfigurationReviewPanel.tsx), [로컬 검증](../apps/web/src/lib/configurationReview.ts), [서명 도구](../scripts/sign-recovery.ts) | 변경 검토와 서명 파일 교환 |
| CALL-001/004/006, STATE-003 | [게시 trust 검사](../services/api/src/published-trust.ts), [실제 업무 호출](../services/api/src/service-authority.ts) | 정책/키/trust 불일치 중 신규 권한 차단 |
| CALL-004, DB-001/003, PBX-001/003, MEDIA-002 | [SQL 시험](../tests/integration/service-runtime.test.ts), [DB 준비 시험](../tests/integration/database-readiness.test.ts), [PBX 시험](../tests/media/service-pbx.spec.ts) | 실제 환경에서 확인할 assertion 소스 |
| TEST-003, OPS-006 | [성능 판정](../scripts/evaluate-performance.ts) | 실제 관측 구간·최소 표본·불확실성·목표 판정 |

기존 pnpm과 설치된 의존성을 재사용했다. 웹에서 쓰는 viem은 이미 설치된 같은 버전을 직접 의존성으로 명시했다. `verifyDepsBeforeRun: error`를 적용해 검사 실행이 암묵적인 설치/lifecycle 경로로 들어가지 않도록 했다. 이번 실행 준비 작업에서는 Solidity를 바꾸지 않았고 계약 컴파일/시험을 새로 실행하지 않았다.

## 4. 실제 실행한 검사

2026-10-29 최종 offline runner 실행은 UTC09:17:45~09:17:59에 기록됐다. 아래는 그 실행 결과이며 이전171개 시험 등을 복사한 값이 아니다.

| 실제 명령 또는 검사 | 결과 | 의미 |
|---|---|---|
| `pnpm light` | **42개 파일·191개 시험 PASS** | 소스 위생·타입·오프라인 단위 시험 |
| `pnpm --filter @callsign/web build` | PASS | 웹 산출물 build; 브라우저 미기동 |
| `pnpm exec tsc -p services/api/tsconfig.runtime.json --noEmit` | PASS | API runtime 타입 |
| `node --import tsx scripts/preflight.ts --phase bootstrap` | BLOCKED | 사용자 설정 미입력; 다른 독립 offline 검사는 계속 수행 |
| `node --import tsx scripts/evaluate-risk.ts` | PASS | 합성 개발36문장·FP0/FN0·providerCalls0; 독립 품질 평가 아님 |
| `node --import tsx scripts/prepare-execution.ts --dry-run --output artifacts/execution-preparation-rechecked-20261029.json` | 계획/전체 설정 결과 저장 | 키 생성·서비스 호출 없음 |
| 후속7개 단계 `runValidation` dry-run | 모두 SKIPPED | 자식 명령 미실행; 실행 선행 PASS 증거로 사용 불가 |
| `bash -n` | PASS | deployment/backup/restore/generate-besu/test-integration 셸 문법만 |
| YAML 파싱 | PASS | Compose2개·workspace·CI2개; Docker/Terraform 실행 아님 |
| 문서 링크·코드 구획·MASTER 요구 ID, `git diff --check` | PASS | 기존 검사 시점의 문서7개·요구 ID74개 |
| 관리 화면 소스 detector | 발견 항목 없음 | 시각·브라우저·접근성 인증 결과가 아님 |

최종 offline 단계의 종합 상태는 **BLOCKED**다. 코드 검사 통과를 누락 설정이나 실환경 성공으로 바꾸지 않았다. 이 요약 작성 중에는 위 기능 검사를 재실행하지 않고 근거를 확인했다.

## 5. preflight의 남은 차단

| 구분 | 시작 시 재확인 | 현재 |
|---|---:|---:|
| PASS | 10 | **14** |
| BLOCKED | 38 | **62** |
| SKIPPED | 3 | **1** |
| FAIL | 0 | **0** |

기존 차단 중 고정 PBX IPv4와 실제 계약 artifact 경로/hash는 저장소 자료로 확인했다. 내부 ARI 주소도 Compose 기본값과 연결했다. 반면 빠져 있던 역할키·이미지·기관 URI·배포/체인 ID·PBX/ARI·인증서·최초 계정·필수 제공자 검사를 추가했다. 따라서 총 차단 수가 늘었다. 예제 주소·임의 digest로 통과시키거나 검사를 제거하지 않았다.

| 준비 분류 | 현재 상태 | 내용 |
|---|---|---|
| A: 코드/템플릿 수정 | 잔여 BLOCKED0 | 준비 순서·guard·기본 정책·검사 누락 보완 |
| B: 기존 로컬 자료 확인 | 잔여 BLOCKED0 | 실제 ABI/hash·PBX 고정 IP·내부 ARI 설정 |
| C: 사용자/외부 설정 | **43개 검사 BLOCKED** | OIDC·DNS/미디어·역할별 비밀 참조·DB 로그인·기관 URI·최초 계정·anchor·제공자 등 |
| D: 이후 생성값 | **19개 검사 BLOCKED** | 이미지7·역할키9·PBX 공개 인증서1·실제 deployment/trust2 |
| E: 실제 연결/기동 | **통합 항목1개 SKIPPED** | DB GRANT·OIDC·DNS·이미지 모듈·TLS/DTLS·TURN·체인·anchor 실제 확인 |
| F: 선택 기능 | 기본 준비 차단에 넣지 않음 | DID 확장·native proof·PSTN·외부 메시징 |

C의43은 검사 개수다. 존재 여부와 상호 격리를 따로 검사하므로43종의 값을 요구한다는 뜻은 아니다. STT/LLM은 기본 서비스 기능이며 최초 준비에서 보류할 뿐 선택 기능으로 내리지 않았다.

## 6. 남은 작업을 구분하면

**자동화 코드가 남은 영역:** Besu/Witness 전체 장애, TURN·철회·lease 종합, 실제 동의 중단, 실제 재시작/복원, 실측 수집, GCP 이행 전체를 자동 시험으로 완성한 것은 아니다. MANUAL 단계와 관측/첨부 계약을 준비했으며 실제 실행과 독립 검토가 필요하다.

**사용자/외부 선택이 필요한 정보:** 배포·기관·chain ID, 기관/콜센터 URI, DNS·HTTPS/WSS·TURN·PBX 주소, 일반/공식 OIDC 등록과 정확한 issuer/subject, 승인자 공개 주소3개, 역할별 보호 비밀 참조, 최초 계정 파일, 독립 anchor의 관리 위치/수명, STT/LLM 모델·보관 조건·소량 시험 예산이다. 실제 비밀값은 채팅으로 받지 않는다.

**나중 실행에서 생성되는 값:** 실제 이미지 digest, 새 역할키/공개 manifest, 인증서, genesis/계약 주소·code hash·배포 높이, 공개 trust/pin과 웹 이미지, 실행·릴리스 증거다. 지금 사용자가 값을 추측해 채울 항목이 아니다.

**실환경 검증 대기:** PostgreSQL 원자성·경합·권한, Besu/QBFT·Witness, OIDC·PBX·TURN·브라우저·양방향 음성, 실제 STT/LLM·한국어 품질/비용, 재시작·독립 anchor·백업/복원·GCP다.

**이번 기본 범위 밖:** native chain proof, DID 추가 방어, 일반 PSTN/SIP 상호운용, 무중단 통화 복원, 동적 validator, KMS/HSM, 외부 문자/메일·결제/가격·제공자 청구 정산은 추가하지 않았다.

## 7. 실행 제한과 도구 관련 기록

DB·체인·Witness·PBX·TURN·IdP·API/웹 서버·컨테이너·브라우저·마이크를 기동하지 않았다. 외부 AI·클라우드·알림, migration·계약 배포·seed, 장애/부하·실제 백업/복원도 수행하지 않았다. 기존 프로세스·키·볼륨·데이터와 기존 작업 요약을 변경하거나 삭제하지 않았다.

다만 검사 보조 도구에서 다음 동작을 발견했다. 전체 작업을 아무 네트워크 가능성도 없었던 실행이라고 표현하지 않는다.

- UI 지침 context 보조 도구의 자동 버전 조회 경로를 실행 뒤 확인했다. 캐시 사용인지 실제 HTTP 조회였는지는 확인하지 못했다. 재실행하지 않았고 이후 Node 검사에는 전송/listen 차단을 적용했다.
- 초기 타입 검사에서 pnpm의 암묵 의존성 확인이 install 경로에 진입해 `Already up to date`를 출력했다. 이후 workspace와 offline/ignore-scripts 환경으로 암묵 설치를 차단했다. 대형 다운로드를 요청하지 않았다.
- tsx CLI의 IPC listen 시도는 차단되어 실패했다. 오프라인 진입점은 `node --import tsx`로 바꿨다. 실패 이력은 증거에 보존했다.

## 8. 다음 실행과 피드백 시 확인할 지점

다음 단계는 새 기능을 늘리는 작업보다 **실제 설정 준비와 격리된 환경에서의 검증**이다. 별도 실행 승인 뒤 새 시험 배포를 준비하고, 동일한 보호 설정/환경 identity의 offline PASS를 확보한 다음 database → chain → media로 진행한다. 이후 제공자·복구·성능·GCP는 선행 증거와 각 범주 승인을 확인한다.

최초 DB 검증의 대상은 운영 DB와 다른 `callsign_test_*` DB다. 독립 연결의 실제 assertion이 모두 실행되고 소비·응답 유실 복구·quota·worker·권한이 통과해야 한다. skip이나 단순 연결 성공은 통과가 아니다. 정확한 준비 명령·보호 설정 전달·수동 증거 형식·정책/키 전환과 실패 복구는 아래 RUNBOOK에 기록했다.

피드백에서는 초기 준비 순서가 실제 운영자가 따라갈 수 있는지, 수동으로 남긴 검증 범위가 명확한지, 공동 변경 검토 화면과 신뢰 전환 중 차단/재개 정책이 적절한지를 확인할 수 있다. 실제 성능·음성 품질·분산 운영의 효과는 아직 평가할 근거가 없다.

## 9. 기준 문서와 원본 증거

- [MASTER 개발 명세](MASTER-DEVELOPMENT-SPEC.md): 요구사항과 완료 조건.
- [최신 진행 기록](FINALS-IMPLEMENTATION-PLAN.md#execution-readiness-20261029): 이번 구현·검증과 미완료 범위.
- [RUNBOOK](RUNBOOK.md#단계별-검증과-판정): 최초 준비·명령·판정·재개·신뢰 전환.
- [알려진 한계](KNOWN-LIMITATIONS.md), [서비스 가이드 현황](guide/05-IMPLEMENTATION-STATUS.md).
- [최종 offline 실행](../artifacts/execution-validation-rechecked-20261029.json): 명령별 출력과 상태.
- [전체 설정 준비 결과](../artifacts/execution-preparation-rechecked-20261029.json): 모든 검사 ID별 원인·주체·입력·절차.
- [증거 색인](../artifacts/execution-readiness-rechecked-20261029.json): 시작 대비 변화·파일 hash·실패 이력·도구 동작·보존 확인.

검증한 소스 식별값은 `7b3115ac45a3c14c6480e07fb0a5d1b46b014735445099d20f3d3be3c5406e1d`다. 이는 증거 도구가 정한 소스 집합의 hash이며 전체 worktree/문서/개인키를 모두 포함하는 hash는 아니다. 이 요약은 최종 검사 뒤 작성했으므로 기존 증거의 문서 hash 목록에는 포함되지 않는다. 과거 증거와 이번 결과를 합산하거나 실제 서비스 성공으로 확대하지 않는다.
