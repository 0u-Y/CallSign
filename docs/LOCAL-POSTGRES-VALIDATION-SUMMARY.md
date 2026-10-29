# CallSign 로컬 Git 보존·서버 자원 확인·PostgreSQL 검증 결과

기준일: **2026-10-29(KST)**. 기존 개발 결과를 로컬 Git으로 보존하고, 사용자에게 한정 허가받은 격리 PostgreSQL 검증을 수행한 결과다. 체인·통화·AI를 포함한 전체 서비스 검증 보고서는 아니다.

## 1. 결과 요약

| 구분 | 실제 결과 |
|---|---|
| Git 보존 | 관련 구현·설정·시험·문서·검증 결과를 로컬3개 커밋으로 보존. push하지 않음 |
| 서버 자원 | 관측 당시 CPU24개·load 약1.0·available memory 약40GiB·디스크 여유534GiB. swap 사용은 있었지만 짧은 관측에서 추가 활동 없음 |
| DB 실행 | 이미 있던 PostgreSQL17.6 이미지로 작업 전용 컨테이너/DB/역할 준비. 기존 PostgreSQL을 사용하지 않음 |
| 실제 DB 시험 | **4개 파일·15개 시험 PASS, FAIL0·pending/skip0** |
| 재실행 | 수정 커밋 기준 같은 DB에서 다시15개 모두 PASS. 시험 수를30개로 합산하지 않음 |
| 최종 소스 검사 | **42개 파일·193개 시험 PASS**, 웹 build·API runtime 타입·규칙 회귀 PASS |
| 전체 설정 검사 | BLOCKED. 코드 검사와 실제 DB 통과가 전체 배포 준비를 뜻하지 않음 |
| 정리 | 이번 DB 컨테이너·네트워크·보호 임시 자격 파일 모두 제거 |
| 미실행 | 체인/Witness·PBX/TURN·OIDC·API/웹 서버·브라우저/마이크·외부 AI·독립 복구·GCP |

## 2. Git checkpoint와 시험 기준

시작 HEAD는 `a9d67f0b4b50a022b0e20de1e4071ec49cdcbd8a`였다. 당시 미커밋 결과를 검토하고 다음 커밋으로 보존했다.

| 커밋 | 메시지 | 보존 범위 |
|---|---|---|
| `819a825` | Complete service authorization and prepare guarded validation | 기존 서비스 구현·설정·시험·문서와 실행 준비 결과201개 파일을 일관된 checkpoint로 보존 |
| `7c1df4f` | Validate PostgreSQL boundaries and isolate integration fixtures | 실제 DB 시험에서 발견한 fixture 결함 수정, 실제 권한 assertion, 자원·실패/통과 기록 |
| `ea55736` | Record PostgreSQL verification and owned resource cleanup | 재실행 결과와 자원 정리·제한 시간 이탈 기록 |

현재 확인한 HEAD는 `ea557367b4e423ace138c79f2950c82a72cfa68a`다. 실제 DB 재검증은 `7c1df4f9bec9730574c8bd0c6e6ff97a6bf3a32d`에서 수행했고, 마지막 커밋 뒤 소스 검사는 `ea55736`에서 새로 수행했다. 두 실행의 실행 소스 hash는 동일했다.

```text
6e6023c2243505174bedef8629b2bfa83af6e9707b8e7e2f18532052c93d41b2
```

이 hash는 증거 도구가 선택한 소스 집합의 식별값이다. 전체 배포·DB 상태·개인키·문서를 모두 포함하지 않는다. DB 시험 당시 HEAD와 결과 기록 커밋의 시점을 혼동하지 않는다.

### 포함·제외 검토

기존 staging은 없었다. 검토한 경로를 명시적으로 선택했으며 `git add .`를 사용하지 않았다. 프로젝트 구현과 관련 없는 사용자 파일을 정리하거나 기존 변경을 초기화하지 않았다.

비밀 env·개인키·토큰·DB/chain 데이터·원음/전사·브라우저 세션·임시 cache는 커밋하지 않았다. staged 대상의 비밀 의심 패턴을 검사했고, 후속 증거는 실제 시험 자격값과도 대조했다. 이 점검이 포괄적인 비밀 탐지나 유출 부재의 증명은 아니다.

