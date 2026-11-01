# CallSign 영속 Anchor·재시작·백업/복원 작업 결과

> 기록 범위: 이 문서는 제목 아래 날짜의 작업을 정리한 과거 기록이며, 구현 커밋과 별도의 문서 보존 커밋으로 관리한다. 시험 수·미실행 항목·미커밋 표시는 당시 기준이다. 최신 상태는 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)을 따른다.

작성 기준: 2026-10-30. 이 문서는 이번 복구 개발·검증 작업을 한곳에 모은 전달용 기록이다. 전체 서비스의 완료 또는 실제 체인·통화 성공을 의미하지 않는다. 요구사항과 운영 절차의 기준은 기존 MASTER·진행표·RUNBOOK이며, 이 문서는 그 기록과 실행 증거를 요약한다.

## 1. 작업 결과

메모리 대체 구현으로 확인하던 복구 경계를 별도의 PostgreSQL 저장소와 로컬 HTTPS Anchor에 연결해 시험했다. 실제 프로세스 중단·재시작, 암호화 백업과 새 DB 복원, 손상·불일치 차단을 검증하고 발견한 코드 결함을 수정했다.

- 영속 복구 전용 7개와 기존 DB 회귀 15개를 같은 명령에서 실행: **5개 파일·22개 PASS, 실패·skip 0**.
- 영향받은 HTTP 회귀: **6개 PASS**, 브라우저 시험 1개는 의도적으로 제외.
- 마지막 Anchor 보완 확인: **1개 PASS**, 나머지 6개는 필터로 제외. 전체 시험 수에 더하지 않는다.
- light: **44개 파일·207개 PASS**. API runtime 타입 검사 PASS.
- 코드·문서·증거를 커밋하고 `origin/main`에 일반 push했다. GitHub light CI 성공.
- 이번 시험이 만든 컨테이너·volume·임시 백업·키·인증서·평문을 정리했다. 기존 사용자 파일과 실행 자원은 보존했다.

## 2. 코드와 게시 기준

