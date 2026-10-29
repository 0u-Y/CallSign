# 개발 현황과 검증 기록

기준일: **2026-10-30(KST)**. 이번 연결 작업 시작 HEAD는 `a9d67f0b4b50a022b0e20de1e4071ec49cdcbd8a`이며 개발 당시 아래 변경은 **미커밋 worktree**에 있었으며, 현재 로컬 보존 결과는 첫 PostgreSQL 검증 절을 따른다. 시작 시 있던 `docs/WORK-SUMMARY.md`는 변경하지 않았다. 커밋·push·배포는 하지 않았다. 과거 `ab0ec1c`·82개 시험은 이번 결과와 별도 이력이다.

요구·완료 기준은 [MASTER](MASTER-DEVELOPMENT-SPEC.md), 사용자 설명은 [서비스 가이드](guide/README.md), 운영 명령은 [RUNBOOK](RUNBOOK.md)에 연결한다. 코드 작성·순수 단위 검증과 실제 서비스 성공을 구분한다.

<a id="contract-validation-20261030"></a>

## 2026-10-30 커밋 정리와 로컬 EVM 계약 실행

이 절이 아래의 계약 미실행 기록보다 최신이다. 사용자는 이번 작업에 한해 설치된 도구의 프로세스 내부 EVM·제한 fuzz·Git fetch/일반 push를 허용했다. DB/체인/Witness/API/PBX/브라우저/AI/GCP·RPC/fork·실제 배포는 수행하지 않았다. 현재41GiB 안팎의 available memory·CPU24/load1.26·disk533GiB를 재확인했고, forge threads1·메모리 상한2GiB·timeout90초를 적용했다.

### 커밋 보존과 재구성

fetch 결과 origin/main은 `a9d67f0`, 로컬 원본3개는 모두 미공개였다. `backup/pre-contract-audit-20261030` ref로 원본 tip `ea55736`을 보존하고 미추적29개는 보호된 로컬 사본/hash 목록으로 보존했다. 기존 staging은 없었다.

| 재구성 commit | 책임 | 원본 대응 |
|---|---|---|
| `c357f3839aec2e8cda0dd3a6518e5cd21ad9d108` | 서비스 권한/통화/영속 처리와 실행 준비의 코드·시험·설정 | 원본819a825·7c1df4f의 최종 코드와 의존성. protocol→API→web과 준비/배포 시험이 연결되어 함께 보존 |
| `4fdb828597ca660c28c90309d947d4a84bfc1865` | 기존 오프라인·PostgreSQL 증거 | 원본3개 커밋의 artifact를 내용 변경 없이 보존 |
| `75d245f07c19765350b587dc46fa8cdd6c129e7f` | 제품/운영 문서 | 원본3개 커밋의 문서·그림을 내용 변경 없이 보존 |

재구성 tip과 원본ea55736의 Git tree가 정확히 같음을 확인했다. 공개된 a9d67f0 이하 이력은 재작성하지 않았다. 원본 증거의 HEAD·시각·결과도 바꾸지 않았다. 후속 계약/호환성 검증 코드는 `d673c9a`에 별도로 기록했다.

### 실제 계약 검증

기존10시험을 먼저 실행해10 PASS를 확인했다. 보강 후 중복 상속 실행을 제거한 **21개 시험 PASS·FAIL0·SKIP0**를 확인했다. 도구는 forge1.7.1, 설치된 Solc0.8.30+73712a01, EVM target cancun, optimizer10000이다. FFI=false·fork/RPC 없음·compiler/dependency 다운로드 없음·운영키 접근 없음이다.

| 요구 ID·보장 | 실행한 경계 |
|---|---|
| CONTRACT-001/004, GOVERNANCE-001 | 등록/공동 변경/복구의0/1 서명 거절, 서로 다른2명·순서 독립·3명 수락, 중복/미등록·유효2개 뒤 무효 추가 서명 거절 |
| CONTRACT-003/004 | 짧은 서명·zero 복구·잘못된 v·high-S 거절. 실제 상태 변경 함수에서 OpenZeppelin ECDSA 오류 확인 |
| CONTRACT-004 | 다른 chain/contract/실제로 등록된 다른 기관/action·변경 내용·회복 후 현재 epoch에 맞지 않는 옛 서명을 거절. 유효한 현재 문맥의 정상 대조군은 성공 |
| BUSINESS-003, CONTRACT-003 | 정책 hash/version 변경은 epoch 증가·구 위임 무효화, directory-only 변경은 유지. legacy 관리자+1승인자 경로는 기본 ServiceRegistry에서 거절 |
| GOVERNANCE-001/002 | 자기 기관 stopper의 정지와 타 기관/관리자 단독 정지 거절, 공동 복구/새 관리자·승인키·epoch 반영, 옛 관리자·위임 ID·철회 위임 부활 거절 |
| CONTRACT-004, TEST-002 | nonce 재사용·경쟁 제안/옛 version/hash/epoch 거절, 실패한 nonce 미소비, 기한 직전 수락/동일·직후·600초 초과 거절, revert 전후 상태/nonce 동일·실패 event 없음 |

fuzz는 seed `0x20261030`, runs32, 명시적 sequence depth2, assume0이다. 각 case에서 directory 변경과 policy 변경의 성공을 각각 assert하여 **성공 configuration 호출64개**를 확인했다. setup 등록 호출을 그 숫자에 섞지 않았고 전체 invariant 증명이라고 부르지 않는다.

새 시험의 첫 실행에서3개 실패가 있었다. 원인은 Solidity memory struct alias, 다른 기관 정상 대조군이 전역 nonce를 먼저 소비한 것, 인자가 있는 custom error에 대한 Foundry exact/partial 매칭 차이였다. 시험을 수정해 의도한 문맥/오류 selector와 원자성을 검사했다. 계약 본체의 권한 조건은 완화하지 않았다. TS검사에서 decoder 결과 unknown 좁히기 오류1개도 수정했다. 원본 실패 출력은 [검증 기록](../artifacts/contract-validation-20261030.json)에 보존했다.

### 실제 앱과 계약의 호환성

`contract-interop.ts`가 현재 registrationTypedData/configurationTypedData/recoveryTypedData, worker의 serviceRegistryAbi, event consumer의 기존 ABI로 fixture를 생성한다. 공개 고정 시험키1/2와 CREATE 주소용99만 사용하며 운영키/env/RPC를 읽지 않는다. 컴파일된 ABI를 통한 calldata 재인코딩이 worker ABI의 bytes와 같은지 확인했다.

Solidity 시험은 이 fixture의 등록→정책 변경→정지/복구 calldata를 실제 계약에 실행한다. digest와 signer 복구를 비교하고 변조된 정책 요청을 거절한 뒤 정상 요청을 수락한다. 실제 ConfigurationUpdated의 topic/indexed 기관/data를 consumer ABI가 만든 bytes와 비교했다. TS 단위 시험은 fixture와 현재 앱 함수의 출력을 다시 비교하여 같은 수동 상수만 복사한 통과를 방지한다.