기존 진행 포인터14개는 디스크에 보존하고 첫 checkpoint에서 제외했다. 이후 생성된 진행 포인터와 최종 커밋 뒤 소스 검사 증거도 생성물로 남겼다. 기존 사용자 staging을 해제하거나 hook을 우회하지 않았다. 과거 요약의 Markdown 줄바꿈/EOF 공백은 원문 보존을 위해 유지했다.

이 요약 파일은 사용자의 별도 요청으로 마지막 검사 뒤 작성했으며 아직 커밋하지 않았다.

## 3. 서버 자원과 실행 판단

다음은 **시험 전 관측값**이며 장비의 지속 성능이나 SLA가 아니다.

| 항목 | 관측·판단 |
|---|---|
| CPU | 사용 가능24개, load average 약0.99/0.94/0.96 |
| 메모리 | total63367MiB, available41663MiB |
| swap | 사용7804MiB. vmstat의 부팅 이후 평균 행과 현재 구간을 구분했고, 후속 짧은 구간의 si/so는0 |
| 디스크 | 저장소·임시 파일이 있는 filesystem의 여유534GiB |
| Docker | 이미 실행 중. daemon을 새로 시작하지 않음 |
| 로컬 이미지 | `postgres:17.6-alpine`이 이미 존재. 다운로드/build 없이 실제 로컬 image ID 사용 |
| 호스트 PostgreSQL | 확인한 표준 경로와 PATH에서 필요한 바이너리를 찾지 못해 컨테이너 방식 선택 |
| 기존 작업 | 프로세스 이름·RSS·CPU 및 컨테이너 통계만 조회. 기존 서비스 인자·환경변수·비밀값을 출력하거나 서비스를 변경하지 않음 |

DB에는 CPU1개·메모리512MiB·추가 swap 사용 금지·pids128 제한을 적용했다. 데이터는256MiB tmpfs, shared_buffers32MB, work_mem2MB, max_connections40으로 제한했다.

처음에는 시험 프로세스 합산 RSS1GiB를 예산으로 잡았다. 실제 소스 타입 검사가 이를 넘자 감시기가 중단했고 해당 실행을 실패로 보존했다. available memory가 여전히 약40GiB이고 swap 악화가 없음을 확인한 뒤 시험 예산을2GiB로 조정했다. DB와 합쳐2.5GiB 이내의 예산이며 기존 작업용 available8GiB 이상을 남기는 중단 조건을 유지했다.

최종 재실행에서 소스 검사 프로세스 트리 peak RSS는1195476KiB(약1167MiB), DB 시험 프로세스 트리는607484KiB(약593MiB)였다. DB의 정리 직전 사용량은70.65MiB였다. 이 값은 해당 관측의 범위이며 전체 실행의 보편적인 최소 사양은 아니다.

## 4. DB 격리·준비·감시

- 이번 작업만의 `callsign_test_*` DB 이름, 컨테이너/네트워크 이름과 생성 label을 사용했다.
- 별도 bridge와 loopback 임의 포트로 연결했다. 외부 인터페이스에 DB 포트를 공개하지 않았다.
- 기존 DB·volume·네트워크를 시험 대상으로 사용하지 않았다.
- 시험 비밀번호만 생성해0700 임시 디렉터리의0600 보호 파일에 보관했다. 기관·콜센터·Witness 등 실제 서비스 서명키는 생성하지 않았다.
- 실제0000~0005 migration과 기존 LOGIN provisioning SQL을 적용했다. migration owner와 별도 auth LOGIN을 사용했다.
- AI·OIDC·PBX·기관 등록·실제 체인 설정을 DB 시험의 선행 조건으로 요구하지 않았다.
- 기존 database runner·통합 시험을 사용했다. worker는1개지만 `Promise.all`과 독립 SQL 연결의 경합은 유지했다.
- available memory·swap 활동·이번 시험 자식들의 RSS·시간을 감시했다. 중단 대상은 이번 작업이 만든 프로세스/DB로 한정했다.

