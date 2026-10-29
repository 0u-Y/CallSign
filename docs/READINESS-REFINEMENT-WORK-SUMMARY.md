# CallSign 실행 준비 후속 작업 정리

기준일: **2026-10-29(KST)**. 이전 실행 준비 작업 이후 수행한 설정·검증 판정·재현성 보완을 정리한다. 이 문서는 피드백을 위한 요약이며 실제 서비스 기동·통합 검증 보고서는 아니다.

## 1. 작업 기준

- 확인한 HEAD: `a9d67f0b4b50a022b0e20de1e4071ec49cdcbd8a`.
- 기존 개발 결과와 이번 변경은 미커밋 worktree에 있다. HEAD만으로 현재 결과를 재현할 수 없다.
- 기존 코드·문서·사용자 변경·작업 요약·과거 시험 증거를 보존했다. stage·commit·push·배포하지 않았다.
- 기존 업무·위임·개별 승인·통화 유지 허가·PBX·AI·worker를 다시 만들지 않고, 실행 준비를 방해하는 경계와 도구를 수정했다.
- 이전42개 파일·191개 시험 결과를 복사하지 않고 이번 변경 후 검사를 수행했다.

## 2. 실제로 수정한 문제

### 2.1 수동 검증과 결과 판정의 혼동

기존 runner는 MANUAL을 PASS/FAIL과 같은 상태 축에 사용했다. 실제 수동 관측을 검토해도 통과와 실패를 명확하게 표현하기 어려웠다.

결과별·단계별 `assessment`에 다음 정보를 분리했다.

| 필드 | 값 | 의미 |
|---|---|---|
| method | automatic / manual | 검증 방식. 혼합 단계는 manual이며 개별 결과를 함께 확인 |
| execution | not-run / running / completed / blocked / skipped | 실제 실행 상태 |
| verdict | PASS / FAIL / unjudged | 판정 |
| review | required / unreviewed / reviewed | 증거 검토 상태 |

기존 `status`는 과거 도구와의 호환을 위해 유지했다. 수동 단계의 status가 MANUAL이어도 새 assessment는 검토된 PASS 또는 FAIL을 표현할 수 있다.

수동 판정에는 동일 환경 identity, 요구 ID별 실제 boolean assertion, 명시적 PASS/FAIL, 관측 시각, 출처 파일 hash와 검토자 기록을 요구한다. PASS는 요구 assertion이 모두 true여야 하고 FAIL은 적어도 하나 false여야 한다. 파일 첨부만으로 통과하지 않는다.

수동 검토는 명령을 재실행하지 않는 별도 metadata 검토 경로로 처리한다. 실행과 검토를 섞는 요청을 거절한다. 자동 실패를 수동 검토로 덮지 않는다. 검토된 수동 FAIL은 보존하지만 후속 단계의 통과 증거로 사용하지 않는다. 과거 MANUAL 파일은 수정하지 않으며, 새 판정 정보가 없으면 PASS로 추정하지 않는다.

주요 코드: [runner](../scripts/validation-runner.ts), [회귀 시험](../tests/unit/validation-runner.test.ts).

### 2.2 첫 DB 검증이 전체 서비스 설정에 묶이는 문제

기존에는 database 단계의 선행 조건으로 전체 offline PASS를 요구했다. offline에 전체 서비스 설정 검사가 포함돼 있어, DB 시험에서 쓰지 않는 OIDC·PBX·AI 등의 설정 누락이 첫 DB 검증을 막을 수 있었다.

다음 조건을 분리했다.

1. **소스 검사 통과:** light·웹 build·runtime 타입·규칙 회귀가 실제 통과했는지 확인한다.
2. **DB 단계 설정:** 별도 시험 DB·로그인·test identity·guard를 database 단계에서 검사한다.
3. **실제 DB 검증 통과:** SQL assertion이 실제 실행돼야 판정한다.
4. **전체 서비스 준비:** 전체 preflight와 후속 환경 검증을 별도로 요구한다.

