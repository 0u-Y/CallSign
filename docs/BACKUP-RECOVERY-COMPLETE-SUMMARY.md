# CallSign 백업·복구 경계 개발 및 검증 종합 결과

> 기록 범위: 이 문서는 제목 아래 날짜의 작업을 정리한 과거 기록이며, 구현 커밋과 별도의 문서 보존 커밋으로 관리한다. 시험 수·미실행 항목·미커밋 표시는 당시 기준이다. 최신 상태는 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)을 따른다.

작성 기준: 2026-10-30(KST). 영속 복구 후속 작업의 구현 변경, 실제 시험, 실행 절차, 증거, 게시 상태와 남은 한계를 하나로 정리한 전달용 문서다. 별도 서비스나 새 검증 플랫폼을 만든 작업이 아니다.

**이번에 완료한 범위는 쓰기 중 백업 준비, 별도 PostgreSQL cluster 복원·최소권한 재구성, Anchor 지연 중 잠금·요청 종료 검증이다. 전체 서비스·실제 블록체인·실제 통화·외부 AI 검증 완료를 의미하지 않는다.**

이 문서는 아래 게시 상태를 확인한 뒤 사용자 요청으로 추가 작성했다. **이 MD 자체는 최초 작성 당시에는 커밋·push하지 않은 상태였다.** 문서 작성 중 서비스를 다시 기동하거나 시험을 재실행하지 않았다. 요구사항·운영 절차의 원본은 MASTER·진행표·RUNBOOK이며, 이 문서는 해당 시점의 전달용 기록이다.

## 1. 결과 요약

| 항목 | 최종 결과 | 의미 |
|---|---|---|
| 복구·DB 통합 | **5개 파일·25개 PASS**, 실패·skip 0 | 영속 복구10개와 기존 DB 회귀15개를 같은 명령에서 실제 실행 |
| 영향받은 HTTP 회귀 | **6개 PASS**, 브라우저1개 의도적 제외 | 실제 인증·세션·CSRF·SQL, 로컬 OIDC 및 외부 adapter fixture |
| light | **44개 파일·207개 PASS** | 기존 네트워크/listen 차단·worker 제한 유지 |
| API runtime 타입 검사 | **PASS** | 현재 API 소스 타입 검사 |
| 잘못된 target URL 차단 | 예상한 runner 거절 확인 | 실제 시험0개. 25개 PASS에 합산하지 않음 |
| 커밋·push | **origin/main 게시 완료** | 공개 이력 재작성·force push 없음 |
| GitHub CI | **light 성공** | 실제 복구·체인·통화를 CI에서 실행한 것은 아님 |
| 시험 자원 정리 | **완료** | 소유 컨테이너3개·volume3개·임시 데이터와 자격 제거 |

이전 작업의 22개 PASS와 이번 25개 PASS를 합산하지 않는다. 이전에는 쓰기가 멈춘 fixture와 같은 PostgreSQL cluster의 다른 DB 복원만 확인했다. 이번에는 그 시험을 회귀로 유지하면서 아래 세 경계를 추가했다.

## 2. 코드·게시·시험 소스 기준