계약 본체·ABI·bytecode는 기존 `service-registry-build-20261027.json`과 정확히 같다. 검토 artifact hash도 유지한다. 새 배포 주소나 배포 이력은 생성하지 않았다. 새 API 변경은 기존 event ABI export뿐이며 SQL/DB 실행 경로를 바꾸지 않았고 DB를 다시 기동하지 않았다. 과거DB15 PASS는 당시 검증 범위 그대로다.

최신 소스 검사: **light43파일194시험 PASS**, 웹 build·API runtime 타입·규칙 회귀 PASS. 전체 preflight는 외부 설정 미입력으로 BLOCKED이며 계약 PASS와 별개다. [EVM 원본](../artifacts/contract-evm-results-20261030.json), [소스 검증](../artifacts/contract-source-verification-20261030.json), [실패/파일 hash·도구/커밋 대응](../artifacts/contract-validation-20261030.json)을 연결한다. 이 결과는 Besu/QBFT·Witness·브라우저 통화/VC/lease 실제 회수·성능·배포 성공을 뜻하지 않는다.

일반 push 대상은 유일한 origin의 main이며 push 전 재fetch/fast-forward 관계·공개 파일을 검토한다. 실제 원격 SHA와 CI 상태는 push 후 확인하여 최종 응답에 구분한다. backup ref는 로컬에만 남기며 force push하지 않는다.

## 실행 제한

[AGENTS.md](../AGENTS.md)를 유지한다. DB·체인·Witness·Asterisk·TURN·IdP·API/웹 서버·브라우저·마이크·외부 AI·GCP를 실행하지 않았다. migration 적용, 이미지 다운로드/빌드, 배포, 기존 프로세스·키·볼륨 변경도 하지 않았다. `pnpm light`의 fetch/TCP/listen/UDP 차단과 worker 2 제한을 보존했다. 새 작업·백업·복원·anchor 진입점에도 명시적 실행 guard가 있다.

<a id="postgres-validation-20261029"></a>

## 로컬 보존과 첫 PostgreSQL 검증 (2026-10-29)

이 절은 아래의 DB 미실행 기록보다 최신이다. 사용자 한정 허가에 따라 기존 Docker/로컬 PostgreSQL17.6 이미지로 전용 시험 DB만 기동했다. Besu/Witness/PBX/TURN/IdP/API/웹/브라우저/AI/클라우드·계약 배포·실제 복구는 수행하지 않았다. 기존 실행 중인 컨테이너와 서비스는 조회만 했다.

- 기준 `a9d67f0`의 관련201개 파일을 로컬 checkpoint `819a825`로 보존했다. 기존 staging은 없었고 경로 목록을 검토해 명시적으로 추가했다. 키/보호 env/DB 데이터/브라우저 세션은 포함하지 않았다. 진행 포인터14개는 디스크에 보존하고 커밋하지 않았다. 기존 요약의 Markdown 줄바꿈/EOF 공백은 보존했으며 commit hook 우회나 Git 설정 변경은 하지 않았다.
- 실제 초기 여유: CPU24·load 약1.0, available41663MiB·disk534GiB, swap7804MiB 사용 중이나 짧은 관측에서 si/so0. DB512MiB/CPU1/no extra swap, 시험 worker1. 첫 소스 검사는 합산 RSS1GiB 한도를 넘겨 중단했고 실패로 보존했다. 여유를 재확인해 시험 budget2GiB로 조정했다. available8GiB 미만·지속 swap·시간/예산 초과 시 이번 프로세스만 중단하는 감시를 적용했다.
- 첫 Docker internal network는 host port mapping이 생기지 않아 해당 생성 자원만 정리했다. 별도 bridge(no IP masquerade)·loopback 임의 포트·tmpfs PG data·로컬 image ID·watchtower 제외 label로 준비했다. 초기 readiness 재시도 문제 이후 TCP readiness로 확인했다. 실제 서비스키는 생성하지 않았고 시험 비밀번호만 보호된 임시 파일에 저장했다.
- 실제0000~0005 migration과 issuer/auth/worker/PBX LOGIN provisioning을 적용했다. 초기 DB15시험 중1개가 work-session fixture의 OIDC 필드 누락으로 실패했다. 제약조건을 유지하고 issuer/client/audience/authenticated_at을 fixture에 추가했다.
- 재시도에서는 이전 retry fixture의 outbox가 global worker claim에 섞였다. 생산 claim 규칙/동시성은 바꾸지 않고 각 fixture 기관/작업의 outbox를 finally에서 정리했다. 실패/큐 관측을 보존한 뒤 첫 DB와 network는299초 내 정리했다. 다른 자원은 건드리지 않았다.
- **최신 첫 통과: 실제 DB4파일·15시험 PASS, FAIL0·pending0.** 독립 소비/다른 binding 거절·commit 후 응답 유실/다른 연결 복구·quota 예약/정산·claim/서명자 lease·계정 회수·migration source hash를 확인했다. 별도 auth LOGIN으로 SELECT/session DELETE를 실행하고 users/issuer UPDATE가 SQLSTATE42501로 거절되는지 보강했다. 그 외 production LOGIN 전체의 모든 SQL 권한까지 검증했다고 주장하지 않는다.
- 같은 실행에서 light42파일193시험·웹 build·runtime 타입·규칙 회귀 PASS. 전체 설정 preflight는 BLOCKED이며 전체 서비스 준비와 별개다. 메모리 anchor 구간은 실제 SQL을 썼지만 독립 HTTPS anchor/복원 증거는 아니다. tmpfs DB는 영속 disk 장애/전원 손실 내성을 입증하지 않는다.

수정은 `tests/integration/service-runtime.test.ts`와 `database-readiness.test.ts`의 fixture·정리·권한 assertion이다. [자원/시도 기록](../artifacts/local-postgres-checkpoint-20261029.json)에 첫 실패와 최신 통과의 원본 파일을 연결했다. 후속 수정은 로컬 `7c1df4f`에 보존했고 그 HEAD에서 같은 DB를 재검증해15/15(PASS·FAIL0·pending0), 남은 pending/processing outbox0을 확인했다. [최종 DB 결과/정리](../artifacts/local-postgres-result-20261029.json)에 관측과 근거를 묶었다. DB container/network와 보호 임시 자격 파일을 전부 제거했다. 첫 DB는299초, 두 번째는304초로5분 목표를4초 넘긴 정리 시각도 숨기지 않았다. 후속 증거 commit은 시험 HEAD와 구별하고 소스 hash로 연결한다. push하지 않는다.

<a id="readiness-refinement-20261029"></a>

## 실행 준비 후속 수정 (2026-10-29)

이번 후속 기록이 아래191개 시험 기록보다 최신이다. HEAD는 `a9d67f0b4b50a022b0e20de1e4071ec49cdcbd8a` 그대로이며 기존 worktree를 보존했다. 새 종합 Markdown은 만들지 않았다.