전체 설정 preflight가 누락으로 BLOCKED여도, 현재 HEAD·소스·공개 파일 identity가 일치하고 소스 검사 네 항목이 통과했으며 실패가 없다면 DB의 소스 선행 조건만 충족한다. offline 종합 상태를 PASS로 바꾸거나 서비스 준비 완료로 표시하지 않는다. 오래된 증거·변경된 소스·누락 assertion·실패는 계속 거절한다.

### 2.3 재현성 hash의 누락과 비밀 파일 제외

runner의 source hash에서 일반 artifacts를 제외하면서, 실제 계약 배포에 사용하는 artifact도 식별 범위에서 빠질 수 있었다. 선택한 계약 artifact를 별도 `publicFiles` hash에 연결하고, 실제 소스 파일 목록과 hash를 `sourceFiles`로 기록하도록 수정했다. 큰 소스나 symlink는 조용히 누락하지 않고 검토를 요구한다.

기존 증거 수집기의 보호 env 제외 정규식도 수정했다. `.env.test` 등 보호 파일 이름을 제외하면서 공개 `.env.example`과 SQL 소스는 포함하는 회귀 시험을 추가했다. 루트 `keys/`, `secrets/`도 Git ignore에 추가했다.

기존 서버의 비밀값을 출력하지 않고 경로·존재·추적·ignore 여부만 확인했다. 확인한 private-looking tracked 경로는 없었고 `.env`·`.env.test`는 당시 존재하지 않았다. 이 확인은 전체 저장소 비밀 탐지나 유출 부재의 증명은 아니다.

주요 코드: [증거 수집기](../scripts/collect-evidence.ts), [비밀 경로 시험](../tests/unit/preflight.test.ts), [ignore 설정](../.gitignore).

### 2.4 입력 결정과 서버→GCP 이전의 모호함

C43개·D19개 검사를 그대로 사용자 입력 목록으로 사용하지 않도록 기존 env 설정을 다섯 결정 묶음으로 정리했다. 각 묶음의 소비 코드·형식·비밀 여부·준비 주체·선행 조건·최초 단계·미입력 영향을 RUNBOOK에 연결했다. 새로운 설정 프레임워크나 저장소를 만들지 않았다.

서버에서 GCP로 같은 배포를 이전할 때 유지할 논리 식별값·권한 이력과 바뀔 주소·인증서·설정을 구분했다. 진행 통화·브라우저 임시 키·로그인 세션·SIP 임시 자격을 이전하지 않는 절차도 명시했다. 실제 이전이나 리소스 생성은 하지 않았다.

## 3. 기존 실패 경로 검토와 이번 시험

소비/응답 유실, 정책·epoch 변경, 탭 숨김/늦은 응답, 동의 revision, worker claim 유실, anchor 불일치, trust 게시 불일치의 기존 코드·시험을 확인했다. 이미 있는 순수 보장을 중복 구현하지 않았다.

이번에 보완한 회귀는 다음 경계를 다룬다.

- 수동 검토 PASS와 FAIL을 구분하고 FAIL의 후속 통과를 거절.
- 과거 MANUAL을 통과로 추정하지 않음.
- 소스 통과와 unrelated 설정 BLOCKED를 구분하되 소스 변경은 거절.
- 실행과 metadata 검토를 섞는 요청 거절.
- 보호 env·키 경로 제외와 공개 템플릿·SQL 포함.

이 시험은 순수 로직·도구의 경계를 검증한다. 실제 PostgreSQL 잠금·commit·미디어·제공자 중단·독립 복구를 입증하지 않는다. 해당 실제 관측은 기존 통합 harness와 수동 관측 절차로 남는다.

## 4. 실제 수행한 검사와 결과

최신 결과는 [이번 offline 실행 증거](../artifacts/readiness-refinement-complete-20261029.json)를 기준으로 한다.