| 구분 | 기준 |
|---|---|
| 이번 작업 시작 HEAD | `ac31f254b225813380088b12a34a78d0833bc028` |
| 코드·설정·관련 시험 커밋 | `9c764107d66e97a6b87ac7dbe7ff233580ce071d` |
| 문서·증거 및 최종 게시 커밋 | `a6e2452db2691d5102ff076ea1f23dd89761b3a4` |
| 저장소·branch | `0u-Y/CallSign`, `main` |
| 코드 커밋 메시지 | `Coordinate backup draining and fence cross-cluster restores` |
| 기록 커밋 메시지 | `Record live backup and anchor contention verification` |
| CI | [light 성공 기록](https://github.com/0u-Y/CallSign/actions/runs/41072593104) |

시험은 시작 HEAD 이후 미커밋 수정으로 실행했다. 나중에 만든 커밋을 시험 당시 HEAD로 바꾸지 않았다. 최종 복구 source259개 파일의 hash가 코드 커밋 내용과 일치함을 확인했다.

- 최종 복구 source hash: `6fff6a4f79047655a2c5e515e763beed42534befc74b21ff425b1ce2654cd931`
- HTTP 회귀 source hash: `97a5a572102d507108d88de7016bf9b6b81c41891d9bae41a056cea16d760b19`

HTTP 이후 달라진 것은 복구 시험 파일의 target/역할 URL 시작 전 guard이며 제품 코드는 동일하다. 각 실행의 소스 snapshot을 증거에 따로 보존했다. source hash는 명시한 소스 집합의 식별값이며 모든 운영 비밀값·이미지·환경까지 포함한 완전한 배포 재현 증명은 아니다.

최종 push 후 원격 SHA와 로컬 SHA의 일치를 확인했다. tracked 변경은 없었고 기존 미추적 파일32개는 제외·보존했다. 이 요약 작성으로 미추적 MD가1개 더 생긴다.

## 3. 실제 문제와 수정 내용

| 문제·누락 | 구현한 수정 | 주요 파일 | 요구 ID |
|---|---|---|---|
| 백업이 운영자의 ‘쓰기를 멈췄다’는 확인 문자열에 의존 | DB 공통 admission 상태와 shared/exclusive advisory lock으로 실제 권한 transaction·외부 CAS·commit과 snapshot을 조정 | `0006_backup_drain.sql`, `backup-drain.ts`, `backup-control.ts`, `backup-bundle.ts` | OPS-003/005·DB-001/003 |
| replica 일부만 멈추거나 새 worker claim이 유입될 수 있음 | 동일 DB 전체 replica가 읽는 draining 상태로 일반 쓰기·새 일반 claim을 차단. 기존 작업은 정리하며 안전 작업은 허용 | `finals-store.ts`, `service-worker.ts`, `ledger-events.ts`, `maintenance.ts` | OPS-003·DB-003 |
| 복구 초기화의 CAS가 snapshot fence를 빠져나갈 가능성 | recovery 최종 대조·초기 checkpoint도 같은 shared 잠금 경계에 연결 | `finals-store.ts` | STATE-003·OPS-005 |
| Anchor timeout이 통화 종료까지 차단 | 종료·동의 철회·재시작 정리를 별도 cleanup mode로 분리. 등록 권한·키·기관 상태·새 소비 권한을 변경하지 못하도록 검사 | `service-authority.ts`, `finals-model.ts`, `finals-store.ts` | CALL-002·AUTH-002·STATE-003 |
| source의 객체 소유자를 target에 재현하려는 복원 경로 | `pg_restore --no-owner`와 target의 새 owner·NOLOGIN 그룹·별도 LOGIN을 사용 | `restore-bundle.ts`, `provision-logins.sql` | OPS-005·DB-001 |
| 복원 후 source·target이 동시에 일반 쓰기를 재개할 위험 | target은 fenced로 복원. 최신 recovery 대조와 수동 source 정지 확인 뒤 명시 activate. fenced source의 일반 resume 거절 | `backup-control.ts`, `restore-bundle.ts`, `service-worker.ts` | OPS-003/005 |
| 보관된 issuer 키가 없거나 공개키와 다를 수 있음 | 인증된 archive의 키 참조를 읽고 실제 서명/검증으로 일치 확인. 누락·불일치 시 SQL 적용 전 거절 | `restore-bundle.ts`, 복구 시험 | OPS-005 |
| 다른 target을 실수로 시험 대상으로 지정할 위험 | source/target/Anchor의 loopback·시험 DB 이름 및 역할 URL 대상 일치 guard 보강 | `persistent-recovery.test.ts` | TEST-004 |

migration 실행 목록·preflight·타입 검사 대상과 기존 복구 fixture도 함께 갱신했다. 기존 실행 guard·인증·서명·journal·CAS·manifest 검증을 제거하거나 완화하지 않았다. 새 의존성·자동 failover·새 클라우드 플랫폼은 추가하지 않았다.

### 주요 변경 파일

- [DB migration](../services/api/drizzle/0006_backup_drain.sql), [공통 쓰기 경계](../services/api/src/backup-drain.ts)
- [owner 운영 명령](../scripts/backup-control.ts), [백업](../scripts/backup-bundle.ts), [복원](../scripts/restore-bundle.ts)
- [권한 저장소](../services/api/src/finals-store.ts), [서비스 권한 로직](../services/api/src/service-authority.ts), [공유 모델](../services/api/src/finals-model.ts)
- [worker](../services/api/src/service-worker.ts), [원장 사건 반영](../services/api/src/ledger-events.ts), [유지관리](../services/api/src/maintenance.ts)
- [LOGIN provisioning](../infra/deploy/provision-logins.sql), [migration 실행 도구](../scripts/migrate-finals.ts), [preflight](../scripts/preflight.ts)
- [영속 복구 시험](../tests/integration/persistent-recovery.test.ts), [DB readiness 시험](../tests/integration/database-readiness.test.ts), [가벼운 타입 검사 구성](../tsconfig.light.json)

## 4. 백업 준비·복원 상태와 정책

| 상태 | 일반 발급·소비·새 일반 claim | 종료·동의 철회·취소·철회 등 | 의미 |
|---|---|---|---|
| open | 기존 인증·권한·Anchor 조건 아래 허용 | 기존 조건 아래 허용 | 정상 source 또는 명시 활성화한 target |
| draining | 차단 | 안전 작업 허용. 권한 철회·정지는 Anchor/journal 검증 유지 | 새 유입을 막았다는 뜻이며 백업 준비 완료가 아님 |
| snapshot 배타 구간 | 빠른503 재시도 오류 | `BACKUP_SNAPSHOT_BUSY_RETRY`로 짧은 구간 재시도 요구 | exported snapshot 보호. 영구 유지보수 차단과 구분 |
| fenced | 차단 | 전환이 끝난 source 등에서는 쓰기 차단 | 일반 resume으로 해제하지 않음. target은 검증·명시 activate 필요 |

진행 중 worker claim이나 통화, 잠금 기한 초과가 있으면 백업 성공 manifest를 만들지 않는다. 준비 실패를 정상 완료로 처리하거나 claim·소비 이력을 삭제해 통과시키지 않는다. 백업만 수행한 source 재개와 실제 이전을 위한 target 활성화를 구분했다.

## 5. 쓰기 중 drain·백업 시험

실제 API 자식 프로세스2개, PostgreSQL에 저장된 worker claim, 진행 중 권한 transaction을 사용했다. live drain의 `processDurableJob`은 시험 프로세스에서 실제 worker/store 코드로 실행했다. 별도의 기존 재시작 시험에서는 실제 worker 자식 프로세스를 중단·재시작했다.

확인한 내용은 다음과 같다.

1. drain 시작 전 받아들인 권한 transaction이 shared 잠금 안에서 외부 HTTPS CAS와 DB commit을 마친다.
2. 같은 기관의 API 두 개 모두 새 발급·소비를503으로 거절하고 소비 행이 증가하지 않는다.
3. 새 일반 worker claim은 막지만 기존 claim의 완료·재시도 처리는 가능하다.
4. 종료·위임 철회·업무 취소와 cleanup을 drain 중 처리한다.
5. 준비 미완료 백업은 실패한다. 잘못된 drain token도 거절한다.
6. snapshot 배타 구간의 안전 요청은 이름이 있는 재시도 오류를 반환한다. recovery 확인도 같은 잠금 경계를 기다린다.
7. 정리 후 실제 암호화 백업을 만들고 manifest의 drain token·checkpoint와 독립 Anchor를 대조한다.
8. 단순 백업 source는 올바른 token으로 명시 재개한다. target 전환 시험에서는 source를 fenced로 유지한다.

기존 영속 복구 회귀도 실행했다. HTTPS CAS 경쟁의 단일 전진, stale·domain·인증·TLS 거절, 저장 후 응답 유실의 정확한 readback, Anchor 재시작 후 상태 보존, journal 누락·변조 및 Anchor만 전진한 경우의 차단을 포함한다.

## 6. 별도 PostgreSQL cluster 복원·최소권한 시험

source·target·Anchor를 서로 다른 PostgreSQL 프로세스·영속 volume·자격으로 실행했다. 같은 cluster에서 DB 이름만 바꾼 시험이 아니다. source 비밀번호·superuser를 target 앱에 복제하지 않았다.

| 대상 | 실제 확인 내용 |
|---|---|
| 소유권·역할 | target의 새 owner로 객체 복원, 검토된 NOLOGIN 그룹과 새 LOGIN/GRANT 적용 |
| issuer | 실제 API의 workspace·위임 발급 및 허용 SQL. journal DELETE 거절 |
| auth | 실제 최소권한 연결의 users/sessions 접근·허용 삭제. 기관 상태 UPDATE 거절 |
| worker | 실제 별도 LOGIN의 outbox 접근·claim/retry. journal DELETE 거절 |
| 공통 금지 권한 | issuer/auth/worker의 superuser·createdb·createrole 불허 |
| GRANT 누락 | role membership을 제거하면 실제 접근42501 거절. owner로 앱을 실행해 숨기지 않음 |
| migration | 복원된 적용 이력·source hash를 manifest와 대조 |
| 권한 이력 | 소비 영수증·철회 VC·계정 비활성·membership generation·epoch 보존 |
| 키 세대 | 기존 복구 회귀에서 승인 키 version·공개키 보존. 누락·잘못된 키 참조는 추가 부정 시험으로 거절 |
| 임시 상태 | sessions 제거·lease 폐기. 기존 세션·진행 통화를 자동 활성화하지 않음 |
| recovery/admission | 복원 직후 blocked/fenced. 최신 Anchor 확인과 명시 전환 전 일반 쓰기 차단 |
| 과거 백업 | target이 전진한 뒤 과거 백업을 복원하면 Anchor 불일치로 차단 |
| 잘못된 대상 | 비어 있지 않은 target 덮어쓰기 거절 |

잘못된 암호화 키, payload·manifest 변조, 파일 누락, symlink, 경로 탈출, 특수 archive entry, inventory 누락, 잘못된 GCM tag, issuer 키 파일 누락·개인키/공개키 불일치도 거절했다. 검증 실패를 사용 가능한 복원 상태로 표시하지 않는다. 기존 복구 회귀에서 새 대상의 commit된 사용자 테이블과 평문 임시 폴더 정리도 확인했다.

Source를 fenced로 만든 뒤 target만 활성화하는 순서를 시험했다. 다만 owner의 수동 source 정지 확인은 신뢰 입력이다. 원격 source의 중단을 독립적으로 증명하거나 자격이 복제된 다른 writer까지 자동 차단하는 failover 기능은 아니다.

## 7. Anchor 지연·장애·잠금 시험

실제 HTTPS Anchor 앞의 시험 proxy에서 선택한 합성 기관 요청만 지연·실패시켰다. 앱의 Anchor 검증을 항상 성공하는 함수로 바꾸지 않았다.

- 정상·제어 지연·timeout·응답 유실·접근 불가를 각각 시험했다.
- `pg_stat_activity`와 `pg_blocking_pids`로 같은 기관의 실제 행 잠금 대기를 확인했다.
- 다른 기관 요청은 진행했다. timeout 후 transaction rollback, 연결 반환과 후속 정상 요청 처리를 확인했다.
- 저장 성공 후 응답 유실은 정확한 다음 상태 readback으로 해결했다.
- HTTP 요청 취소가 즉시 서버 작업 취소를 뜻하지는 않는다. 시험의 미응답 조회는 제한된 Anchor timeout 후 rollback했다.
- Anchor 장애 뒤에도 통화 종료 정리가 가능함을 확인했다. 신규 권한 쓰기는 계속 차단한다.

| 최종 실행의 소수 요청 표본 | 관측값 |
|---|---:|
| 정상 요청 | 약53.9ms |
| 제어 지연·잠금 경쟁 전체 | 약168.0ms |
| 다른 기관 요청 | 약51.2ms |
| Anchor timeout 요청 | 약2505.7ms |
| timeout 뒤 종료 정리 | 약6.1ms |

단일 실행의 작은 표본이다. p95·SLA·부하·큰 pool 고갈 내성 또는 서비스 전체 성능으로 해석하지 않는다. 기관 행 잠금 밖으로 Anchor 조회를 옮기지 않았으며 stale 상태 수락이나 fail-open을 추가하지 않았다. 기본 Anchor timeout2.5초는 호출별 제한이며 여러 호출이 있는 전체 요청의 상한은 아니다.

## 8. 실제 구성요소와 fixture 경계

| 구성 | 실제 실행 | 대체·미검증 부분 |
|---|---|---|
| 저장소·복원 | PostgreSQL source/target/Anchor, native dump/restore, 암호화·파일 검증 | 같은 물리 서버. 전원·스토리지 내구성·GCP 이전 아님 |
| Anchor | 별도 SQL·restricted LOGIN·HTTPS·CAS·재시작 | 외부 기관 운영·독립 호스트 신뢰는 미검증 |
| 복구 API | 실제 서비스 라우트·권한 로직·SQL·gate | Actor는 명시적 합성 bearer fixture |
| HTTP 회귀 | 실제 인증·세션·CSRF·Platform/Issuer/Sender·SQL | 로컬 HTTPS OIDC와 메모리 Anchor/권한/binding fixture |
| worker | 실제 claim·lease·저장·완료·재시도, 자식 프로세스 재시작 회귀 | 원장 transaction·receipt는 adapter 표식. 실제 체인 서명·적용 횟수 아님 |
| 통화·분석 | 상태 정리와 임시 권한 폐기 | 합성 binding. PBX·RTP·실제 음성·외부 AI 미실행 |
| 키·계정 | 합성 계정·시험키·새 target LOGIN | 운영 키·실제 IdP 계정 사용 없음 |

## 9. 실행 명령과 실패 이력

아래 명령은 당시 보호된 시험 환경과 역할별 자격을 준비한 뒤 실행했다. `PROTECTED_ROOT`는 비밀값을 포함하는 임시 경로의 대체 표기다. 해당 자원은 정리했으므로 명령만 복사해 곧바로 재실행할 수는 없다. 준비 입력·운영 순서는 뒤 절에 함께 담았다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec vitest run \
  --config vitest.integration.config.ts \
  tests/integration/persistent-recovery.test.ts \
  tests/integration/service-runtime.test.ts \
  tests/integration/finals-session-scopes.test.ts \
  tests/integration/finals-store.test.ts \
  tests/integration/database-readiness.test.ts \
  --reporter=verbose --reporter=json \
  --outputFile=PROTECTED_ROOT/guarded-recovery.json

CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration CALLSIGN_HTTP_API_ONLY=true \
  pnpm exec vitest run --config vitest.http.config.ts \
  tests/integration/service-http.test.ts \
  --testNamePattern='uses real|rejects issuer|enforces CSRF|issues and consumes|requires real recent|blocks new work' \
  --reporter=verbose --reporter=json \
  --outputFile=PROTECTED_ROOT/verified-http.json

NODE_OPTIONS=--max-old-space-size=2048 pnpm evidence:collect \
  artifacts/backup-boundaries-verified-source-20261030.json light runtime
```

중간 실패는 숨기지 않았다.

- 복구 fixture의 `.intent.id` 참조 오류를 `.attempt.intentId`로 수정했다. 취소 assertion을 삭제하지 않았다.
- 최초 HTTP 명령은 보호 root 입력 누락으로 기존 guard가 거절했다. 이후 root와 API-only 모드를 명시했다.
- 키 검증의 모듈 참조, 선택적인 HTTP method 타입 등 타입 오류를 수정했다.
- 잘못된 target URL은 시험 setup 전에 거절되는 것이 기대 결과다. 해당 자식 runner의 비정상 종료를 제품 실패 또는 실행 시험 PASS 수로 혼동하지 않았다.

웹·계약 제품 코드를 바꾸지 않았으므로 이번 작업에서 브라우저·계약 전체 시험을 반복하지 않았다. 기존 결과를 이번 실행 결과로 복사하지 않았다.

## 10. 자원 예산·정리·보존

기존 로컬 `postgres:17.6-alpine` 이미지를 재사용했다. image ID는 `sha256:d741b376874687de90374fd34f55c6b2760e8f7bd7e4ae5cd47f50757fc08cf8`다. Node22.22.2·pnpm11.27.0, 기존 PostgreSQL17.6 클라이언트·tar·OpenSSL을 사용했다. 다운로드·이미지 build·시스템 패키지 설치는 하지 않았다.

| 항목 | 관측·제한 |
|---|---|
| 시작 자원 | CPU24개, available memory38118MiB, 디스크 여유507GiB |
| DB 예산 | source512MiB·target512MiB·Anchor256MiB, CPU 합계2개 |
| Node·병렬성 | heap2048MiB, integration worker1 |
| 시간 제한 | 명령240초, 백업 잠금 대기3초, Anchor 호출별2.5초 |
| 종료 자원 | available memory41121MiB, DB 메모리96.91/57.29/18.52MiB |
| Swap | 사용량13023→15182MiB. 표본 si156→28KiB/s·so0 |

호스트 전체 swap 사용 증가를 이번 시험에 귀속하거나 전 기간 활동0이라고 주장하지 않는다. 큰 부하 시험을 수행한 것이 아니다.

공유할 증거를 보존한 뒤 생성 identity·label을 대조했다. 애플리케이션 프로세스 잔존0을 확인하고 소유 컨테이너3개·named volume3개·암호화 백업·임시 평문·시험키·인증서·자격 파일·보호 임시 경로를 정리했다. 기존 서비스·DB·volume·키는 변경하지 않았고 전역 prune이나 무차별 프로세스 종료를 하지 않았다.

기존 미추적 진행 포인터28개와 사용자 요약 문서4개는 커밋하지 않고 보존했다. 공개 증거에는 비밀번호·개인키·백업 원문·DB 데이터·세션을 포함하지 않았다.

## 11. 준비·백업·복원·실패 대응 절차

아래는 현재 RUNBOOK의 해당 절차를 이 전달 문서에도 포함한 것이다. 실제 재실행 시에는 코드·RUNBOOK이 이후 변경되었는지 먼저 확인해야 한다. 환경 참조 이름은 유지하며 실제 비밀값은 싣지 않는다.

적용 코드: `0006_backup_drain`, `backup-control.ts`와 현재 backup/restore 도구. [이번 실행·관측](FINALS-IMPLEMENTATION-PLAN.md#backup-boundaries-20261030)을 따른다. 아래 명령은 **해당 인프라/복구 실행을 허가받은 대상에서만** 사용한다. 이번 소유 시험 환경은 결과 보존 후 제거하므로 해당 URL/키를 재사용하지 않는다.

### 일관성 조건과 쓰기 정책

보존 대상은 기관 권한/키·회원 세대, journal hash/소비 영수증, 철회·취소, quota와 outbox의 저장 transaction/nonce/불명 결과, migration identity다. sessions·challenge·임시 승인 요청·연결 lease·임시 PBX 자격은 복원 후 활성화하지 않는다. Anchor는 백업 대상에 포함하지 않는다. 현재 구성은 `INSTITUTION_ID`의 키·Anchor checkpoint를 검증하는 기관별 profile이다. 다기관 전체 키/Anchor manifest와 운영 키 전체 복원 보장으로 확대하지 않는다.

모든 동일 DB API/worker/event consumer/maintenance replica를 같은 migration·코드로 전환한 뒤 준비한다. 기관 권한 transaction은 DB 공통 shared advisory lock을 잡은 상태에서 CAS와 SQL commit까지 끝낸다. `drain`은 DB의 admission을 draining으로 바꾸고 즉시 반환한다. **반환값 ready=false는 준비 완료가 아니다.** 신규 일반 발급·소비·claim은 차단하고 진행 중 작업은 끝내거나 명확한 재시도 상태로 둔다. 종료·동의 철회·취소·위임 철회·긴급 정지·cleanup은 계속 허용한다. 권한을 바꾸는 철회/정지는 Anchor/journal 검증을 유지한다.

백업은 drain token을 확인하고 배타 advisory lock을 최대3초 기다린다. 잠금을 얻은 후 table SHARE lock·처리 중 claim0·대상 기관 진행 통화0·ready recovery·기관 키/Anchor 일치를 확인하고 exported snapshot을 dump한다. 잠금 대기 전에 만들어진 repeatable-read snapshot을 사용하지 않는다. 배타 구간의 새 쓰기는 `BACKUP_SNAPSHOT_BUSY_RETRY`503으로 거절하므로 안전 요청은 짧게 재시도한다. 백업 실패에 성공 manifest를 만들어서는 안 된다. 준비 실패/종료하지 않은 통화/죽은 worker/미확정 작업이 있으면 source 재개 후 기존 lease/retry 절차로 조정하고 다시 drain한다. 이력을 삭제하거나 Anchor를 되돌리지 않는다.

### 단순 백업: source를 다시 사용할 때

사전 입력은 source owner `MIGRATOR_DATABASE_URL`, `INSTITUTION_ID`, `DEPLOYMENT_ID`, 독립 Anchor URL/token, 기존 키가 있는 `FINALS_DATA_DIR`, 보호된 `BACKUP_DEPLOYMENT_ENV_PATH`, 새 `BACKUP_DIR`, 별도32바이트 `BACKUP_ENCRYPTION_KEY_PATH`다. DB URL과 키는 보호 파일/환경 참조로 전달하고 출력하지 않는다. 설치된 pg_dump/pg_restore/psql·tar가 필요하며 다운로드는 자동 수행하지 않는다.

```sh
# owner 환경과 보호된 새 DRAIN_RECORD 경로를 준비한 상태
umask 077
set -o noclobber
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node --import tsx scripts/backup-control.ts drain > "$DRAIN_RECORD"
export BACKUP_DRAIN_TOKEN="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).token)' "$DRAIN_RECORD")"
# 통화를 종료하고 진행 worker가 완료/재시도 상태로 정리되었는지 확인
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node --import tsx scripts/backup-control.ts status
BACKUP_SCOPE=application BACKUP_CONFIRMATION=QUIESCED-APPLICATION-ONLY \
  CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node --import tsx scripts/backup-bundle.ts
# 성공 manifest와 암호화 payload를 보존한 뒤, 백업만 수행하는 source를 재개
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node --import tsx scripts/backup-control.ts resume
```

`status`는 admission 상태이지 drain 완료·서비스 준비 완료 판정이 아니다. 일반 전체 백업은 기존 `full`/`MAINTENANCE-WITH-QUIESCED-CHAIN` 확인을 유지하고 별도 quiesced 체인 archive가 필요하다. 이번에는 application만 실행했다. source를 재개하면 Anchor가 전진할 수 있으므로 이 백업을 나중에 복원한 target이 최신성 불일치로 차단되는 것은 정상이다.

### 새 cluster 역할 준비와 격리 복원

source와 다른 PostgreSQL 프로세스·data volume·owner·비밀번호를 준비한다. 운영 DB나 기존 비어 있지 않은 DB를 쓰지 않는다. target owner는 새 빈 DB의 복원에만 사용한다. source LOGIN 비밀번호·superuser를 복제하지 않는다. 기존 `provision-logins.sql`에 target의 새 issuer/auth/worker/pbx 비밀번호를 보호 환경으로 제공한다. 아래 `target-owner`는 실제로 준비한 보호된 PostgreSQL service file의 이름이며 예제 비밀번호가 아니다.

```sh
# PGSERVICEFILE(0600), target-owner 및 보호 환경의 target 전용 *_DB_PASSWORD를 준비
PGSERVICE=target-owner psql -X -v ON_ERROR_STOP=1 -v restore_roles_only=true \
  -f infra/deploy/provision-logins.sql
# RESTORE_DATABASE_URL/RESTORE_DATA_DIR는 새 target. source의 MIGRATOR URL과 혼동 금지
RESTORE_CONFIRMATION=NEW-EMPTY-DATABASE-AND-DIRECTORY \
  CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node --import tsx scripts/restore-bundle.ts
```

이 옵션은 새 cluster의 알려진 NOLOGIN 그룹과 LOGIN/CONNECT만 준비한다. 기존 LOGIN/그룹이 있으면 자동 비밀번호 재설정 대신 검토를 요구한다. **복원 전에 target에 전체 migration을 적용해 테이블을 만들지 않는다.** 복원 도구는 `--no-owner`로 새 owner 소유 객체를 만들고 dump의 검토된 GRANT를 복원한다. `public.callsign_migrations`의 hash와 현재 소스가 일치하는지 기존 `migrate-finals.ts --apply`/DB readiness 시험으로 확인한다. 임의 구 migration hash를 덮어쓰지 않는다.

복원은 encrypted bundle/manifest/정확한 inventory·크기·hash·GCM·archive 및 실제 issuer 개인키/공개키 참조를 먼저 검증한다. 미준비 키를 새로 만들지 않는다. SQL commit 시 admission=fenced, recovery=blocked이며 기존 sessions/임시 연결 권한은 폐기한다. target의 issuer/auth/worker 최소권한 LOGIN으로 실제 SELECT/허용 UPDATE·sessions DELETE와 금지 journal DELETE·권한 변경 거절을 확인한다. GRANT가 누락되면42501로 차단되어야 하며 owner로 앱을 실행해 우회하지 않는다. `deployment.env.restored` 안의 source 주소·비밀번호를 target 앱 설정으로 그대로 사용하지 않는다.

### 이전 모의 시험과 실제 전환

1. source를 draining으로 유지하고 검증된 백업을 만든다. source 재개 명령을 실행하지 않는다.
2. target은 네트워크와 앱 쓰기가 격리된 fenced 상태에서 복원·역할·데이터·최신 Anchor를 대조한다. 기관별 기존 `postgresAuthorityStore.verifyRecovery`를 실행해 모든 recovery gate를 확인한다. 이는 admission을 자동 활성화하지 않는다.
3. source owner 환경에서 같은 token으로 `backup-control.ts fence`를 실행한다. 진행 중 claim/통화가 있으면 실패한다. source의 모든 writer 인스턴스를 승인된 종료 절차로 멈추고, 다른 source/구버전 writer가 같은 Anchor 자격으로 쓰지 않는지 운영자가 확인한다.
4. target owner 환경으로 명시 전환한다. target `backup-control.ts status`에서 읽은 token을 `BACKUP_DRAIN_TOKEN`에 넣고 `SOURCE_FENCE_CONFIRMATION=SOURCE-WRITERS-STOPPED-AND-FENCED` 및 기존 infrastructure guard로 `backup-control.ts activate`를 실행한다. gate가 하나라도 blocked이거나 token/확인이 없으면 활성화하지 않는다.
5. target issuer/auth/worker의 새 자격으로 API와 worker를 확인한다. source의 `resume`은 fenced 상태를 해제하지 못한다. target이 전진한 뒤 과거 source/백업을 일반 재시작으로 되살리지 않는다.

이 절차는 owner와 운영자의 올바른 source 정지 확인을 신뢰한다. 자동 failover·다른 호스트의 source 정지 증명·악의적인 DB owner/Anchor 자격 복제 방어가 아니다. 부분 전환에 실패하면 양쪽의 신규 권한 쓰기를 차단하고 최신 journal/Anchor와 승인된 현재 writer를 확인한다. 임의로 source를 다시 열거나 Anchor를 rollback하지 않는다.

### 제한된 통합 회귀의 재실행 입력

기존 `tests/integration/persistent-recovery.test.ts`를 확장했다. 별도 source/target/Anchor 시험 cluster를 먼저 준비한 뒤 실행하며, test hook이 DB/container를 자동 생성하지 않는다. `CALLSIGN_RECOVERY_ID=callsign_test_*`, 보호된 `CALLSIGN_RECOVERY_TEST_ROOT`와 그 아래 `tls.key`/`tls.crt`, `NODE_EXTRA_CA_CERTS`, 보호 `TMPDIR`가 필요하다. source는 `TEST_DATABASE_URL`/`MIGRATOR_DATABASE_URL` 및 실제 `ISSUER_DATABASE_URL`/`AUTH_DATABASE_URL`/`WORKER_DATABASE_URL`을 같은 소유 시험 DB로 지정한다. source에 migration0000..0006와 LOGIN을 준비한다. target은 다른 프로세스/volume의 `TARGET_ADMIN_DATABASE_URL`과 새 `TARGET_ISSUER_DATABASE_URL`/`TARGET_AUTH_DATABASE_URL`/`TARGET_WORKER_DATABASE_URL`을 준비하고 위 roles-only provisioning을 수행한다. 테스트의 새 DB 생성/CONNECT 부여는 시험 owner만 사용한다. 모든 대상은 loopback의 `callsign_test_*`이어야 한다.

Anchor는 별도 schema·owner `ANCHOR_ADMIN_DATABASE_URL`, SELECT/UPDATE만 허용한 `ANCHOR_DATABASE_URL`, `ANCHOR_TOKEN`, `ANCHOR_TLS_KEY_PATH`/`ANCHOR_TLS_CERT_PATH`가 필요하다. 환경 값은 보호 파일/프로세스 참조로 전달한다. 설치된 pg_dump/pg_restore/psql·tar를 사용한다. 이 시험은 source/target에서 소유 시험 DB를 추가하므로 기존 DB/volume을 지정하지 않는다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec vitest run \
  --config vitest.integration.config.ts \
  tests/integration/persistent-recovery.test.ts \
  tests/integration/service-runtime.test.ts \
  tests/integration/finals-session-scopes.test.ts \
  tests/integration/finals-store.test.ts \
  tests/integration/database-readiness.test.ts \
  --reporter=verbose --reporter=json --outputFile="$RECOVERY_REPORT"
```

테스트 child는 기존 infrastructure guard를 Anchor/backup/restore/control에 한해 명시한다. 브라우저·실제 체인·PBX·제공자를 시작하지 않는다. 순차 worker1, 소수 요청, 기존45초 lease 대기이며 소유 프로세스만 종료한다. 완료/실패 모두 이번 identity의 프로세스·DB/volume·backup·시험 자격을 증거 보존 후 정리한다.

### Anchor 지연과 요청 종료 경계

실제 HTTPS 요청의 기본 per-call timeout은2.5초, 기관 행 lock timeout은2초다. 하나의 요청이 여러 Anchor 호출을 할 수 있으므로 이를 전체 요청 상한/SLA로 해석하지 않는다. 소수 요청 시험에서 같은 기관 행 잠금 대기와 다른 기관 요청의 진행, timeout rollback/연결 반환/재시도 성공을 확인했다. 연결을 취소해도 서버 작업은 즉시 중지된다고 보장하지 않는다. 시험의 미응답 조회는2.5초 후 rollback했고 이미 CAS가 전진한 경우에는 기존 exact-readback/결과 불명 gate 정책이 적용된다. 실제 대규모 pool 고갈 내성은 별도다. 성능을 위해 stale Anchor를 수락하거나 검사를 잠금 밖으로 옮기지 않았다.

## 12. 남은 한계와 다음 실제 검증 경계

이번에 완료한 것은 같은 호스트의 분리된 저장소·프로세스에서 application 복구 프로토콜과 해당 권한·잠금 경계를 확인한 것이다.

- 실제 Besu·Witness·transaction 서명·체인 확정·전파와 전체 체인 archive 복원은 미실행이다.
- PBX·TURN·RTP·실제 음성·STT/LLM·실제 IdP·GCP는 미실행이다.
- 독립 호스트 장애 내성, 전원 손실·스토리지 내구성·전역 네트워크 장애는 검증하지 않았다.
- 큰 동시성·pool 고갈·장기 부하·SLA·모든 crash 지점은 검증하지 않았다.
- owner 수동 SQL, 구버전 writer, 복제된 Anchor 자격, 원격 source 중단 증명을 자동 제어하는 보장은 없다.
- 실제 운영 키 전체 조합·다기관 전체 키/Anchor manifest 복원 보장으로 확대하지 않는다.

다음 실제 인프라 검증에는 승인된 시험 배포의 체인·registry metadata와 Witness 신뢰 설정, PBX/TURN·인증서·주소, 제공자 계정과 보관·비용 정책 등 해당 단계의 입력이 필요하다. 키·비밀번호·토큰 원문을 채팅으로 요구하지 않는다. 이 입력과 실행 허가가 없는 상태에서 해당 서비스를 기동하거나 새 기능을 더 만들지는 않는다.

## 13. 상세 증거와 기준 문서

- [이번 종합 실행 증거](../artifacts/backup-boundaries-20261030.json)
- [복구·DB25개 실제 결과](../artifacts/backup-boundaries-20261030/recovery-and-db.json)
- [HTTP 회귀 결과](../artifacts/backup-boundaries-20261030/http-regression.json)
- [실제 상태·지연 관측](../artifacts/backup-boundaries-20261030/observations.json)
- [중간 fixture 실패 원본](../artifacts/backup-boundaries-20261030/intermediate-fixture-failure.json)
- [최종 light·runtime 타입 검사](../artifacts/backup-boundaries-verified-source-20261030.json)
- [복구 소스 식별](../artifacts/backup-boundaries-20261030/source-recovery.json), [HTTP 소스 식별](../artifacts/backup-boundaries-20261030/source-http.json)
- [잘못된 target guard 확인](../artifacts/backup-boundaries-20261030/target-guard.json)
- [진행표](FINALS-IMPLEMENTATION-PLAN.md#backup-boundaries-20261030), [MASTER](MASTER-DEVELOPMENT-SPEC.md), [RUNBOOK](RUNBOOK.md#쓰기-중-백업-준비와-별도-cluster-복원), [알려진 한계](KNOWN-LIMITATIONS.md)

증거의 자동 판정은 PASS지만 별도 독립 검토 상태는 unreviewed로 유지한다. 자동 시험 통과가 독립 보안 감사나 전체 실환경 성공을 뜻하지 않는다.