- **TEST-001/004, OPS-004/006:** runner 결과의 method/execution/verdict/review 네 축을 추가했다. status=MANUAL은 호환 표기이며, 출처·같은 환경·명시적 PASS/FAIL·요구별 boolean assertion·검토 기록을 확인한 메타데이터 검토만 수동 판정을 기록한다. 미실행/구 MANUAL은 unjudged다. 수동 FAIL도 보존하고 선행 통과로 인정하지 않는다. execute와 review를 섞는 진입을 거절한다.
- **TEST-001/004, DB-001:** 첫 database의 선행 조건을 light/web/runtime/rules 소스 검사로 한정했다. unrelated preflight BLOCKED를 소스 PASS로 바꾸지는 않지만 DB를 막지 않게 했다. DB 전용 URL·test identity·guard·최소권한/적용 이력은 그대로 요구한다. HEAD/소스/공개 파일 변경·오래된 증거·assertion 누락은 거절한다.
- **OPS-001/002/003/005:** 입력을 기존 env 기준의 다섯 결정 묶음으로 RUNBOOK에 정리했다. C43/D19검사를43/19개 사용자 질문으로 바꾸지 않았다. 로컬 확인·외부 등록·나중 생성·GCP 전용을 구분했다. 주소·키·digest를 만들거나 실제 계정을 조회하지 않았다.
- **OPS-007, TEST-004:** identity에 sourceFiles 목록을 기록하고 artifacts 아래 실제 선택한 계약 artifact도 publicFiles에 결합했다. 큰 소스·symlink를 조용히 누락하지 않고 검토를 요구한다. 기존 collector의 `.env.test` 같은 파일 제외 패턴을 수정하고 테스트했다. 루트 keys/secrets ignore를 보강했다. tracked private-looking 경로는 발견하지 않았고 실제 비밀 내용은 출력하지 않았다. 이 경로 검사는 저장소 전체 비밀 스캐너가 아니다.
- **CALL-004/005/006, AI-001/004, LEDGER-002, STATE-003:** 기존 소비/응답 유실·epoch·숨김/늦은 응답·동의 revision·claim 유실·anchor mismatch·trust publication 시험을 확인했다. 같은 순수 보장을 다시 구현하지 않았다. 실제 media/CAS/DB 관측이 필요한 경계는 기존 harness와 MANUAL 절차로 남는다.

최신 실행은 [후속 offline 증거](../artifacts/readiness-refinement-complete-20261029.json)에 있다. **42개 파일·193개 시험 PASS**, 웹 build/runtime 타입/규칙 회귀 PASS. 전체 offline은 설정 누락으로 BLOCKED, assessment는 automatic/blocked/unjudged/unreviewed다. 기존62/14/1 설정 snapshot을 새 실환경 성공으로 해석하지 않는다. 수동 PASS/FAIL·구 MANUAL 보수 거절·DB 소스 선행 분리·비밀 경로 제외의 회귀를 검사했다. 실제 DB/체인/PBX/브라우저/provider/클라우드·키 생성·migration·backup/restore·commit/push는 수행하지 않았다.