| 검사 | 결과 | 범위 |
|---|---|---|
| `pnpm light` | **42개 파일·193개 시험 PASS** | 소스 위생·타입·오프라인 단위 시험. worker2와 네트워크/listen 차단 유지 |
| `pnpm --filter @callsign/web build` | PASS | 웹 산출물 build; 브라우저 미기동 |
| `pnpm exec tsc -p services/api/tsconfig.runtime.json --noEmit` | PASS | API runtime 타입; 서버 미기동 |
| `node --import tsx scripts/evaluate-risk.ts` | PASS | 합성 개발 fixture의 규칙 회귀; 실제 STT/LLM 품질 아님 |
| `node --import tsx scripts/preflight.ts --phase bootstrap` | BLOCKED | 준비되지 않은 설정은 그대로 차단 |
| `preparationPlan` 로컬 dry-run | BLOCKED62·PASS14·SKIPPED1 | 전체 설정의 최신 로컬 확인; 외부 연결 없음 |
| 문서 링크·코드 구획·요구 ID | PASS | 기존 갱신 문서5개·고유 요구74개 |
| `bash -n` | PASS | deployment·backup·restore 셸 문법 |
| `git diff --check` | PASS | 변경 형식 확인 |
| source identity·기존 요약 hash 대조 | PASS | 검사 후 소스 변경 없음과 보존 대상 요약 일치 |

최종 offline 종합 결과는 **automatic / blocked / unjudged / unreviewed**다. 코드 검사의 개별 PASS를 전체 설정 또는 실환경 통과로 합산하지 않았다. 이 요약 작성 중에는 기능 검사를 다시 실행하지 않고 저장된 최신 증거를 확인했다.

전체 설정의 남은 차단은 C43개 검사(사용자/외부 설정)와 D19개 검사(이후 생성값)다. 같은 입력의 존재·상호 격리를 따로 검사하므로43종의 값이나19개 질문을 뜻하지 않는다. 실제 연결/기동 확인은 별도 SKIPPED이며 오프라인 PASS로 대체하지 않는다.

## 5. 사용자가 먼저 결정할 최대 다섯 묶음

| ID | 결정 묶음 | 필요한 결정·입력 | 최초 사용 |
|---|---|---|---|
| INPUT-01 | 배포 identity·접속 경계 | 새 배포/기존 배포 이전 구분, 기관·콜센터 URI, 배포·기관·chain ID, DNS·웹/WSS·PBX/TURN 주소 | 환경 준비·chain·media |
| INPUT-02 | 계정·공동 승인 주체 | 일반/공식 OIDC 분리, 실제 issuer/subject와 내부 역할, 승인자 공개 주소3개 | 계정 준비·auth·기관 등록 |
| INPUT-03 | DB·키·독립 복구 소유 | 역할별 LOGIN과 보호 비밀 참조, 최초 계정 파일, 역할별 키 소유자, 별도 anchor 관리자·수명 | 첫 database에는 시험 owner/auth URL만 필수. 나머지는 해당 단계 |
| INPUT-04 | 실행물·미디어 구성 | 검토 이미지·Asterisk/ODBC 모듈, TLS/DTLS/CA와 보호 ARI/PBX 설정 | 실제 실행 환경 준비·PBX |
| INPUT-05 | 분석 제공자·보관·예산 | 모델·보호 API key 참조, 동의받은 소량 입력, 제공자 보관 조건·시험 예산 | provider·실제 분석 |

키·비밀번호·토큰 원문은 채팅으로 요구하지 않는다. 기존 서버 자료에서 읽기 전용으로 확인할 것은 코드/lockfile/SQL/artifact와 hash, Compose 내부 주소, 파일 경로·권한·ignore 여부다. 외부 계정/실제 DNS/기관 식별값/승인자 주소/이미지 digest/계약 주소는 만들어 넣지 않는다.

안전한 내부 기본값으로 제시한 ARI `https://asterisk:8089`와 PBX IPv4 `10.205.0.20`은 저장소 Compose에 근거한다. 실제 연결 성공의 증거는 아니며 다른 network를 쓰면 관련 설정도 함께 검토한다.