| 구분 | 값 |
|---|---|
| 작업 시작 및 시험 당시 HEAD | `c59edac6475bd49f450a2836e6fd7e67df80b2c0` |
| 코드·설정·시험 커밋 | `37d01d682e55f78035181997766604095120cf50` |
| 문서·증거 및 최종 게시 커밋 | `ac31f254b225813380088b12a34a78d0833bc028` |
| 게시 대상 | `0u-Y/CallSign`, `main` |
| CI | [light 성공 기록](https://github.com/0u-Y/CallSign/actions/runs/41037322805) |

커밋 메시지는 각각 `Fence persistent recovery and restore authorization state safely`, `Record persistent anchor and application restore verification`이다. 원격과 로컬 최종 SHA의 일치를 확인했다. 공개 이력 재작성·force push는 하지 않았다.

시험은 시작 HEAD 이후의 미커밋 수정으로 실행했다. 뒤에 만든 커밋을 시험 당시 HEAD로 바꾸지 않았다. 최종 source snapshot의 256개 파일 hash가 코드 커밋 내용과 일치함을 확인했다.

전체 22개와 HTTP 6개 시험의 source hash는 `008049a87c36befe57c23c8b079e76915cae88b1319125a4284da1305685167a`다. 이후 시험 파일에 교차 기관 raw HTTPS assertion과 관측 파일 이름 개선을 추가하고 해당 Anchor 시험만 다시 실행했다. 그 최종 source hash는 `4c48ecdcefd6d069494280ac5cb6fac7be6a57b8aa5b30136595462110ee01b6`다. 이 사이 제품 코드 내용은 바뀌지 않았으며, 최종 시험 파일 버전으로 전체 22개를 재실행했다고 주장하지 않는다.

**이 요약 MD는 위 코드 게시 후 사용자 요청으로 별도 작성했다. 위 최종 코드 커밋에는 포함되지 않으며 이후 문서 보존 커밋으로 관리한다.**

## 3. 확인한 결함과 실제 수정

| 문제 | 수정 및 사용자에게 미치는 영향 | 주요 파일 / 요구 ID |
|---|---|---|
| Recovery gate가 이미 ready이면 Anchor 장애·불일치를 확인하지 않고 신규 업무·승인 작업이 진행될 수 있음 | 현재 journal head·epoch를 독립 Anchor와 대조하고 불일치·조회 실패 시 신규 작업을 거절하며 gate를 닫음 | `finals-store.ts`, STATE-003·DB-003 |
| Anchor 인증·CAS 충돌·timeout·접근 불가·응답 문맥 오류가 충분히 구분되지 않음 | 오류를 구분하고 응답 유실 시 정확한 다음 상태 재조회로만 성공을 복구. 추가 checkpoint를 임의 발급하지 않음 | `consumption-anchor.ts`, STATE-003·OPS-005 |
| 기존 Anchor를 직접 로컬 HTTPS로 시험할 경로 필요 | 선택적 TLS 인증서/키 설정을 기존 서버에 연결. 기존 reverse proxy 구성 보존 | `anchor-server.ts`, OPS-005 |
| `pg_dump`의 DB 주소 전달로 잘못된 기본 계정·socket 연결을 시도 | 명시적인 비밀번호 제외 DB 주소와 별도 비밀번호 환경 전달로 수정 | `backup-bundle.ts`, OPS-005 |
| 복원 입력의 파일 집합·인증·경로 및 복원 후 권한 상태 정리가 불충분 | 인증된 inventory·hash·크기·migration 정보를 검사. 모든 암호화 payload 인증과 archive 검사를 SQL 적용 전에 수행 | `backup-crypto.ts`, `restore-bundle.ts`, OPS-005 |
| 복원된 옛 로그인·승인·lease·임시 연결 상태가 재사용될 위험 | SQL 복원과 세션 폐기·gate 차단·임시 연결 정리를 단일 transaction으로 처리. 소비·철회·키/권한 세대 이력 보존 | `restore-bundle.ts`, AUTH-002·CALL-002·CALL-005 |
| 재시작 시 직접 통화와 PBX 통화 정리가 일관되지 않음 | 중단된 비종료 시도를 실패 상태로 정리하고 기존 lease·동의·승인을 회수. 새 시도를 요구 | `service-authority.ts`, `finals-server.ts`, `pbx-runtime.ts` |
| Worker가 복구 확인 전에 작업하거나 오래된 소유권으로 결과를 저장할 위험 | startup에서 journal/Anchor를 확인하고 일반 작업의 claim·갱신·저장·완료에 ready gate 적용. 종료 정리는 허용 | `service-worker.ts`, DB-003·OPS-003 |
| 복호화 실패의 부분 평문, 관측 파일 덮어쓰기 | 이번 호출이 만든 부분 평문을 제거하고 관측 파일에 UUID와 배타적 생성을 적용 | `backup-crypto.ts`, `persistent-recovery.test.ts` |

서버 코드의 경로는 [API 소스](../services/api/src/), 실행 도구는 [scripts](../scripts/) 아래다. Worker 실행 설정과 `.env.example`, Compose의 필요한 환경 참조도 함께 갱신했다. 최소권한을 완화하거나 Worker에 기관 승인 키를 추가하지 않았다.

## 4. 실제로 실행한 구성과 대체한 경계

| 구분 | 실제 실행 범위 | 대체·미실행 범위 |
|---|---|---|
| 저장소 | 서비스 DB와 Anchor DB를 서로 다른 PostgreSQL 프로세스·named volume·LOGIN으로 실행 | 같은 물리 서버이므로 호스트 장애 격리·독립 기관 운영은 증명하지 않음 |
| Anchor | 기존 서버의 실제 HTTPS 요청·영속 SQL CAS·인증·TLS·재시작 | 외부 기관 운영·실제 운영 인증서 환경 미검증 |
| 복구 API | 실제 업무 라우트·ServiceAuthority·SQL·recovery gate | Actor 인증은 명시적인 합성 bearer fixture |
| HTTP 회귀 | 실제 Platform·Issuer·Sender·인증·CSRF·SQL | 로컬 HTTPS OIDC, 메모리 Anchor 등 기존 adapter fixture. 브라우저 미기동 |
| Worker | 실제 SQL claim·lease·재시도·완료·프로세스 종료/재시작 | 원장 transaction·receipt는 adapter 표식. 실제 EVM 서명·체인 반영 미검증 |
| 백업/복원 | 실제 PostgreSQL dump/restore, 암호화·인증·새 DB 복원 | application 범위. 체인 archive 전체 복원 및 모든 운영 키 조합 미검증 |
| 통화 | 재시작·복원 시 DB 상태 회수 | 합성 binding. PBX·TURN·RTP·실제 음성 미실행 |

Anchor 저장소는 DB 백업에 포함하지 않았다. 서로 다른 저장 수명과 최신성 비교를 검증했으며, 서비스 DB에 맞춰 Anchor를 과거로 되돌리지 않았다.

## 5. 영속 Anchor에서 확인한 보장

- 같은 이전 상태를 대상으로 서로 다른 다음 상태를 경쟁 제출하면 한 번만 전진한다. 성공 응답뿐 아니라 저장 상태도 대조했다.
- 오래된 이전 상태, 다른 deployment·기관 문맥, 잘못된 인증, 신뢰하지 않는 TLS를 거절한다.
- Anchor 프로세스 재시작 뒤 마지막 확정 상태가 보존된다.
- 저장 성공 후 응답 유실은 정확한 next 상태를 조회해 확인하며, POST를 추가해 새 checkpoint를 만들지 않는다.
- timeout·접근 불가·상태 불일치를 구분한다.
- 실제 Anchor LOGIN은 SELECT/UPDATE만 허용하고 INSERT/DELETE를 거절한다. superuser·createdb·createrole 권한이 없다.
- Anchor만 전진하고 대응 DB transaction이 rollback된 경우, journal 중간 누락·변조, 초기 checkpoint 미준비, Anchor 접근 불가에서 신규 업무·승인 API가 503을 반환하고 DB 권한 변경을 남기지 않는지 확인했다.

Gate 검사는 기관 행 잠금 안에서 Anchor 요청을 기다리며 client timeout은 최대 2.5초다. 이번 시험은 실제 운영 부하에서의 지연·경합 성능을 보장하지 않는다.

## 6. 암호화 백업과 새 DB 복원 결과

실제 합성 데이터의 application 백업을 암호화하고, 새로 만든 빈 시험 DB에만 복원했다. 기존 데이터가 있는 대상의 덮어쓰기는 허용하지 않는다.

| 복원 후 대상 | 관측·판정 |
|---|---|
| 이미 소비한 승인 | 저장된 소비 영수증 보존. 소비 이력을 초기화하지 않음 |
| 철회·취소·계정 상태 | 철회 VC와 비활성 계정 보존. 회수된 할당의 consume 요청 거절 |
| 권한·키 세대 | membership generation 2, epoch 2, 승인 키 version 2와 공개키를 복원 데이터와 대조 |
| 옛 로그인 | session 0행, 실제 세션 조회 401 |
| 진행 통화·임시 상태 | terminal 상태 유지, 옛 lease·challenge·request cache·소유 세션을 연결 권한으로 재사용하지 않음 |
| Recovery gate | 복원 직후 blocked. 최신 독립 Anchor 일치 확인 후에만 ready |
| 더 오래된 백업 | 앞서 있는 독립 Anchor와 불일치하여 blocked |
| 진행 outbox | claim 해제. 저장된 transaction/nonce·결과 불명 이력은 보존 |

잘못된 키, ciphertext·manifest 변조, 누락 파일, symlink, traversal, 특수 archive entry, 필수 inventory 누락, 인증된 manifest 안의 잘못된 GCM tag를 거절했다. 거절 후 새 대상의 사용자 테이블이 생성·commit되지 않았는지와 복원 평문 임시 폴더 제거를 확인했다. 기존 파일을 복호화 실패 정리 대상으로 지우지 않는다.

시험의 epoch·키 세대는 합성 상태 준비다. 실제 공동 승인 계약의 회전·전파를 이번 복원 시험에서 검증한 것은 아니다. 새 대상은 같은 시험 PostgreSQL cluster 안의 별도 DB이므로 다른 cluster의 역할 provisioning까지 검증하지 않았다.

백업 전 API·Worker 쓰기와 외부 CAS를 중단·배출해야 한다. DB 잠금만으로 외부 Anchor CAS가 멈추는 것은 아니다. 이번에는 정지된 시험 fixture 상태에서 백업했으며 운영 전체의 drain 절차는 실환경 검증이 남아 있다.

## 7. Worker와 API 재시작 결과

실제 claim을 보유한 작업 전용 Worker 프로세스를 강제 종료하고 기존 45초 lease가 만료된 뒤 새 프로세스로 회수했다.

- 옛 소유자의 늦은 완료 요청은 거절한다.
- 결과 불명 작업은 저장된 transaction과 nonce를 유지해 재시도한다.
- 같은 작업에서 prepare가 추가로 실행되지 않음을 adapter 관측으로 확인했다.
- Worker가 최초 zero checkpoint를 임의 발급하지 않는다. Issuer의 초기 준비와 Worker 확인을 분리했다.
- 복구 확인 전에 신규 권한 작업을 진행하지 않는다.
- 재시작으로 옛 통화를 살아 있는 연결로 복원하지 않는다.

외부 transaction은 fixture이므로 실제 Besu에서 단 한 번 적용됐다고 해석할 수 없다. 모든 crash 지점이나 전원 손실을 검증한 것도 아니다.

## 8. 실행 명령과 증거

다음은 당시 실행한 명령이다. 보호된 시험 환경·전용 DB URL·Anchor·인증서·root 경로를 준비한 상태에서 실행했다. **정리된 시험 환경 없이 명령만 복사해서 재실행할 수는 없으며**, 준비 입력과 절차는 [RUNBOOK](RUNBOOK.md#영속-anchor앱-복원-검증)을 따른다. 실제 비밀번호·키·URL은 이 문서에 넣지 않는다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec vitest run \
  --config vitest.integration.config.ts \
  tests/integration/persistent-recovery.test.ts \
  tests/integration/service-runtime.test.ts \
  tests/integration/finals-session-scopes.test.ts \
  tests/integration/finals-store.test.ts \
  tests/integration/database-readiness.test.ts \
  --reporter=verbose --reporter=json \
  --outputFile=PROTECTED_ROOT/recovery-and-db-final.json

CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration CALLSIGN_HTTP_API_ONLY=true \
  pnpm exec vitest run --config vitest.http.config.ts \
  tests/integration/service-http.test.ts \
  --testNamePattern='uses real|rejects issuer|enforces CSRF|issues and consumes|requires real recent|blocks new work' \
  --reporter=verbose --reporter=json \
  --outputFile=PROTECTED_ROOT/http-api-final.json

pnpm evidence:collect artifacts/persistent-recovery-source-20261030.json light runtime
```

`PROTECTED_ROOT`는 당시 보호 임시 경로를 대신한 표기다. 원본 실패·수정 후 통과를 별도로 보존했고 과거 결과와 시험 수를 합산하지 않았다. 웹 제품 코드와 계약을 수정하지 않았으므로 이번에는 전체 웹 build·브라우저·계약 시험을 반복하지 않았다.

- [종합 실행 증거와 범위·정리 기록](../artifacts/persistent-recovery-20261030.json)
- [전체 복구·DB 22개 시험 결과](../artifacts/persistent-recovery-20261030/recovery-and-db-final.json)
- [HTTP 회귀 결과](../artifacts/persistent-recovery-20261030/http-api-final.json)
- [최종 Anchor 보완 확인](../artifacts/persistent-recovery-20261030/anchor-evidence-final.json)
- [light·runtime 타입 검사](../artifacts/persistent-recovery-source-20261030.json)
- [시험 소스](../tests/integration/persistent-recovery.test.ts)

초기 실패에는 제품의 pg_dump 연결 결함, consumed 통화를 accepted로 가정한 시험 상태 오류, bigint fixture 형식, 컨테이너 도구의 파일 소유권 문제가 있었다. 제품·시험·환경 원인을 나눠 고쳤고 보안 assertion을 없애지 않았다. 복원된 비활성 상담원의 consume은 성공해야 한다는 잘못된 기대를 버리고, 거절과 저장 영수증 보존을 각각 확인했다.

임시 관측 파일이 후속 실행으로 덮일 수 있어 UUID+배타적 생성으로 수정했다. 전체 실행의 보존되지 않은 중간 관측을 원본처럼 재작성하지 않았으며, 전체 assertion 보고서와 후속 필터 관측을 구분한다.

## 9. 서버 자원과 정리

당시 CPU 24개, available memory 41,896MiB, load 0.47/0.58/0.73, 디스크 여유 526GiB를 관측했다. 서비스 DB는 메모리 512MiB·CPU 1, Anchor DB는 256MiB·CPU 0.5로 제한했다. Node는 2GiB 예산, worker 병렬성 1, 명령 240초·개별 시험 최대 65초로 진행했다. Node 예산을 cgroup으로 강제한 것은 아니다.

후반 available memory 41,282MiB, 두 DB 메모리 약 97.96/22.04MiB를 관측했다. swap 사용량은 증가했지만 수집한 표본에서 지속적인 swap 입출력은 관측하지 못했다. 전 기간 swap 활동이 없었다고 주장하지 않는다.

작업 identity와 label을 확인한 뒤 컨테이너 2개·named volume 2개를 제거했다. API·Worker·Anchor 등 소유 애플리케이션 프로세스 잔존 0을 확인하고 암호화 백업·임시 평문·시험 자격·키·인증서·보호 임시 경로를 정리했다. 기존 서비스·DB·volume·키는 변경하지 않았다.

게시 시 tracked 변경은 없었고, 기존 미추적 진행 포인터 28개와 사용자 요약 문서 3개는 커밋에 포함하지 않고 보존했다. 이 문서를 추가하면서 미추적 Markdown 파일 1개가 더 생긴다. 이번 문서 작성에서는 서비스 기동·추가 시험·commit·push를 실행하지 않았다.

## 10. 남은 검증과 이번 결과의 한계

이번에 확인한 것은 **같은 호스트에서 분리한 영속 DB/Anchor와 실제 프로세스의 복구 프로토콜 및 application 복원 보장**이다.

다음은 아직 검증하지 않았다.

- 실제 Besu·Witness·계약 배포·transaction 서명/확정·철회 전파와 전체 체인 archive 복원.
- PBX·TURN·양방향 RTP·음성 중단, 실제 STT/LLM·IdP·GCP 연동.
- 독립 호스트·독립 기관 운영, 전원 손실·디스크 내구성·호스트 재부팅·고갈·전역 네트워크 장애.
- 다른 PostgreSQL cluster로의 역할 provisioning과 전체 운영 키·trust 조합.
- 운영 전체의 백업 전 drain, 모든 중단 지점·부분 filesystem 실패·장기 부하·성능.

신뢰할 수 있는 최신 이력이 없거나 DB와 독립 Anchor가 다르면 자동 정상화하지 않는다. Anchor를 과거로 되돌리거나 소비 이력을 초기화하는 우회 없이 gate를 닫고 명시적인 복구 결정을 요구한다.

## 11. 상세 기준 문서

- [MASTER 요구사항](MASTER-DEVELOPMENT-SPEC.md)
- [이번 개발·검증 진행 기록](FINALS-IMPLEMENTATION-PLAN.md#persistent-recovery-20261030)
- [준비·실행·실패 대응 RUNBOOK](RUNBOOK.md#영속-anchor앱-복원-검증)
- [아키텍처](ARCHITECTURE.md), [위협 모델](THREAT-MODEL.md), [알려진 한계](KNOWN-LIMITATIONS.md)

이 요약은 상세 기준을 대체하지 않는다. 이후 코드·검증 상태가 바뀌면 위 기준 문서와 실행 증거를 먼저 확인해야 한다.