[RUNBOOK 후속 절](RUNBOOK.md#실행-전-정합성-보완--2026-10-29-후속)이 입력 ID/소비처/형식/비밀 여부/준비 책임/최초 단계, 첫 DB CLI·중단 조건, GCP 이전과 checkpoint 포함·제외 기준이다. 현재 결과는 code checks PASS이지 설정 준비 또는 실환경 PASS가 아니다. [인계용 증거](../artifacts/readiness-refinement-checkpoint-20261029.json)는 tracked/untracked 구분과 기존 요약 보존 hash를 담는다.

<a id="execution-readiness-20261029"></a>

## 2026-10-29 실행 준비·검증 체계

HEAD `a9d67f0b4b50a022b0e20de1e4071ec49cdcbd8a` 이후 미커밋 작업을 이어 수정했다. 아래 10월27일 기록은 당시 결과로 보존한다. `WORK-SUMMARY.md`, `PRODUCT-CONNECTION-WORK-SUMMARY.md`, `DEVELOPMENT-REVIEW-SUMMARY.md`와 기존 artifact는 덮지 않았다. 별도 요약 Markdown을 만들지 않았다.

| 요구 ID | 이번 실제 수정·연결 | 검증 범위 |
|---|---|---|
| OPS-001/002/004/007, TEST-001/004 | preflight 항목별 A~F 준비 주체/입력/선행 조건/다음 절차, bootstrap/runtime 분리, 고정 PBX IP·실제 ABI/hash 확인; 준비 도구 default dry-run/기존 경로 충돌·0600·진행 기록; 실제 최소권한 LOGIN SQL | 누락/guard·기본 dry-run 시험, YAML·셸·설정 정적 검사. 비밀값 생성·SQL 적용·이미지/체인 기동은 안 함 |
| TEST-001~004, OPS-005/006 | 고정 argv 8단계 runner·guard·test identity·부모/자식 제한·timeout·중단/진행 파일·출력 redaction·선행 증거/재실행·MANUAL 관측 근거 | 네트워크 sentinel·명령 미실행 dry-run·실패 전파·identity·원본 hash 변조 단위 시험. 실제 실환경 단계는 미실행 |
| GOVERNANCE-001/002, BUSINESS-003, UI-003/004 | 공동 변경 전후 구조화 비교·chain/registry/action/nonce/deadline/digest 표시·제안 export/서명 import·중복/만료/등록 키 로컬 검증; protocol의 공통 payload 재사용 | 실제 로컬 EIP-712 서명/변조 시험·타입·웹 build. 브라우저/PBX/체인 성공 아님 |
| CALL-001/004/006, STATE-003, OPS-002/005 | 신규 업무·위임·시도·challenge·승인·소비에 게시 trust/pin/현재 키·정책 일치 검사; 불일치 중 관리/복구 유지. 최초 provisioning gate는 blocked로 두고 실제 anchor 검사로만 해제 | stale publication/초기 계정·gate 경계 단위 검증. 실제 rollout/zero anchor/readiness 미검증 |
| DB-001/003, CALL-004, MEDIA-002, PBX-001/003 | 실제 migration source hash·auth GRANT 검사 소스, 독립 PG 연결 commit 후 응답 유실 retry, 실제 test 배포 identity 선검사·양측 decoded audio/RTP·수락 전 수신 track 차단 증거 | 소스·타입만. 실제 PG/PBX/브라우저는 실행 안 함 |
| TEST-003, OPS-006 | 최소100표본/성공·실패/nearest rank·단일 monotonic clock, 철회 관측 경계 불확실성 상한을 포함한 성능 판정 | 합성 입력으로 계산/거절 로직만 단위 검증. 실측값 생성·부하·목표 달성 주장 없음 |

### 이번 검사와 차단 분류

[최종 오프라인 실행](../artifacts/execution-validation-rechecked-20261029.json): light **42파일·191시험 PASS**, 웹 build PASS, API runtime 타입 PASS, 합성 규칙36문장 FP0/FN0·providerCalls0. bootstrap preflight는 미입력 C 때문에 BLOCKED이며 나머지 독립 offline 검사는 실행했다. 단계 전체를 PASS로 바꾸지 않았다. [항목별 준비 결과](../artifacts/execution-preparation-rechecked-20261029.json), [통합 증거 색인](../artifacts/execution-readiness-rechecked-20261029.json)을 기준으로 한다. 이번에 Solidity를 바꾸지 않아 계약 컴파일/시험을 재실행하지 않았다. 10월27일 compiler 결과는 과거 증거다.

| 분류 | 현재 결과·변화 |
|---|---|
| A 코드/템플릿 | guard·정책·플랫폼 DB 격리 등 로컬 검사. bootstrap 순환 의존/적용 플래그/검사 누락을 실제 수정. 잔여 BLOCKED0 |
| B 기존 자료 | 이전 BLOCKED `PBX_PRIVATE_ADDRESS`와 `REGISTRY_ARTIFACT_PATH`를 기본 overlay 고정 IPv4 및 실제 오프라인 artifact/검토 SHA-256으로 확인. 내부 ARI 주소도 실제 Compose 기본값으로 확인. 실제 네트워크/배포 검증으로 확대하지 않음 |
| C 사용자/외부 입력 | **43개 검사 BLOCKED**. 같은 OIDC/DB/승인자/내부 비밀값·PBX/최초 계정의 존재/상호 격리를 별도 검사하므로 입력43종이라는 뜻은 아님 |
| D 이후 생성값 | **19개 검사 BLOCKED**. 이미지7·역할키9·PBX 공개 인증서1·실제 deployment/trust2. 지금 주소/digest/키를 추측해 요구하지 않음 |
| E 실환경 | network-and-runtime **SKIPPED1**. DB/체인/Witness/PBX/TURN/OIDC/anchor·이미지 내용은 실행 뒤만 판정 |
| F 선택 | DID 확장/native proof/PSTN/외부 메시징은 기본 준비 의존성에 추가하지 않음. 필수 AI provider 준비는 C이며 bootstrap 보류만 허용 |

현재 runtime preflight는 **BLOCKED62·PASS14·SKIPPED1**이다. 시작 시 재실행한38/10/3에서 기존 차단2개를 해소했으나 누락된 키·이미지·기관 URI/배포·체인 ID·ARI·인증서·필수 provider 검사를 추가했다. 마지막 구성 대조에서 PBX 공개 주소·ARI/DB template 비밀 참조·최초 accounts 파일이 빠져 있음을 찾아 검사를 추가했고, 고정 내부 ARI 주소는 실제 Compose 값으로 확인했다. 숫자를 줄이려고 예제 digest/주소를 넣거나 검사를 삭제하지 않았다. [7개 후속 단계 dry-run](../artifacts/execution-readiness-rechecked-20261029.json)은 전부 SKIPPED이며 자식을 실행하지 않았다.

### 실행 제한과 검사 중 발견한 도구 동작

서비스/노드·DB·PBX·브라우저/마이크·외부 AI·클라우드·이미지·migration·실제 backup/restore·commit/push는 수행하지 않았다. 다만 UI 지침의 context 보조 도구에 자동 버전 조회 경로가 있음을 실행 뒤 발견했다. 캐시 또는 실제 HTTP 조회였는지는 확인하지 못해 이 도구를 완전한 오프라인 검사로 주장하지 않는다. 재실행하지 않았고 이후 Node 자식 검사에 전송/listen 차단을 적용했다.

타입 검사 시작 시 pnpm11의 기본 의존성 자동 확인이 install 경로로 진입해 `Already up to date`를 출력했다. 신규 대형 다운로드를 요청하지 않았으며 이후 workspace `verifyDepsBeforeRun: error`와 offline/ignore-scripts 환경을 적용해 명령 실행이 설치/lifecycle을 암묵 수행하지 않게 했다. 웹의 viem은 이미 설치된 같은 버전을 직접 의존성으로 명시했다. tsx CLI의 IPC listen은 차단되어 실패했으므로 runner/오프라인 명령은 `node --import tsx`로 변경했다. 이 실패·타입 수정·guard 회귀 이력도 증거 색인에 기록한다.

### 남은 범위

- **코드 미구현/수동 절차:** Besu/Witness 전체 장애·TURN/철회/lease 종합·실제 동의 중단·재시작/복원·실측 수집·GCP 이행은 자동 시험 runner로 구현 완료라고 하지 않는다. 고정 runner의 MANUAL 단계와 관측/첨부 계약이 있고 운영자 실행/독립 검토가 필요하다. OS 수준의 범용 네트워크 sandbox는 제공하지 않는다.
- **사용자/외부 정보:** DNS/HTTPS·기관/콜센터 URI·배포/기관/chain ID·일반/공식 OIDC 등록 및 실제 issuer/subject·승인자 공개 주소3개·역할별 비밀 참조·최초 accounts 파일·PBX 공개 주소/DB 로그인·독립 anchor 관리 위치·provider 모델/보관/소량 예산. 비밀값은 채팅으로 받지 않는다.
- **실행 생성값/검증:** 이미지 digest·키/공개 manifest·인증서·genesis/실제 계약 metadata·공개 trust/pin·웹 이미지·릴리스 및 실제 모든 환경 시험. 지금 BLOCKED를 해제하지 않는다.
- **기본 범위 밖:** DID/native proof/PSTN/동적 validator/KMS/HSM·외부 문자/메일·청구 정산은 이번에 추가하지 않았다.

다음은 새 기능 추가보다 **실제 설정 준비와 단계별 실행 검증**이다. 최초 준비/변경/재개·정확한 명령·성공 기준은 [RUNBOOK](RUNBOOK.md#단계별-검증과-판정)에 둔다. 수동 관측을 포함한 최종 서비스 성공은 아직 없다.

<a id="pre-execution-20261027"></a>

## 2026-10-27 실행 전 마무리 기록

같은 시작 HEAD 이후의 미커밋 작업이다. `WORK-SUMMARY.md`, `PRODUCT-CONNECTION-WORK-SUMMARY.md`와 과거 artifacts는 그 시점의 기록으로 보존한다. 아래에 있는 ‘이전 연결 작업’의 34개 파일·148개 시험을 이번 결과로 재사용하지 않는다. 서비스 기동·외부 제공자 호출·migration·계약 배포·commit·push는 하지 않았다.

| 요구 ID | 구현과 실제 호출 연결 | 검증 및 남은 경계 |
|---|---|---|
| CONTRACT-001~005, GOVERNANCE-001/002, BUSINESS-003 | `ServiceRegistry.sol` 새 배포 계약, 기존 directory 단독 경로 거절. `updateConfiguration`에 2-of-3·chain/registry/기관/종류/정확한 이전·다음 hash/version/epoch/nonce/deadline 결합. API 제안→개별 서명 수집→worker 제출→확정 이벤트+같은 블록 상태 대조→최신 Witness 확인→정책 활성화→새 trust 게시 | 실제 서명·중복/다른 작업/내용/nonce 경계 단위 시험, 계약·시험 소스 오프라인 컴파일. 계약 시험·배포·체인 동작은 미실행 |
| STATE-001~003, CALL-006 | 새 registry profile·정책 hash를 동일 블록 Witness 증언에 포함. SDK가 구 profile 대체·policy hash 불일치를 거절. 공동 정책 변경을 단순 조회 장애와 구분해 구 통화를 회수 | 서명한 정책 변조·profile downgrade·권한 변경 단위 시험. 실제 Witness·철회 전파는 검증 대기 |
| AUTH-001/002, BUSINESS-001/002, UI-003/004 | 기관 계정 화면→최근 인증/CSRF→서버 객체 경계→제한된 DB 함수. 외부 issuer/subject 사전 연결, 내부 역할/활성 상태 변경, 자기 권한 상승/일반 관리자의 공동 승인자 생성 차단. 세션 세대 재검사와 통화·동의 회수 | 외부 IdP 계정을 만드는 기능은 아니다. 첫 로그인 토큰으로 subject를 검증한다. 실제 SQL 함수·권한·독립 연결 경합 시험은 작성·타입 검사만 |
| DB-001/002/004, LEDGER-001~003 | 서명자별 준비 lease, RPC 대기 중 전역 DB 트랜잭션 잠금 제거, 늦은 준비 결과의 fencing, 기관별 worker claim, 동일 순서의 기관→outbox 잠금. 공동 변경 이력 분리 보관과 aggregate 개수 제한 | 실제 PG nonce/잠금·역순 event·재시작 검증 대기. 외부 signer 도구와 관리자 nonce를 공유하지 않는다 |
| STATE-003, OPS-005 | 소비뿐 아니라 계정·키·정책 및 취소/회수 사건도 독립 anchor journal에 결합. 계정 SQL 변경과 checkpoint를 같은 트랜잭션에서 처리. 전체 이력은 읽기 전용 snapshot으로 검사하고 마지막에 head·metadata·복구 token 재검사. CAS 응답 유실은 정확한 next readback으로만 복구 | CAS가 전진한 뒤 DB commit을 잃고 정확한 이력이 사라지면 자동 복구하지 않는다. 기존 authority metadata 기준 없는 DB는 차단하고 명시적 새 신뢰 이행 필요 |
| MEDIA-002/003, PBX-001~003, CALL-002/005, UI-001/002/007 | 비동기 track 부착 중 음소거/숨김/기한 만료 경합 수정. 검증 전 수신 오디오도 차단. Asterisk 절대 통화 timeout 설정/조회 후 bridge 허용, DB 장애 시 기존 채널 음소거. 업무 자동 갱신과 늦은 응답 방어, 업무 생성 재시도의 동일 ID 보존 | PBX timeout은 서명 기한에서 ARI 전송 여유를 뺀다. 120초를 보장된 연결 대기 시간으로 늘리지 않는다. 실제 Asterisk 함수/드라이버·양방향 RTP·종료·브라우저 검증 대기 |
| OPS-005/006, DB-002, UI-006 | manifest HMAC·archive 링크 거절, 복원 뒤 모든 로그인 세션 폐기. 영속 웹 알림·읽음·설정·만료·중복 억제. 고정 차원 처리 시간/실패·상관 ID·worker 오류/queue·process 자원 조회 | 외부 문자/메일 공급자는 미선택·미호출. 브라우저 표본은 비신뢰 관측이며 서로 다른 시계를 빼지 않는다. 전구간 성능 목표 달성을 뜻하지 않는다 |
| AI-001~005, TEST-001~004 | 36개 합성 한국어 개발 회귀, 인용 밖의 실제 요구와 국소 자기정정 처리. 오프라인 preflight, 제한된 검사 증거 수집·dry-run. PG 계정/CAS/claim, 독립 HTTPS anchor, 실제 양방향 RTP 시험 소스 보강 | 제공자·독립 사람 평가·실제 음성/품질·비용은 미검증. 개발 문장을 독립 평가 자료라고 표시하지 않는다 |

### 실제 실행한 검사

[이번 증거](../artifacts/pre-execution-20261027.json)는 dirty worktree의 파일별 hash·실행별 출력·수정 전 실패 이력을 보존한다. 최종 source manifest SHA-256은 `4ecc1987946f4f87408ae863b6080e55b1a2846ee6ab35e30853023818d4d536`다. 현재 HEAD만으로 이 상태가 재현되지는 않는다.

| 명령/정적 확인 | 최신 결과 | 정확한 검증 범위 |
|---|---|---|
| `pnpm light` | PASS: **38개 파일·171개 시험** | source hygiene·API/Witness/웹/시험 타입·오프라인 단위 시험. fetch/TCP/UDP/listen 차단·worker2 유지 |
| `pnpm --filter @callsign/web build` | PASS | 실제 브라우저 미기동. chunk 크기·정적/동적 import 관련 Vite 경고는 남음 |
| `pnpm exec tsc -p services/api/tsconfig.runtime.json --noEmit` | PASS | API runtime 타입. 서버/DB 미기동 |
| `pnpm exec tsx scripts/preflight.ts` | BLOCKED: 설정 미주입38, 로컬 PASS10, 환경 확인 SKIPPED3 | HTTP/API/DB/비밀키 로딩 없음. 잘못된 조합 FAIL과 누락 BLOCKED를 구분 |
| `pnpm exec tsx scripts/evaluate-risk.ts` | PASS: 합성 개발36문장, FP0/FN0·providerCalls0 | 규칙 회귀만. 독립 정답·실제 한국어 STT/LLM 품질이 아님 |
| `forge build --offline contracts/test/ServiceRegistry.t.sol --out /tmp/callsign-preexecution-contracts --cache-path /tmp/callsign-preexecution-contract-cache` | PASS | 기존 도구의 오프라인 계약/시험 소스 컴파일만. 계약 시험·노드·fork·RPC 없음 |
| `bash -n`, YAML parser, 문서 링크/ID, `git diff --check` | PASS: 셸10·YAML5·문서15·고유 요구 ID74 | 서비스·컨테이너 미기동. YAML 파싱은 실제 Compose/GCP 동작을 보장하지 않음 |

preflight 보강 중 발견한 implicit-any 타입 오류는 수정했고 최종 light를 다시 통과했다. 이 실패도 증거의 validationHistory에 남겼다. 이전 148/82/66/44개 시험을 최신 결과로 합산하지 않는다. 독립 검토에서 지적한 현재 결과·source 식별·실행 준비 조건을 본문과 서비스 가이드에 보완했다. 추가 표준 사실은 Asterisk 공식 문서와 대조했다. 규칙 fixture의 작성자/정답/검사자가 독립적이지 않은 한계를 명시했으며 개발 회귀를 독립 품질 평가로 부르지 않는다. 상태·시험 수의 기준은 이 실행 artifact, 요구의 기준은 MASTER이며 새 기준 문서를 추가하지 않았다.

### 작성했지만 실행하지 않은 시험

- `contracts/test/ServiceRegistry.t.sol`: 동일 서명자/다른 작업·기관·내용·옛 nonce·legacy 우회·정책 세대. 소스 컴파일만 했다.
- `tests/integration/service-runtime.test.ts`: 실제 독립 PG 연결의 account/세션·claim·서명자 lease·quota·초기 checkpoint·commit 경계. memory anchor 구간의 독립성 한계를 별도 표시했다.
- `tests/integration/independent-anchor.test.ts`: 별도 HTTPS anchor·단일사용 zero fixture와 실제 DB 과거 복원 대조. init/reset/자동 기동 없음.
- `tests/media/service-pbx.spec.ts`: 양방향 실제 RTP·수락 전 송신0·철회/로그아웃/종료 track 정리. 브라우저·PBX 미실행.
- 기존 제공자 smoke·체인·통합·장애/성능 소스와 절차는 보존한다. 실제 제공자·전체 장애/클라우드 복구 runner·성능은 통과했다고 쓰지 않는다.

이후 실행 단계별 설정·명령·성공 조건은 [RUNBOOK](RUNBOOK.md#실행-허가-후-추가로-확인할-시험)에 연결한다.
### 배포·정책 이행의 중요한 결정

- 구 `InstitutionRegistry`는 회귀 대상으로 남는다. 업그레이드 proxy가 없으므로 새 `ServiceRegistry` 주소·code hash·생성자 초기 정책 hash·배포 시작 블록·3명의 승인자를 검토하고 trust를 명시적으로 전환한다. 오프라인 ABI/bytecode/layout 산출물은 `artifacts/service-registry-build-20261027.json`이다. 실제 배포 이력은 아니다.
- 현재 구현된 공식 동작은 `/official` 하나다. 목록의 표시명 변경은 그 경로를 유지하며 기존 통화를 끊지 않는다. 허용 질문·금지 요구·정책 버전 등은 전부 서명·위임 범위이므로 정책 hash 변경은 epoch를 증가시키고 구 VC/승인/통화를 무효화한다. 새 위임·업무와 policy version에 맞는 trust/웹 pin 게시가 필요하다. 존재하지 않는 공식 경로를 UI에 광고하지 않는다.
- 새 SQL은 `0005_account_management.sql`까지다. 기존 데이터의 사용자 소속이 중복되면 migration을 실패시킨다. 기존 저널에 authority checkpoint가 없거나 record가 새 기준을 증명하지 못하면 일반 재시작으로 자동 채택하지 않는다. 새 기본 배포는 검토한 새 초기 신뢰와 빈 DB·독립 zero anchor에서만 준비한다.
- 업무 계정의 운영 중 추가는 인증된 관리 API를 사용한다. `provision-member.ts`로 새 checkpoint 배포를 우회해 수정하지 못한다. 최초 공동 승인자/키 집합의 bootstrap은 별도 운영 절차다.

### 남은 항목 분류

| 분류 | 내용 |
|---|---|
| 코드 미구현 | 일반 SIP proxy/PSTN·자동 transfer·무중단 진행 통화 복원은 지원하지 않는다. 기본 범위 밖 기능을 구현 완료로 세지 않는다. 이 당시에는 단계 runner가 없었다. 현재 고정 단계/수동 관측의 범위는 2026-10-29 기록을 따른다 |
| 사용자·외부 정보 필요 | 실제 검토한 Asterisk/ODBC/PJProject·앱/웹/TURN 이미지 digest, OIDC issuer/client/audience/auth_time 정책, DNS/TLS/DTLS/TURN 주소, 역할별 DB 로그인/키, 별도 수명·관리 권한의 anchor, 제공자 모델/보관·예산. 멘토링 원문/최종 제출 양식은 원문 확인 필요 |
| 실제 실행 검증 대기 | migration 최소 권한·SQL 경합/응답 유실·새 계약·Witness·키/정책 회전·PBX/RTP/브라우저·실제 IdP·제공자·장시간/장애/백업·복원·GCP. preflight는 이 성공을 입증하지 않는다 |
| 기본 범위 밖 확장 | native chain proof, 선택 DID 추가 DNS 방어, 외부 알림 채널 채택, KMS/HSM·동적 validator/승인자 집합 변경·일반 SIP 상호운용 |

## 이전 연결 작업의 기록

<a id="service-20261027"></a>

## 이전 연결 시점의 기능

기본 웹 경로는 `/service`, 기본 배포 profile은 `service`다. 기관 URI·등록 키 준비 → 기관 최초 등록의 공동 서명 제출 → 업무 위임 발급/원장 작업 → 상담원 개별 승인 → 수신 nonce/공개키 등록 → PBX 세션/양측 소유 증명 → 일회 소비/영수증 → 양측 검증·수락 → 통화 유지·원격 음성 분석 → 종료/회수 코드를 연결했다. `/finals` 직접 통화와 초기 시연 회귀는 보존하며, 기본 서비스에서 이전 형식으로 변경 요청을 우회하지 않는다. 실제 통화 성공을 확인한 것은 아니다.

| 요구 ID | 코드·사용자 동작 연결 | 구현·검증 상태 | 외부 검증 또는 남은 범위 |
|---|---|---|---|
| IDENTITY-001/003, CALL-001 | `prepare-finals.ts`의 URI/public manifest/PBX 키·인증서 pin, `Service.tsx`→challenge→Sender 서명→기관 승인 | 기본 경로 코드 연결, 단위·타입 검사 | 실제 신규 키 준비/기관 공동 등록/VC 등록 미실행. 선택 DID 캐시/DNS 추가 방어는 별도 남음 |
| CALL-002~006 | `serviceCall.ts`, authority/routes, SDK. 수신 nonce·양측 PoP·초기 소비·양측 갱신 서명·같은 binding lease·terminal 회수 | 코드 연결, 서명/세대/세션/체인/nonce 변조·정족수·상충/오래된 상태·재시도·만료 단위 검증 | 실제 기기·다중 탭·백그라운드 타이머·장시간 통화 검증 대기 |
| PBX-001~003, MEDIA-001~004 | SIP 등록/수신 INVITE/ACK/CANCEL/BYE, ARI 사건 구독·재구독·채널/Call-ID/bridge 조회·기한 감시·정리 | 코드·구성 연결, 가짜 ARI와 SIP dialog·중복 사건·cleanup 재시도 검증 | Asterisk 이미지·ODBC·실제 DTLS/오디오·TURN·브라우저 검증 대기. 임의 SIP proxy/trunk/transfer는 지원하지 않고 거절 |
| LEDGER-001~003, DB-002 | worker가 outbox claim/fence/backoff/영구 실패/운영자 재처리, 서명 raw tx 영속 후 동일 hash 재조회·재전송, 영속 event cursor | 처리 코드 연결, 응답 유실·중복·claim 유실·체인 실패 단위 검증 | 실제 nonce·RPC·DB claim 경합·event consumer 재시작 대기 |
| DB-001/003/004 | `0004_worker_recovery.sql`, quota 예약/정산·중복 정산 거절, 민감 aggregate 정리·SQL 소비 namespace 보존 | SQL·호출 연결, 정적/일부 단위 검증 | 신규 PostgreSQL quota/claim 통합 시험은 작성·타입 검사만. 실제 제공자 청구 단위/가격 정산은 미구현이며 요청·초·입력 바이트를 계측 |
| STATE-003, OPS-005 | 외부 HTTPS anchor CAS, 소비 journal, 시작 시 대조 및 gate, AES-GCM 전체 구성/DB/체인 snapshot bundle | 코드 연결, anchor 충돌·암호화 변조 단위 검증, 백업/복원 자체는 정적 검사 | 독립 저장소를 실제로 별도 장애/복구 영역에 준비해야 함. anchor만 앞선 불명 commit은 자동 해제하지 않음 |
| AUTH-002, BUSINESS-001/002 | 최근 OIDC auth_time 검사, 담당/관리 permission, 계정 비활성/권한 변경·상담원 재할당 시 회수, 공식 인증·업무 소유권 | API·화면 연결, 권한·소유권·시간·공식 완료 회수 단위 검증 | 실제 IdP 설정·MFA 정책 검증 대기. 새 로그인 계정·기본 role 추가는 명시적 사전 provisioning (`provision-member.ts`로 기존 기관에 새 계정 추가 가능) |
| GOVERNANCE-001/002, OPS-002 | 최초 등록/자기 기관 긴급 정지/2-of-3 복구/새 기관키/콜센터키 활성화 API·worker, 구 VC/승인/통화 무효화 | 코드 연결, 등록 서명·중복 signer·잘못된 chain/key 거절 단위 검증 | 실제 계약/키 회전·새 trust rollout 대기. directory/policy version 변경 전체 워크플로는 미구현 |
| AI-001~004, UI-001~005/007 | 실제 remote stream→새 오디오 WS→기존 Deepgram/Anthropic, 동의·중단·늦은 결과 폐기, 별도 상태·공식 업무 | 기본 화면·provider 호출 코드 연결, 기존 revision 시험+타입 검사 | 외부 제공자는 호출하지 않음. 실제 분석 재연결/한국어 품질/보관/청구는 미검증 |
| AI-005, TEST-001~004 | 9개 한국어 개발 fixture/오프라인 규칙 평가, 새로운 DB·PBX 시험 소스, guard 회귀 | 개발 fixture 결과 9개·오탐/미탐 0, 외부 호출 0. 독립 품질 평가가 아님 | 실제 한국어 음성 holdout·사람의 독립 정답·실측 지연/자원/가격 필요 |
| OPS-001/003/004/006/007 | Asterisk realtime/WSS/ARI 설정, worker와 키 mount 분리, 서버/GCP 동일 compose, readiness와 운영 작업/사용량 조회 | 구성·웹 빌드·타입 검사 | 이미지/인증서/DB 계정/독립 anchor/실 GCP 미실행. 관리 화면의 작업·사용량·노드/gate 조회와 오프라인 manifest 작성 도구는 구현. 외부 알림 전송/이미지·실환경 증거 자동 수집은 미완성 |

## 중요한 정책과 경계

- 120초는 **attempt 생성 시점부터의 최초 연결 창**이다. 유지 허가 30초·최대 4시간은 설정 가능한 초기값이며 운영 합의·실측값이 아니다. 업무 만료/VC 만료가 더 이르면 그 시각이 상한이다.
- 양측이 현재 binding·이전 lease hash·새 nonce·순번에 각각 서명해야 갱신한다. 최초 bridge는 양측 SDK 검증 준비와 현재 권한 확인 후만 허용한다. 조회 장애는 명시적 철회가 아니다. freshness가 지나면 기본 음성/분석을 멈추고, 이전에 검증한 같은 통화에 대해 사용자가 명시한 유지 선택만 별도 허용한다. lease 자체가 만료되면 새 시도가 필요하다.
- PBX 인증서 지문은 **설정한 Asterisk 인증서에서 고정**하며 양측 브라우저의 실제 DTLS 관측과 비교한다. ARI는 채널·Call-ID·bridge를 독립 조회하지만 서버가 DTLS handshake를 직접 관측했다고 주장하지 않는다. PBX와 증거 서명자를 신뢰하는 보장이다.
- Issuer에는 기관 승인키와 PBX 증거키, Sender에는 콜센터 키, worker에는 원장 관리자/정지 키만 mount한다. worker의 endpoint 삭제에는 SIP 비밀번호 암호화 키가 필요 없다. 공동 승인자 키·Witness 키는 각각 독립 보유한다.
- anchor는 VM 백업에 넣지 않는 **별도 권위 저장소**다. 같은 서버/같은 오래된 백업으로 함께 복원하면 독립성 보장이 없다. 외부 CAS가 진행되고 DB commit이 불명확하면 gate를 닫는다. 최신 일관 이력 또는 검토한 재신뢰 절차 없이 SQL 값만 고쳐 열면 안 된다.
- 실제 DB·체인 원자 commit이나 외부 호출 exactly-once는 주장하지 않는다. 서명된 같은 tx를 재조회/재전송하고, 불명 결과·영구 실패·재처리를 구분한다.
- 백업 도구는 보호한 외부 32-byte 암호화 키, 정지된 체인의 snapshot archive, 운영자의 maintenance 확인을 요구한다. DB 읽기 snapshot/공유 잠금 중 dump·키/설정을 묶으며 chain snapshot의 실제 정합성은 이후 복원 대조로 검증한다. 기존 데이터나 실행 중 프로세스를 이 작업에서 조작하지 않았다.

## 이번 실제 검증

- `pnpm light`: **34개 파일·148개 테스트 통과**. 원본 출력·변경 소스 hash는 [이번 결과](../artifacts/product-connection-20261027.json)에 보존한다. 초기 실패(인증 HEAD 중복, 오프라인 mock 경계/기대값, 새 도구 타입 오류)는 수정 후 재검사했다. 실패 시험을 삭제하거나 network guard를 완화하지 않았다.
- `pnpm exec tsc -p services/api/tsconfig.runtime.json --noEmit`: 성공. Dockerfile의 런타임 검사는 unit fixture를 가져오지 않는 이 설정을 사용한다. 이미지 build는 실행하지 않았다.
- `pnpm --filter @callsign/web build`: 성공. 브라우저에서 Node `punycode`가 빠지던 경고 원인을 기존 JSON 해석기의 Unicode 연산 대체로 수정했다. 기존 큰 chunk·효과 없는 동적 import 경고는 남는다.
- `pnpm exec tsx scripts/evaluate-risk.ts`: 개발 fixture 9개, 오탐 0·미탐 0, provider 호출 0. 실제 모델 품질·한국어 STT 품질·독립 평가 통과가 아니다.
- Compose YAML 2개(기본 서비스 정의 19개·PBX overlay 1개) 정적 파싱, `bash -n scripts/backup.sh scripts/restore.sh scripts/generate-besu.sh scripts/deployment.sh`: 성공. Compose 실행·이미지 유효성·DB SQL 적용·실제 백업 성공의 증거가 아니다.
- `tests/integration/service-runtime.test.ts`, `tests/media/service-pbx.spec.ts`: 작성·타입 검사만. 기존 직접 통화 시험도 보존했다. DB/체인/Witness/PBX/TURN/OIDC/브라우저/외부 AI/GCP는 모두 미실행이다.

## 코드 미구현과 외부 검증의 구분

현재 기본 업무·승인·유지·교환기·분석 호출 코드를 연결했지만 전체 74개 요구사항의 완료 선언은 하지 않는다. 여전히 코드가 없는 항목은 정책 version/공식 directory 변경의 공동 승인 전체 흐름, 일반 계정/기본 role의 동적 생성 UI(운영자 추가 도구는 구현), 외부 알림 전송/이미지·실환경 증거 자동 수집이다. 오프라인 release manifest 작성 도구와 관리 노드 관측은 구현했다. 선택 DID 추가 방어와 native proof는 기본 서비스 밖의 별도 범위다. 제출물의 실제 영상·성능·장애·복구 수치는 실제 실행 뒤만 작성한다.

외부 설정 또는 실행이 필요한 항목은 실제 DB/LOGIN·인증서·Asterisk 빌드/ODBC driver·PBX 공개 주소/TURN·OIDC auth_time·관리자/승인자 계정·독립 anchor·STT/LLM 계정/model/보관 정책·GCP DNS/VM·실측이다. 비밀값을 채팅에 요청하지 않는다. 다음 실행 명령과 순서는 RUNBOOK에 둔다.

## 앞선 인증·조회·세션 회수 구현

| 요구 ID | 작성한 경계 | 검증·한계 |
|---|---|---|
| AUTH-002 | 일반/공식/이전 로그인 용도·발급자·대상 분리, 용도별 로그아웃·CSRF, 별도 토큰 재사용 기록 | 쿠키·용도·로그아웃 단위 시험. 주요 작업 재인증·실제 로그인/DB 남음 |
| BUSINESS-001 | `workspaceFor`가 수신자·상담원에게 접근 가능한 업무·승인·위임만 반환 | `workspace.test.ts`의 타 기관·미할당·불일치 관계 거절. 전체 역할 관리 남음 |
| CALL-006/MEDIA/AI | 세션 폐기 시 열린 웹소켓·분석 중단, 현재 DB 권한 재검사 | `session-connections.test.ts`의 시간 초과·즉시 회수·정리. 실제 통화·새 교환기 회수 남음 |
| GOVERNANCE-002 | 실제 개인키 서명과 공개키 검증으로 키 쌍 일치 확인 | `signing-key.unit.test.ts`. 실제 키 교체·체인 전이 미실행 |
| UI | 선택한 시도와 실제 연결 시도 분리, 로그아웃 후 늦은 응답 폐기 | 타입·API 도우미 단위 검사. 실제 화면·다중 탭 경합 미검증 |
| DB | `0002_session_scopes.sql`과 공통 구조 변경 적용 도구 | 작성·타입 검사만. 실제 적용/GRANT/동시성 미실행 |

## 검증 이력

| 시점·범위 | 당시 결과 | 원본 |
|---|---|---|
| 2026-10-27 서비스 확장 | 18개 파일·82개 통과 | [서비스 결과](../artifacts/master-implementation-20261027-service.json) |
| 2026-10-27 인증 경계 | 15개 파일·66개 통과 | [인증 결과](../artifacts/master-implementation-20261027-auth.json) |
| 2026-10-26 직접 통화 개발 | 10개 파일·44개 통과, 당시 웹/Compose/셸 정적 검사 | [보고서 보관본](archive/2026-10-26/FINALS-DEVELOPMENT-REPORT.md), [시험 원본](../artifacts/finals-light-results.json), [환경 요약](../artifacts/finals-validation.json) |
| 2026-09-14 초기 시청 시연 | 당시 별도 환경의 실행 결과 | [과거 시험 기록](TEST-RESULTS.md) |

각 결과는 누적 재검사 수이며 서로 더하지 않는다. 원본 기획 PPTX/PDF·영상·시험 증거는 유지한다. 기능 변경은 `7fb20f7`, `3339e90`, `3235b6d`, `ab0ec1c`, 문서는 `40d490c`부터 구분해 기록했다. 커밋·공개는 배포 성공을 뜻하지 않는다.

## 문서 관리와 다음 개발

서비스 설명은 `docs/guide/`, 요구·완료 기준은 MASTER, 진행·검증 이력은 이 문서, 실행 명령은 RUNBOOK에서 관리한다. 멘토링 질문·대회 원고는 서비스 완료와 분리하고 과거 자료에는 기준 시점을 표시한다. `finals`·형식 번호가 들어간 실제 파일명·API·설정은 호환성을 위해 보존하고 설명은 동작 이름으로 쓴다.

2026-10-27 문서 정리에서는 추적 중인 Markdown 39개를 읽고 제품 등급처럼 보이던 형식 번호를 동작 중심 이름으로 풀었다. 실제 코드의 식별값·명령은 보존하고, 초기 시연의 철회 후 통화 유지 정책과 현재 종료 목표를 구분했다. 명세의 옛 API 초안·미구현 표시를 실제 `/v3` 서버 코드와 대조했으며, 원본 시험 결과·기획서·영상은 수정하지 않았다. 상대 링크·74개 요구 ID/앵커·표·코드 구획·변경 범위를 정적으로 검사했다. 독립 문서 검토에서 수락/거절 순서·허가 만료·120초 시작 시점·제공자별 데이터 범위를 보완했다. 실제 서비스·브라우저·기능 시험을 새로 실행하지 않았다.

다음 구현은 새 화면·양측 수락/갱신 → DB/원장 작업 재처리·독립 복구 → 교환기 사건/자동 회수·배포 → 관리 재인증·권한/키 분리 → 전체 통합 시험 소스 순이다. 기존 `demo:up`은 초기 시연 초기화 도구이며 일반 재시작 명령이 아니다. 실제 실행은 별도 허가 뒤 운영 절차를 따른다.

### 이번 연결 작업의 후반 검토

보완한 경계: 예상 수신자/업무를 승인서 자체와 독립적으로 고정, 불명 POST 동일 request ID 재시도, 승인 준비 키/과제 보존, 숨긴 화면 송신 중단과 복귀 재검증, 종료 후 연결·분석 표시 제거, 공식 업무의 늦은 응답/다중 탭 로그아웃, 종료된 endpoint 자격의 재생성 거절, 소비 journal 중간 유실 검출, 다른 관리 명령 calldata의 영수증 전용 거절. worker는 체인 event 조회 장애 중에도 maintenance/cleanup을 처리한다. 공개키 기반 고정 peer·node allowlist와 제한된 RPC 설정을 추가했으나 실제 Besu 적용은 하지 않았다.

요청 한도는 1초 관측 경로에 맞춰 세션 임시 제한·인증 후 SQL 사용자/분 quota·공개 IP 제한을 분리했다. 새 PostgreSQL 시험은 분 경계·공유 예산 경합과 종료 후 SIP 자격 재생성 거절까지 포함하나 실행하지 않았다. 실제 제공자 계약 검증용 `provider-smoke.ts`는 이중 guard·작은 입력/요청/연결 한도와 비식별 결과 저장을 구현했으며 호출하지 않았다. 전체 journal의 중간 구멍/변조를 검사한 뒤 복원 gate를 열고, 기간이 지난 신규 승인 영수증은 식별 범위·내용 hash만 남긴다.

API/worker 저장소의 SQL statement timeout 5초·lock timeout 2초와 제한된 연결 pool을 설정했다. 이는 초기 운영 제한이며 실제 DB 경합/장시간 작업에 맞는 조정 검증은 남아 있다. `provider-smoke.ts` 및 새 PG 5개 시험은 소스/타입 검사만 수행했다.

운영 경로 정합성도 보완했다. 호스트에 내부 DB/RPC를 공개하지 않은 구성에서 관리 CLI를 실행할 수 있도록 명시적 operations profile의 migration-runner/registry-deployer를 추가했다. 일반 기동에는 포함하지 않고 자격·mount를 제한했다. app runtime과 web pin 빌드 stage를 분리해 최초 계약 배포/trust 생성의 순환 의존을 제거했다. 실제 이미지/컨테이너 실행은 하지 않았다. Compose 변수의 `.env.example` 누락 회귀도 검사한다.

실행 허가 후의 검증도 내부망에서 수행할 수 있도록 별도 validation profile의 test-runner를 구성했다. TEST_DATABASE_URL만 사용하고 기본 운영 DB 자격/키를 전달하지 않는다. 실제 시험 DB·컨테이너 기동이나 시험 실행은 하지 않았다.