## 6. 이후 준비·실행에서 확보되는 값

- 역할키·공개 manifest: 승인된 키 준비와 각 소유자의 보호 보관 후 생성.
- genesis·계약 metadata/code hash: 승인된 네트워크 준비·배포 후 생성.
- PBX 공개 인증서·trust/pin: 인증서 준비와 실제 deployment 확인 후 생성.
- 이미지 digest·릴리스 증거: 실제 검토/build·검증 후 확보. 웹 이미지는 trust hash를 고정한 뒤 build.
- GCP 전용 VM/network/firewall·서비스 계정 참조: 이전 결정 후 준비. 서버의 첫 DB 검증에는 필요하지 않음.

이 값들을 지금 사용자에게 추측해 입력하라고 요구하지 않는다.

## 7. 첫 실환경 DB 검증의 정확한 조건

1. 사용자에게서 해당 범주 실행을 별도로 승인받는다.
2. 기존 운영 서비스와 다른 `callsign_test_*` DB를 준비하고0000~0005 migration과 최소권한 GRANT를 적용한다. 이 작업은 이번에 수행하지 않았다.
3. `TEST_DATABASE_URL`은 시험 owner, `TEST_AUTH_DATABASE_URL`은 같은 시험 DB의 다른 auth LOGIN을 사용한다. 운영 DB URL을 재사용하지 않는다.
4. 검토한 환경 JSON의 environmentId/deploymentId가 `test:`로 시작하고 보호 env의 DEPLOYMENT_ID와 일치해야 한다.
5. 현재 소스의 light·웹 build·runtime 타입·규칙 회귀가 실제 통과한 최근 증거가 필요하다. HEAD·소스·공개 파일 identity가 바뀌면 다시 검사한다.
6. AI·OIDC·PBX·기관 등록·전체 trust 준비를 DB 경계 시험의 선행 조건으로 추가하지 않는다.

다음은 **미래 실행용**이다. TEST_ENV_JSON과 TEST_ENV는 실제 검토한 파일 경로로 바꾼다. 보호 파일은0600으로 보관하며 실행 허용 플래그를 그 안에 넣지 않는다.

```sh
# 현재 허용 범위의 소스 검사
pnpm validate --stage offline --environment TEST_ENV_JSON --env-file TEST_ENV --output artifacts/NEW-SOURCE.json --execute
# DB 준비와 별도 통합 실행 승인 이후에만 사용
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm validate --stage database --environment TEST_ENV_JSON --env-file TEST_ENV --prerequisite artifacts/NEW-SOURCE.json --output artifacts/NEW-DATABASE.json --execute
```

runner는 DB 기동·생성·migration을 자동 수행하지 않는다. 기대 산출물은 단계 JSON·진행 파일·고정 시험 sidecar다. 실제 SQL assertion이 모두 실행돼야 한다. skip·미실행·권한 과다·migration hash 불일치·guard/identity 불일치·실패·timeout이면 통과로 판정하지 않는다.

## 8. 서버에서 GCP로 같은 배포를 이전할 때

| 구분 | 처리 |
|---|---|
| 유지할 값 | 기관/콜센터 논리 URI·기관 ID·chain/genesis·registry·epoch·키 세대·소비/감사 이력 |
| 변경 검토할 값 | IP·경로·TLS·OIDC callback·TURN 등 환경 설정 |
| 재신뢰 검토가 필요한 변경 | URI·등록 키·계약·정책·PBX fingerprint 변경 시 공동 절차와 trust/pin·서명 범위 갱신 |
| 이전하지 않을 실행 상태 | 진행 통화·브라우저 임시 개인키·로그인 세션·SIP 임시 자격. 회수 후 새 로그인/새 통화 시도 |
| 다시 검증할 내용 | OIDC·최소권한·Witness/freshness·TLS/DTLS/TURN·양방향 음성·철회·anchor·재시작 |