사용한 PostgreSQL 로컬 이미지 식별값은 다음과 같다. 이것은 새 이미지 build나 registry 조회 결과가 아니다.

```text
sha256:d741b376874687de90374fd34f55c6b2760e8f7bd7e4ae5cd47f50757fc08cf8
```

첫 준비에서 Docker internal network의 host port mapping이 생성되지 않았다. 해당 생성 자원만 제거하고 별도 bridge(no IP masquerade)와 loopback 포트 방식으로 바꿨다. 초기 readiness 문제 이후에는 TCP readiness를 확인했다. 이 준비 실패를 DB assertion 통과로 처리하지 않았다.

## 5. 발견한 실패와 실제 수정

### 5.1 로그인 세션 fixture의 OIDC 문맥 누락

첫 DB 시험은15개 중14개가 통과했고, 계정 재활성화 시험의 work 세션 INSERT가 `sessions_oidc_context_required` 제약조건에 걸렸다.

원인은 시험 fixture가 issuer/client/audience/authenticated_at을 제공하지 않은 것이었다. DB 제약조건을 유지하고 fixture에 필요한 문맥을 추가했다. 오류를 catch해 성공으로 바꾸거나 인증 경계를 완화하지 않았다.

### 5.2 남은 outbox가 다음 worker 시험에 섞임

같은 DB 재실행에서 worker가 이전 retry fixture의 pending outbox를 가져왔다. 시험이 자신이 방금 넣은 작업만 있다고 가정했고, 일부 fixture가 만든 후속 작업을 정리하지 않았기 때문이다.

생산 worker의 global claim 규칙은 그대로 두었다. 각 fixture가 만든 기관/작업의 outbox를 `finally`에서 삭제하고, signer 시험도 실패 시 자체 lease/outbox를 정리하도록 수정했다. 실패 당시 큐 관측과 시험 결과를 보존했으며 다른 기관/기존 서비스의 작업을 삭제하지 않았다.

새 시험 DB에서 통과한 뒤 같은 DB를 다시 실행해15개 전부 통과했고, 남은 pending/processing 작업이0개임을 확인했다.

### 5.3 실제 LOGIN의 금지 SQL 확인

기존 `has_table_privilege` 조회에 더해 auth LOGIN으로 다음을 직접 검사했다.

- users SELECT와 조건이 false인 session DELETE는 실행 가능.
- users UPDATE와 issuer 상태 UPDATE는 조건이 false여도 SQLSTATE42501로 거절.

전체 production 역할의 모든 SQL을 검사한 것은 아니다. 확인한 실제 auth LOGIN 경계와 다른 역할의 준비 사실을 구분한다.

주요 수정 파일:

- [실제 DB 서비스 시험](../tests/integration/service-runtime.test.ts)
- [migration·최소권한 시험](../tests/integration/database-readiness.test.ts)

## 6. 실제 검증 결과

### PostgreSQL

기존 database runner가 다음4개 파일을 실행했다.

- `tests/integration/finals-store.test.ts`
- `tests/integration/finals-session-scopes.test.ts`
- `tests/integration/service-runtime.test.ts`
- `tests/integration/database-readiness.test.ts`

최종 결과는 **15 PASS·0 FAIL·0 pending/skip**이다. 같은 DB의 재실행에서도 같은 결과가 나왔다. 과거 실패와 통과를 합산해 시험 개수나 성공률을 만들지 않았다.

확인한 범위는 실제 독립 SQL 연결의 소비 경합·같은 binding 결과 복구·다른 binding 거절, commit 후 응답 유실과 다른 연결의 복구, quota 예약/정산, worker claim/만료·서명자 lease, 계정/세션 회수, migration source hash와 auth LOGIN의 실제 허용·거절 SQL이다. 순수 fake 시험으로 DB 경합을 대체하지 않았다.

### 최종 HEAD의 소스 검사

최종 커밋 뒤 새로운 offline 증거를 확보했다.

