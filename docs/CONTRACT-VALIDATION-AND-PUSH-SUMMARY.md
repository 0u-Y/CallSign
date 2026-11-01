# CallSign 커밋 정리·계약 실행·원격 게시 결과

> 기록 범위: 이 문서는 제목 아래 날짜의 작업을 정리한 과거 기록이며, 구현 커밋과 별도의 문서 보존 커밋으로 관리한다. 시험 수·미실행 항목·미커밋 표시는 당시 기준이다. 최신 상태는 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)을 따른다.

기준일: **2026-10-30(KST)**. 기존 개발 결과의 Git 이력을 정리하고, 스마트컨트랙트의 권한·서명·상태 전이를 로컬 EVM에서 실제 실행한 뒤 일반 push와 GitHub Actions 결과까지 확인한 작업 요약이다.

## 1. 최종 결과

| 항목 | 결과 |
|---|---|
| 저장소·branch | [0u-Y/CallSign](https://github.com/0u-Y/CallSign) · `main` |
| 최종 commit | `763850104c7bfde986eb63e8517f99677b5f1a07` |
| Push | 일반 push 완료. push 후 원격 SHA와 로컬 SHA 일치 확인 |
| 계약 시험 | **21 PASS · 0 FAIL · 0 SKIP** |
| 제한 fuzz | seed `0x20261030`, 32회, 회당2개 성공 전이·총64개 configuration 변경 |
| 최신 light | **43개 파일·195개 시험 PASS** |
| 웹 build·API runtime 타입 | PASS |
| 최종 GitHub Actions | [성공한 실행](https://github.com/0u-Y/CallSign/actions/runs/40904534820) |
| 전체 서비스 검증 | 미완료. 로컬 EVM 통과를 Besu/QBFT·Witness·통화·배포 성공으로 해석하지 않음 |

## 2. 기존 작업을 보존한 방법

시작 시 HEAD는 `ea557367b4e423ace138c79f2950c82a72cfa68a`였고 branch는 main, upstream은 origin/main이었다. fetch 결과 원격은 `a9d67f0`까지였으며 로컬3개 커밋은 원격에 포함되지 않았다. 기존 staging은 없었다.

다음을 보존한 뒤 미공개 이력만 재구성했다.

- `backup/pre-contract-audit-20261030` 로컬 ref에 원본 tip 보존.
- 미추적29개 파일의 보호된 로컬 사본과 hash 목록 보존.
- 기존 사용자 변경·기획서·시험 결과·작업 요약을 삭제하거나 덮어쓰지 않음.
- 과거 증거에 기록된 원래 HEAD·시각·결과를 수정하지 않음.

재구성한 `75d245f`와 원본 `ea55736`의 Git tree가 정확히 같음을 확인했다. 이후 계약 검증 관련 수정은 별도 커밋으로 추가했다. 공개된 `a9d67f0` 이하 이력은 재작성하지 않았고 force push하지 않았다. 복구용 backup ref는 원격에 게시하지 않았다.

protocol→API→web과 준비/배포 시험의 의존성이 연결되어 있으므로 실행 코드·시험·설정은 함께 유지했다. 대신 증거와 문서를 분리해, 원래201개 파일 checkpoint의 서로 다른 책임이 한 커밋에 모두 섞이지 않도록 정리했다.

## 3. 최종 커밋 구성

| 커밋 | 영어 한 줄 메시지 | 주요 변경 |
|---|---|---|
| `c357f38` | Connect delegated calls with durable authority and guarded operations | 기존 서비스 권한·통화·영속 처리·실행 준비 코드와 관련 시험/설정 |
| `4fdb828` | Preserve offline and PostgreSQL validation evidence | 기존 오프라인/실제 PostgreSQL 증거 원문 |
| `75d245f` | Document service boundaries and reproducible validation procedures | 서비스 구조·신뢰 경계·운영·검증 문서 |
| `d673c9a` | Exercise registry quorum, replay, and application signature interoperability | 계약 보안 시험·실제 앱과 EVM의 호환성 검증 |
| `dccca63` | Record local EVM security coverage and preserve validation provenance | 실행 결과·실패 이력·도구/소스 식별값·기존 작업 요약 보존 |
| `7638501` | Remove ripgrep dependency from offline source checks | 첫 push에서 발견한 CI 도구 의존성 수정·회귀 시험 |

직전 로컬3개 커밋 `819a825`·`7c1df4f`·`ea55736`의 최종 파일 내용을 앞의3개 재구성 커밋에 보존했다. 원본과의 대응은 [진행 기록](FINALS-IMPLEMENTATION-PLAN.md#contract-validation-20261030)에 있다.

## 4. 계약 실행 환경

기존 시험10개를 먼저 실행해 모두 통과하는지 확인했다. 이후 필요한 보안 경계를 보강하고 중복 상속 시험 실행을 제거해 최종21개 시험을 실행했다. 이전10개와 최종21개를 합산하지 않았다.

| 항목 | 실제 사용·확인 |
|---|---|
| Foundry | forge1.7.1, commit `4072e48705af9d93e3c0f6e29e93b5e9a40caed8` |
| Compiler | 설치된 Solc `0.8.30+commit.73712a01.Linux.g++` |
| EVM target | cancun |
| Optimizer | 활성화, runs10000 |
| 최종 실행 제한 | threads1, 자식 address-space 상한2GiB, timeout90초 |
| 초기 서버 관측 | CPU24·load 약1.26·available41904MiB·disk533GiB |
| 네트워크·외부 실행 | FFI=false, fork/RPC 없음, compiler/dependency 다운로드 없음 |
| 키 | 공개 고정 시험키만 사용. 운영키 접근·생성 없음 |

시험은 Foundry 프로세스 내부 EVM에서 끝났다. Besu·Anvil·Witness·RPC 서버를 시작하지 않았다. 실제 체인 배포도 하지 않았다.

재현용 명령은 다음과 같으며, 이후 실행 역시 해당 범주의 허가와 설치된 도구가 필요하다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain timeout 90s pnpm test:contracts:offline
```

내부 명령은 `forge test --offline --threads 1 --fuzz-runs 32 --fuzz-seed 0x20261030`이다. 실제 검증에서는 별도 임시 output/cache 경로와2GiB 상한도 적용했다. 도구가 없는 환경에서 다운로드로 우회하는 명령이 아니다.

## 5. 실제 EVM에서 확인한 보장

| 영역 | 확인한 경계 |
|---|---|
| 공동 승인 | 등록·공동 변경·복구의0/1 서명 거절, 서로 다른 유효 승인자 정족수, 중복/미등록 서명 거절 |
| 서명 순서·추가 서명 | 기본 ServiceRegistry는 정렬을 요구하지 않으며 제공된 서명을 모두 확인. 유효2개 뒤 무효 추가 서명과 중복 서명도 거절 |
| 서명 형식 | 짧은 서명, zero 복구, 잘못된 v, high-S를 실제 상태 변경 진입점에서 거절 |
| 도메인·내용 결합 | 다른 chain·계약·실제로 등록된 다른 기관·다른 action/변경 내용·복구 전 epoch의 서명 거절. 현재 문맥의 정상 대조군은 성공 |
| nonce·경쟁 제안 | 성공 nonce 재사용과 오래된 상태/version/hash/epoch 거절. 같은 이전 상태의 경쟁 제안은 선행 변경 이후 실행되지 않으며 실패 nonce는 소비되지 않음 |
| 유효기간 | 기한 직전 수락, 동일·직후 및600초 초과 거절 |
| 정책·공식 경로 | 정책 변경은 epoch 증가와 구 위임 무효화. directory-only 변경은 기존 위임 유지. legacy 관리자+1승인자 경로의 기본 서비스 우회 거절 |
| 정지·복구·기관 경계 | 자기 기관 stopper만 단독 정지 가능, 타 기관/관리자 단독 정지 거절. 공동 복구 후 새 관리자·키·epoch 반영과 구 관리자/위임/철회 권한 부활 거절 |
| 실패 원자성 | 실패 전후 상태/nonce 보존, 실패 호출의 성공 이벤트 없음, 실패 후 올바른 요청의 실행 가능 |

기존 InstitutionRegistry는 회귀 대상이며 기본 서비스의 ServiceRegistry 정책과 구분했다. 온체인은 hash·version을 검증할 뿐 표시 문자열·질문 내용의 의미를 해석하지 않는다. 현재 directory-only 제품 범위는 서버 schema가 제한하는 `/official` 표시명 변경이다.

fuzz는 assume 없이 모든32 case에서 두 번의 configuration 변경이 성공하도록 검사했다. 성공 호출64개에는 setup 등록 호출을 포함하지 않았다. depth2는 명시적인 상태 전이 sequence이며 전체 상태 공간의 invariant 증명이 아니다.

## 6. 시험 중 발견한 문제와 수정

### 새 계약 시험의3개 실패

- Solidity memory struct 대입이 별도 경쟁 제안을 복사하지 않고 같은 객체를 가리켰다. 실제 독립 제안이 되도록 복사했다.
- 다른 기관의 정상 대조군이 전역 nonce를 먼저 소비해 원래 기관의 서명 검사가 아닌 nonce 검사에 걸렸다. 대조군 nonce를 분리했다.
- 인자가 있는 custom error를 Foundry의 exact selector 방식으로 비교해 기대 오류 매칭이 실패했다. 의도한 오류 selector를 검사하도록 수정했다.

보안 assertion을 제거하거나 계약 권한 조건을 완화하지 않았다. 수정 후 실제 상태 변경과 원자성 검사를 통과했다. TypeScript에서는 이벤트 decoder 결과가 unknown인 타입 좁히기 오류도 수정했다.

현재까지 계약 본체의 권한 조건을 바꿔야 할 결함은 확인하지 않았다. 이 사실을 모든 결함이 없다는 증명으로 표현하지 않는다.

### Push 후 CI 실패

첫 push인 `dccca63`의 [CI](https://github.com/0u-Y/CallSign/actions/runs/40903996280)는 `spawnSync rg ENOENT`로 실패했다. GitHub runner에 없는 ripgrep을 소스 검사 도구가 암묵적으로 요구하고 있었다.

시스템 패키지를 설치하는 대신 파일 열거를 Git의 NUL 구분 cached/untracked 목록으로 변경했다. 기존 conflict marker·JavaScript syntax 검사는 유지했다. PATH에 Git만 있는 실제 자식 환경에서 검사기를 실행하는 회귀 시험을 추가했다.

후속 `7638501`의 [CI](https://github.com/0u-Y/CallSign/actions/runs/40904534820)는 성공했다. 첫 실패 기록과 commit을 삭제하지 않았다.

## 7. TypeScript ↔ Solidity 호환성

같은 수동 상수를 양쪽 시험에 복사하는 방식 대신 실제 앱 코드를 연결했다.

1. `registrationTypedData`, `configurationTypedData`, `recoveryTypedData`로 EIP-712 digest와 서명을 생성했다.
2. 실제 worker의 `serviceRegistryAbi`로 등록·정책 변경·복구 calldata를 만들었다.
3. 컴파일된 계약 ABI로 재인코딩한 bytes가 worker의 bytes와 같은지 확인했다.
4. Solidity가 생성된 fixture를 읽어 실제 계약에 등록→정책 변경→정지/복구를 실행했다.
5. digest·복구 signer·정상 요청 수락과 변조 요청 거절을 확인했다.
6. 실제 ConfigurationUpdated 이벤트의 topic·indexed 기관·data를 실제 consumer ABI가 만든 bytes와 비교했다.
7. light 단위 시험은 현재 앱 함수의 출력과 fixture를 다시 비교해 변경 후 벡터가 낡는 경우를 검사한다.

벡터는 공개 고정 시험키1/2와 로컬 CREATE 주소용99 등을 사용한 **시험 데이터**다. 실제 등록 기관이나 배포 주소가 아니다. FFI·외부 RPC·운영 자격정보는 필요하지 않다.

계약 본체의 ABI·bytecode는 기존 검토 artifact와 정확히 같았다. 기존 artifact 파일 SHA-256은 다음과 같으며, 실제 배포 code hash와 혼동하지 않는다.

```text
44106b7087d542431cee1264df10d2c50d255e90ef36916090cb27db54753b23
```

계약 artifact 교체·배포·trust 전환을 수행하지 않았다. API 수정은 기존 event ABI를 export하는 데 한정됐으며 SQL/DB 실행 경로는 바꾸지 않았다. 이전 PostgreSQL15 PASS는 당시 범위 그대로이며 이번에 DB를 다시 실행한 결과가 아니다.

## 8. 검증 증거의 시점과 범위

실제 EVM 검증의 HEAD는 `d673c9a1b916a511ab6610f47e7f02697d3cad4c`다. 그 뒤 문서·증거를 기록하고 CI 검사기의 도구 의존성을 수정해 최종 HEAD가 `7638501`이 됐다. 계약 코드는 CI 수정으로 바뀌지 않았다.

| 검증 | 결과·시점 |
|---|---|
| 로컬 EVM | 최종21 PASS·FAIL/SKIP0. 원본 결과에 실제 시험 HEAD·시각·명령·도구·제한 기록 |
| 로컬 light | CI 이식성 수정 후43개 파일·195개 시험 PASS |
| 웹 build·API runtime 타입 | 이번 계약/호환성 작업에서 PASS. 이후 CI 도구 수정은 웹/API 동작을 변경하지 않음 |
| 전체 설정 preflight | 미입력 외부 설정 때문에 BLOCKED. 코드/EVM PASS와 별개 |
| 최종 GitHub Actions | 최종 SHA의 light workflow 성공 |

## 9. 남은 미실행 영역과 작업 파일

다음은 실행하지 않았다.

- Besu/QBFT·Witness·P2P·RPC/fork·실제 계약 배포
- DB 재기동과 실제 migration·독립 anchor/백업/복원
- PBX/TURN·IdP·API/웹 서버·브라우저·마이크·실제 통화
- 외부 STT/LLM·AI 품질·GCP·부하/장시간 시험

계약의 epoch·위임 무효화는 검증했지만 실제 VC·진행 통화 lease·브라우저 음성이 회수되는 전파 경로까지 확인한 것은 아니다.

작업 종료 확인 시 미커밋 항목은 `.progress.json` 생성 포인터28개뿐이었고 소스 변경이나 staging 잔여는 없었다. 포인터는 보존하되 완성된 증거와 중복되는 진행용 생성물이므로 커밋하지 않았다. 이 요약은 그 뒤 사용자의 별도 요청으로 작성했으며, 최초 작성 당시에는 미커밋 상태였다. 문서 작성 자체로 새 commit·push나 시험을 수행하지 않았다.

## 10. 주요 코드와 원본 기록

- [ServiceRegistry 보안 시험](../contracts/test/ServiceRegistrySecurity.t.sol)
- [실제 앱→EVM 호환성 시험](../contracts/test/ServiceRegistryInterop.t.sol)
- [앱 함수 기반 벡터 생성기](../scripts/contract-interop.ts)
- [벡터 회귀 시험](../tests/unit/contract-interop.test.ts)
- [공개 시험 벡터](../artifacts/contract-interop-fixture-20261030.json)
- [계약 EVM 실행 원본](../artifacts/contract-evm-results-20261030.json)
- [도구·원본 실패·파일 hash·커밋 대응](../artifacts/contract-validation-20261030.json)
- [소스 검사 원본](../artifacts/contract-source-verification-20261030.json)
- [CI 실패 원인·수정 회귀](../artifacts/ci-portability-20261030.json)
- [최신 개발·검증 기록](FINALS-IMPLEMENTATION-PLAN.md#contract-validation-20261030)
- [실행 절차](RUNBOOK.md#로컬-evm-계약-검증-2026-10-30), [MASTER 명세](MASTER-DEVELOPMENT-SPEC.md), [알려진 한계](KNOWN-LIMITATIONS.md)

로컬 EVM·소스 검사·CI 통과와 실제 분산 서비스 검증을 구분하며, 과거 시험 수나 결과를 이번 결과에 합산하지 않는다.