독립 anchor를 서비스 DB와 함께 과거로 복원하지 않는다. 복원 DB 이력과 최신 anchor가 다르면 gate를 닫는다. 소프트웨어 rollback이 옛 epoch·키·소비된 승인을 되살리는 절차가 되어서는 안 된다. 실제 GCP 변경·백업/복원은 하지 않았다.

## 9. 미커밋 상태와 재현성

이번 checkpoint 작성 시 **tracked 변경79개·untracked 소스/문서89개**를 분리해 기록했다. 이는 이번에 새로 만든 파일 수가 아니라 기존 작업까지 포함한 당시 worktree 집계다. 이 요약은 그 뒤 작성했으므로 해당 집계에 포함되지 않는다.

코드 checkpoint에는 tracked 수정과 untracked 앱/서비스/프로토콜/verifier/계약/시험/SQL/준비 도구/설정 템플릿, package manifest·lockfile·workspace·Dockerfile·Compose·계약 artifact와 검토 hash가 필요하다.

개인키·보호 env·브라우저 storage·원음/전사·DB/chain volume·임시 build/cache는 코드 checkpoint에서 제외하고 별도 보호 정책을 따른다. 기존 증거는 보존한다. 이번에 파일을 stage하거나 commit하지 않았다.

검사한 소스 집합 hash는 `bc2113420c8896839a869b65766ed5fc8a5d2307103eade7d2baff8a32c4a08e`다. sourceFiles는 문서·일반 생성 증거·비밀값 전체를 포함하지 않으며 선택 계약 artifact는 별도 publicFiles로 결합한다. HEAD 또는 이 hash 하나만으로 전체 배포를 재현할 수 없다. 실제 이미지·환경·contract/trust·DB 이력·독립 anchor 상태와 운영 기록도 필요하다.

## 10. 남은 범위와 실행 제한

코드 검사 통과와 설정 준비 완료, 실제 환경 검증 통과를 구분한다. 실제 PostgreSQL 원자성·권한, Besu/QBFT·Witness, OIDC·PBX/TURN·브라우저/음성, STT/LLM·한국어 품질·비용, 재시작·독립 복구·GCP는 여전히 검증 대기다. 일부 전체 장애·실측 수집·복구 관측은 자동화되지 않은 수동 절차다.

DB·노드·서비스·컨테이너·브라우저·마이크를 기동하지 않았다. 외부 AI·클라우드·실제 키 생성·migration·계약 배포·seed·부하/장애·실제 백업/복원도 수행하지 않았다. guard 완화·commit·push·배포는 하지 않았다.

다음에 필요한 것은 새 기능 확대보다 실제 배포 결정을 채우고, 승인된 격리 환경에서 첫 DB 검증부터 증거를 얻는 일이다. 이번 결과는 그 경로를 준비한 것이며 실제 서비스 성공을 선언한 것이 아니다.

## 11. 상세 근거

- [최신 진행 기록](FINALS-IMPLEMENTATION-PLAN.md#readiness-refinement-20261029)
- [MASTER 명세](MASTER-DEVELOPMENT-SPEC.md), [RUNBOOK](RUNBOOK.md#실행-전-정합성-보완--2026-10-29-후속)
- [알려진 한계](KNOWN-LIMITATIONS.md), [서비스 가이드 현황](guide/05-IMPLEMENTATION-STATUS.md)
- [이번 offline 검사 원본](../artifacts/readiness-refinement-complete-20261029.json)
- [worktree·설정 검사·hash·보존 확인 checkpoint](../artifacts/readiness-refinement-checkpoint-20261029.json)

이 문서는 최신 코드와 저장된 증거를 요약하며 위 원본을 덮어쓰지 않는다. 앞선 실행 준비 전체 작업과 도구 동작 이력은 [이전 요약](EXECUTION-READINESS-WORK-SUMMARY.md)에 보존했다. 이 문서 작성 자체로 실환경 검증이나 실행 승인이 추가되지 않는다.