| 검사 | 실제 결과 |
|---|---|
| `pnpm light` | **42개 파일·193개 시험 PASS** |
| 웹 build | PASS |
| API runtime 타입 검사 | PASS |
| 합성 fixture 규칙 회귀 | PASS; 실제 제공자/한국어 음성 품질 평가는 아님 |
| bootstrap preflight | BLOCKED; 전체 설정 준비와 소스 통과를 구분 |
| 문서 링크/코드 구획·`git diff --check` | PASS |

DB 결과의 assessment는 `automatic / completed / PASS / unreviewed`다. 전체 서비스가 검증됐다는 의미가 아니다. offline 종합 상태는 설정 누락 때문에 BLOCKED이며 개별 코드 검사 PASS와 별개다.

## 7. 자원 정리와 시간 제한

증거를 먼저 보존하고 생성 label/identity를 대조한 뒤 이번 컨테이너·네트워크만 제거했다. protected 임시 자격 파일과 작업 전용 임시 도구도 제거했다. tmpfs 데이터는 컨테이너와 함께 제거됐으며 별도 영속 volume은 만들지 않았다.

최종 확인에서 이번 label의 남은 컨테이너와 네트워크는 없었다. 기존 서비스 중단, 기존 DB 수정, 전역 prune, 기존 volume 삭제, 시스템 swap/메모리 설정 변경은 하지 않았다.

첫 DB 정리는299초, 두 번째 DB는304초였다. **두 번째 정리는5분 목표를4초 넘겼다.** 이 이탈을 기록했으며 다음 실행에서는 정리 시간을 deadline 안에 포함할 여유가 필요하다. 시험 프로세스 자체의 최종 DB 실행은 약3초였다.

## 8. 아직 확인하지 않은 것

이번 DB는 PostgreSQL17.6의 tmpfs 데이터 환경이다. 영속 disk·전원 손실·실제 백업/복원 성공의 증거가 아니다. 일부 SQL 복구 시험의 anchor는 메모리 fixture이며 독립 HTTPS anchor를 실제 검증한 것이 아니다.

다음은 계속 미실행이다.

- Besu/QBFT·Witness와 실제 계약 연동·장애 내성
- PBX/TURN·IdP·API/웹 서버·브라우저·실제 양방향 음성
- 외부 STT/LLM·한국어 품질·비용·실제 동의 중단
- 독립 anchor·일관 백업/복원·GCP 이전
- 부하·장시간·실측 성능 목표 판정

따라서 이번 결과는 **선택된 PostgreSQL 통합 보장의 실제 통과**다. 전체 서비스·블록체인·통화 안전성 검증으로 확대하지 않는다.

이번 DB 검증을 마무리하는 데 추가 사용자 입력은 없다. 후속 단계에는 실행 장비·허용 범위와 그 단계에서 필요한 공개 설정/보호 자격 참조가 필요하다. 비밀값 원문을 채팅으로 요청하지 않는다. 이전 한정 DB 허가는 이후 세션의 상시 기동 허가가 아니다.

## 9. 원본 증거와 기준 문서

- [서버 자원·준비/실패·checkpoint 기록](../artifacts/local-postgres-checkpoint-20261029.json)
- [최종 DB 결과와 정리 확인](../artifacts/local-postgres-result-20261029.json)
- [수정 커밋 기준 DB runner 결과](../artifacts/db-verification-postcommit-callsign_test_59dafb2dfb.json)
- [DB assertion 원본 보고서](../artifacts/db-verification-postcommit-callsign_test_59dafb2dfb.json.database.json)
- [최종 HEAD 소스 검사](../artifacts/local-checkpoint-source-ea55736-20261029.json)
- [개발·검증 진행 기록](FINALS-IMPLEMENTATION-PLAN.md#postgres-validation-20261029)
- [실행·정리 RUNBOOK](RUNBOOK.md#자원-제한-postgresql-검증-실측-절차)
- [MASTER 요구사항](MASTER-DEVELOPMENT-SPEC.md), [알려진 한계](KNOWN-LIMITATIONS.md)

이 문서는 위 증거를 확인해 작성한 전달용 요약이다. 기존 증거를 덮어쓰지 않았고, 문서 작성을 위해 서비스나 시험을 새로 실행하지 않았다.
