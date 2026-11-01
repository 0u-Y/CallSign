# CallSign 배포 후보 검토 전체 정리

> 기록 범위: 이 문서는 제목 아래 날짜의 작업을 정리한 과거 기록이며, 구현 커밋과 별도의 문서 보존 커밋으로 관리한다. 시험 수·미실행 항목·미커밋 표시는 당시 기준이다. 최신 상태는 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)을 따른다.

작성일: 2026-10-31(KST)

이 문서는 실제 인프라 연결 전에 수행한 코드·배포 설정·문서 정합성 검토를 한곳에 정리한다. **소스와 설정의 배포 후보이며, 실제 배포 완료나 전체 서비스 검증 완료를 뜻하지 않는다.** 아래 기동·키 생성·계약 배포 명령은 다음 실행을 위한 절차이며 이번에는 실행하지 않았다.

## 1. 코드 기준과 게시 상태

- 검토 시작: `a6e2452db2691d5102ff076ea1f23dd89761b3a4`.
- 최종 게시: `87a2d37d3ec49462925771013aa8e2c8615755c9`.
- 저장소: [0u-Y/CallSign](https://github.com/0u-Y/CallSign), 브랜치 `main`.
- 일반 push 후 원격 SHA와 로컬 SHA 일치를 확인했다. 공개 이력 재작성과 force push는 하지 않았다.
- [GitHub Actions light](https://github.com/0u-Y/CallSign/actions/runs/41083034690): 성공.
- **이 요약 MD는 위 코드 게시 이후 별도로 작성했으며, 위 코드 커밋에 포함되지 않는다. 문서는 이후 별도 보존 커밋으로 관리한다.**

| 커밋 | 한 줄 메시지 | 주요 내용 |
|---|---|---|
| `1149314` | Align service entrypoints and deployment trust configuration | 기본 실행·trust 생성 경로, 공개 CA, 배포 구성과 관련 회귀 |
| `ddda697` | Validate retention policy before creating maintenance clients | retention 입력 검증과 회귀 |
| `e743287` | Document deployment candidate gates and staged infrastructure checks | 실제 연결 순서·차단 조건·검증 근거 정리 |
| `87a2d37` | Clarify public origin mode and host TLS configuration | 공개 origin 모드와 호스트 직접 실행의 CA 전달 설명 |

시험 당시 HEAD와 미커밋 소스 식별값은 원본 증거를 유지했다. 최종 커밋에 과거 시험을 새로 실행한 것처럼 기록하지 않았다.

## 2. 발견해서 수정한 문제

| 문제·사용자 영향 | 실제 수정 | 주요 파일·요구사항 |
|---|---|---|
| API 기본 시작 명령이 현재 서비스와 다른 서버를 선택함 | 기본 `start`를 `finals-server.ts`로 연결하고 이전 서버는 `start:legacy`로 보존 | `services/api/package.json`, OPS-001/003 |
| 기본 trust 생성 명령이 이전 시험키 경로를 사용함 | `trust:generate`를 현재 등록 URI·키 준비 도구로 연결. 기존 생성기는 `trust:generate:legacy`로 명시 | `package.json`, OPS-001/003 |
| Issuer/Worker가 PBX CA 하나만 추가 신뢰하도록 고정됨 | `SERVICE_EXTRA_CA_PATH`의 공개 PEM bundle을 읽기 전용 mount하고 `NODE_EXTRA_CA_CERTS`로 전달. 사설 Anchor/OIDC CA를 함께 준비 가능 | `infra/deploy/compose.yml`, `.env.example`, `scripts/preflight.ts`, `scripts/preflight-requirements.ts`, OPS-001/005·AUTH-002 |
| 보관 정책 설정이 Worker에 전달되지 않거나 잘못된 값이 DB 클라이언트 생성까지 도달함 | `RETENTION_SECONDS` 전달 및 양의 안전한 정수 검증. NaN·0·음수·소수·Infinity 거절 | `services/api/src/maintenance.ts`, Compose·preflight, DB-004·OPS-003 |
| 준비 설명의 migration 종료 번호가 실제와 다름 | 신규 설치는 `0000`~`0006`으로 정정. 복원 전 roles-only 절차는 별도로 유지 | `scripts/execution-input.ts`, DB-004·OPS-003 |
| 시험 소스·중첩 env·키 파일이 Docker build context로 유입될 여지 | 시험 폴더/entrypoint·`*.test.ts(x)`·중첩 env·PEM/key 제외 | `.dockerignore`, OPS-001·TEST-001 |
| PBX readiness 대기로 인증·관리 화면 시작까지 막힘 | Platform/Web 시작 의존성만 `service_started`로 분리. healthcheck의 `/readiness`와 DB `service_healthy` 유지 | Compose, OPS-003·UI-005 |
| 시험 adapter를 운영 DB나 container 내부 DB로 연결할 위험 | integration 허가·test identity·loopback 시험 DB 제한의 거절 회귀 보강. 일반 실행의 자동 fake fallback 없음 | 기존 adapter scope 시험, OPS-001·TEST-001 |

### 수정의 경계

- `RETENTION_SECONDS=604800`은 기존 7일 기본 정책의 전달을 고친 것이다. 법정 보관 기간이나 제공자 청구 정산을 확정한 것이 아니다. 검증은 **maintenance DB 클라이언트 생성 전**이며 전체 Worker가 어떤 DB 연결도 만들기 전이라는 주장은 하지 않는다.
- CA preflight는 일반 파일·크기·symlink·개인키 포함 여부와 첫 X.509 인증서 파싱을 확인한다. bundle 전체 chain·이름·TLS handshake를 검증한 것은 아니다.
- 호스트 직접 Node 실행에서는 `SERVICE_EXTRA_CA_PATH`만으로 반영되지 않는다. 시작 전에 `NODE_EXTRA_CA_CERTS`를 지정해야 한다. Compose는 이 매핑을 수행한다.
- 비 loopback `WEB_ORIGIN`에는 `PUBLIC_DEPLOYMENT=true`, `DEMO_MODE=false`가 필요하다. 공개 모드 허용과 실제 외부 인증 성공은 별개다.
- Docker 제외 규칙은 정적 확인이다. 이미지를 build하거나 이미지 내부의 파일·UID·mount 접근 권한을 확인하지 않았다.
- 시작 의존성 분리는 준비 완료 판정의 완화가 아니다. 실제 Compose lifecycle과 PBX 미준비 안내는 다음 기동에서 확인해야 한다.

## 3. 이번에 실제 실행한 검사

| 검사 | 결과 | 의미와 제한 |
|---|---|---|
| 최종 `pnpm light` | **44개 파일·212개 시험 PASS** | 네트워크/listen 차단을 유지한 작은 단위·정적 검사 |
| API runtime TypeScript | PASS | runtime 타입 정합성. 서버 기동 없음 |
| 웹 build | PASS | 같은 작업 중 웹 소스/빌드 설정이 바뀌지 않은 시점의 컴파일. 실제 배포 trust pin을 주입한 이미지 아님 |
| 전체 Compose + PBX overlay 구성 파싱 | PASS | 설치된 Compose로 기동 없이 구문·구조 확인 |
| 원본에서 고정 추출한 chain 9서비스·auth 8서비스 파싱 | PASS | 다른 단계의 미입력 설정이 첫 단계까지 막지 않는 구성 확인. 실제 준비 완료 아님 |
| `bash -n scripts/deployment.sh` | PASS | 셸 구문 검사 |
| diff·문서 상대 링크·fence·검토 파일 hash·비밀/대형 산출물 점검 | PASS | 검토 범위의 소스/문서 위생 확인 |
| 배포값 없는 최종 preflight | **BLOCKED 63 / PASS 16 / SKIPPED 1** | 로컬 PASS와 외부 입력/산출물/실행 대기를 구분. 63개를 사용자 질문 63개로 전달하지 않음 |

최종 light/runtime은 `1149314` 이후 미커밋 retention 수정 상태에서 실행했고 해당 코드는 `ddda697`에 보존했다. 웹 build는 그 이전의 동일 웹 소스로 수행했다. 이후 문서 커밋 때문에 같은 검사를 반복하지 않았다. 이 요약 파일 작성 시에는 문서 확인만 수행했다.

### 실제 사용한 주요 검사 명령

다음은 이미 수행한 검사 기록이다. 아래와 별도로 서비스를 기동하지 않았다.

```sh
NODE_OPTIONS=--max-old-space-size=2048 pnpm evidence:collect artifacts/release-candidate-retention-source-20261031.json light runtime
NODE_OPTIONS=--max-old-space-size=2048 pnpm evidence:collect artifacts/release-candidate-final-source-20261031.json light runtime web
bash -n scripts/deployment.sh
docker compose --env-file /dev/null -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml config --no-interpolate --no-env-resolution --no-path-resolution --quiet
git diff --check
```

두 evidence 명령의 light 결과는 각각 212개와 그 이전 211개이며 합산하지 않는다. 최종 결과는 212개다.

### 원본 증거

- [배포 후보 검토](../artifacts/release-candidate-review-20261031.json)
- [최종 light·runtime](../artifacts/release-candidate-retention-source-20261031.json)
- [동일 웹 소스의 build 포함 검사](../artifacts/release-candidate-final-source-20261031.json)
- [최종 preflight](../artifacts/release-candidate-retention-preflight-20261031.json)

## 4. 기존 실제 검증과 fixture 검증의 구분

아래는 이전 실행의 적용 범위다. **이번에 재실행한 결과가 아니다.**

| 영역 | 기존 확인 | 확대해서 주장하지 않는 것 |
|---|---|---|
| 계약 | 로컬 EVM 21개와 실제 앱의 EIP-712·calldata·event 호환성 | Besu/QBFT 합의·배포·Witness 전파 |
| 인증·HTTP·웹 | 실제 PostgreSQL·인증 middleware·세션·CSRF·Issuer/Platform/Sender·Chromium 연결. 로컬 HTTPS OIDC 제공자 사용 | 실제 외부 IdP 호환성·현재 컨테이너 TLS/시작 순서 |
| 원장·통화 상태 | 등록·승인·verifier·lease·취소 경계의 원장/binding fixture | 실제 DTLS/RTP 연결·마이크·PBX 회수 |
| 분석 | 동의·revision·취소·근거·quota 등 orchestration의 단위/fixture | 실제 한국어 STT/LLM 품질·보관·청구·원격 음성 성능 |
| 영속 복구 | 최근 복구+DB 25개, 영향 HTTP 6개. 실제 HTTPS Anchor·별도 PostgreSQL cluster/volume/LOGIN·drain·암호화 복원 | 독립 호스트 장애·GCP 이전·체인 archive·운영키 전체 복원 |
| CI | GitHub Actions light 성공 | 로컬 통합 시험의 CI 재실행·실제 인프라 성공 |

기존 복구 source map과 비교해 API 비시험 소스는 maintenance 입력 guard 외 동일했고 웹 runtime 소스도 동일했다. 계약 artifact의 두 선언 source hash도 현재 계약과 일치했다. 이는 전체 의존성·이미지·환경의 재현 증명이 아니다. entrypoint·CA·mount·시작 의존성 변경은 실제 배포 시 재검증이 필요하다.

## 5. 남은 차단과 구현 상태

### 코드·설정 검토로 확인한 것

이번 정합성 검토에서 다음 연결을 위해 새 기본 프로토콜이나 복구 플랫폼을 추가할 이유는 발견하지 않았다. **MASTER 전체 74개 요구사항 완료 판정은 아니다.** 실행되지 않은 경로를 파일 존재만으로 완료 처리하지 않는다.

### 지금 실제 연결을 막는 것

1. 현재 호스트의 기본 ledger 대역 `10.203.0.0/24`가 기존 Docker network 하나와 중복된다. 기존 network·서비스는 건드리지 않았다. 충돌 없는 승인된 실행 호스트 또는 peer/Compose 설정을 함께 검토한 네트워크 결정 전에는 첫 체인 기동을 하지 않는다.
2. 실제 기관·콜센터·로그인 등록값, 키 책임, 독립 Anchor 운영자, 공개 origin·CA·OIDC 설정이 미확정이다.
3. Asterisk 실제 이미지의 필요한 모듈/ODBC driver·TLS 이름·RTP 경로, TURN 및 실제 IdP/provider 지원을 확인해야 한다.
4. 검토된 image digest, 생성키·공개 manifest, 실제 genesis·계약 metadata, 공개 trust와 웹 pin은 승인된 생성·배포 단계가 있어야 확보된다.
5. Besu·Witness·실제 PBX/브라우저 음성·외부 IdP/AI·GCP는 실환경 검증 전이다. 정적 검사로 PASS 처리하지 않았다.

설치된 로컬 이미지 태그 존재는 읽기 전용으로 확인했지만 배포 digest·모듈·런타임 호환성 확인으로 대체하지 않았다. 미실행 서비스의 RAM·성능 수치를 만들지 않았다.

임의 CIDR 변경, confidential OIDC client, 일반 PSTN/단말 연동, native chain proof, KMS/HSM, 자동 failover는 현재 지원으로 가정하지 않는다. 승인 검증 p95 500ms·철회 반영 p95 5초·상태 최대 유효기간 10초는 목표/설계 경계이며 이번 실측 성능이나 SLA가 아니다.

## 6. 사용자 결정과 이후 생성값·실행 절차

다음 절은 현재 RUNBOOK의 해당 절을 이 파일에 함께 실어, 이 문서만으로도 결정과 순서를 확인하도록 했다. 아래 모든 기동·생성 명령은 **추후 해당 범주의 명시적 실행 허가 후에만** 사용한다. 값이 비어 있으면 예제 주소·임의 digest로 채우지 않는다.

### 설정·실행물의 연결

| 대상 | 실제 소비 경로·준비 조건 |
|---|---|
| 기본 entrypoint | API `pnpm --filter @callsign/api start` → `finals-server.ts`. 이전 서버는 `start:legacy`. root `dev/setup/demo:*`는 호환 개발/기동 명령이며 배포 후보 검사가 아님 |
| app/web 이미지 | 저장소 루트 context와 `infra/deploy/app.Dockerfile`, app=`--target runtime`, web=`--target web`. build/pull은 별도 승인. runtime stage는 웹 pin 생성에 의존하지 않음 |
| trust | `pnpm trust:generate DIRECTORY NEW_TRUST_OUTPUT`은 기본 dry-run. 실제 생성은 승인 후 `--apply`. 구 `.local/test-keys` 생성 경로는 `trust:generate:legacy`만 사용 |
| DB | 새 설치는 owner로0000~0006→별도 LOGIN provisioning→검증된 issuer/subject 계정 연결. 복원은 새 빈 cluster에 roles-only→인증된 복원→gate/fence 확인. source 비밀번호 복제 금지 |
| 역할 | Platform은 DB/개인키 없음. Issuer는 issuer/auth LOGIN과 기관/PBX 서명키, Sender는 콜센터키만. Worker는 worker LOGIN·별도 EVM admin/stopper 키만. bind mount의 UID/상위 디렉터리 접근과0600 키를 확인; `chmod 777`로 해결하지 않음 |
| CA | `SERVICE_EXTRA_CA_PATH`는 공개 PEM bundle. PBX CA 및 사설 Anchor/OIDC CA를 포함해 issuer/worker의 `/tls/extra-ca.pem`에 read-only mount. Node 기본 공용 CA도 유지. 웹 nginx는 PBX 전용 공개 CA만 mount. 개인키를 bundle에 넣지 않음 |
| 호스트와 컨테이너 | `FINALS_DATA_DIR`/공개 CA는 호스트 경로, `/keys`·`/trust`·`/tls`는 container 경로. `ISSUER_URL`/`SENDER_URL`, Besu/Witness, ARI는 내부 DNS. 브라우저는 `WEB_ORIGIN`, 같은 origin `/api`·`wss://HOST/pbx/ws`와 실제 TURN 주소 사용 |
| 키·등록 | 키/URI는 public manifest·기관 등록·위임·trust와 동일해야 함. API/브라우저에 장기 개인키를 전달하지 않음. 키 파일 존재와 원장 등록은 다른 단계 |
| OIDC | 현재 클라이언트는 Authorization Code+PKCE의 공개 client 경로. 업무/공식 client와 audience를 분리하고 auth_time을 제공. 두 client의 callback은 `${WEB_ORIGIN}/service`; 이름·이메일로 소속 자동 연결하지 않음. confidential client 요구 시 별도 호환 검토 |
| PBX | ARI와 nginx의 TLS 이름 `asterisk`, 실제 인증서 fingerprint·SIP realm/domain·WSS·ODBC·UDP media 주소 대조. Asterisk22와 필요한 모듈/driver가 있는 실제 image digest는 미확보 |
| 분석·보관 | Deepgram/Anthropic 모델·키는 현재 adapter의 보호 환경 참조. 없으면 분석 미준비이지 mock 성공이 아님. 동의·원격 오디오·timeout·quota는 기존 코드 사용. `RETENTION_SECONDS`는 worker에 전달하는 보관 정책이며 법정 기간/실제 제공자 청구 정산 아님 |

`WEB_ORIGIN`이 loopback 외부 주소이면 `PUBLIC_DEPLOYMENT=true`, `DEMO_MODE=false`를 명시한다. 이 flag는 해당 origin을 허용한다는 뜻이며 실제 공개·인증 성공 판정이 아니다. Host에서 직접 Node를 실행할 때는 `SERVICE_EXTRA_CA_PATH`가 자동 반영되지 않으므로 검토한 공개 CA 경로를 `NODE_EXTRA_CA_CERTS`로 Node 시작 전에 지정한다. Container는 Compose가 이 매핑을 수행한다.

웹 Docker build는 공개 trust canonical hash를 `VITE_SERVICE_TRUST_SHA256` build arg로 주입한 뒤 digest를 기록한다. API의 같은 pin·공개 trust·현재 키/정책과 일치해야 한다. `.dockerignore`는 시험 entrypoint/시험 소스·중첩 env·PEM/key 파일을 제외한다. 역할 JSON 키를 웹 public/src에 넣지 않는다. 실제 이미지 내용·권한·TLS는 build/기동 후 다시 확인한다.

Platform/Web의 시작 의존성은 `service_started`이며 healthcheck는 계속 `/readiness`다. PBX를 기다리는 동안 인증/관리 UI에 접근할 수 있지만 통화 준비 완료로 표시하지 않는다. 실제 공개 전에는 전체 readiness와 단계별 assertion을 별도로 확인한다. DB는 `service_healthy`를 유지한다.

### 사용자 결정: 최대 다섯 묶음

| 묶음 | 지금 필요한 결정·추천 | 공개 정보/보호 참조 | 첫 차단과 뒤로 미룰 항목 |
|---|---|---|---|
| 1 실행 위치·접근 | 기존 서비스와 분리한 시험 호스트 권장. 현재 호스트 기본 ledger 대역10.203.0.0/24는 기존 Docker 망과 중복됨. 기존 망/프로세스를 끄지 않고 별도 호스트 또는 peer/genesis/Compose를 함께 검토한 주소 정책 선택 | 실행 호스트·이미지 registry/접근 참조·충돌 없는 network 계획·소유 자원 식별자 | 첫 체인 기동 차단. GCP project/zone/IAM/VM 선택은 이전 단계까지 미룰 수 있음 |
| 2 DNS·TLS·OIDC | HTTPS origin 하나와 동일 origin WSS 권장. 업무/공식 공개 client·audience 분리 및 auth_time 지원 확인 | 도메인/origin, issuer/JWKS/authorize/token/client/audience/callback 공개값, cert/공개 CA 경로와 비밀 참조 | 인증 단계 차단. 실제 IdP MFA·공개 배포 정책은 해당 provider와 확인. secret 원문은 채팅에 보내지 않음 |
| 3 기관·콜센터·키 책임 | 모의 기관/콜센터 URI와 검증된 OIDC subject, 별도 기관/콜센터/PBX/Witness/admin/stopper 키 책임. 독립 관리 승인자3명 중2명, Witness4개 중3개 유지 | 등록 URI/기관 ID/승인자 공개 주소, accounts JSON·역할별 보호 파일 참조, 독립 Anchor 관리자/주소 | 키/등록·계약·최초 Anchor 준비 차단. 키·계약 주소·배포 높이는 이후 도구 산출물이지 지금 입력할 값이 아님 |
| 4 PBX·TURN | 현재 Asterisk PJSIP/WSS+ARI·ODBC 경로 유지. 실제 이미지/모듈·외부 UDP 접근·인증서 이름/fingerprint·TURN relay 경로 검토 | PBX 공개/내부 주소·SIP realm/domain/WSS/TURN URLs, ARI/PBX/TURN 비밀 참조 | trust/web 준비·인증 단계 및 실제 media 단계 차단. PSTN·단말 OS·일반 SIP 확장은 뒤로 미룸 |
| 5 AI·보관·예산 | 기존 Deepgram/Anthropic adapter로 동의한 합성/허가 음성의 소량 시험부터. 원음 기본 미보관·전사 삭제·provider 보관 조건 확인 | 선택 모델명, 계정/보호 API 참조·보관 조건·소량 시험 한도 | provider 단계만 차단. 체인/API를 AI 계정 때문에 막지 않음. 가격·결제 상품은 정하지 않음 |

망주소 변경만으로 genesis·validator 키·권한 세대를 재생성하지 않는다. 기존 네트워크를 이전한다면 같은 논리 identity를 유지한 채 peer/접근 설정을 검토한다.

build 후 image digest, 키 생성 후 public manifest, chain 기동/배포 후 genesis·registry 주소/code hash·배포 높이, trust 생성 후 pin은 실행 산출물이다. 예제 주소·임의 digest로 준비 상태를 통과시키지 않는다.

### 단계별 실행 범위와 판정

| 단계 | 최소 구성·선행 입력 | 산출물·성공 assertion | 중단·정리·다음 증거 |
|---|---|---|---|
| 0 준비 | 승인된 새 호스트/namespace, 검토 source·image, 별도 key owner, 공개 network 입력. `prepare-finals.ts keys`, `prepare-service-network.ts`, `generate-besu.sh`는 각각 별도 실행 승인 후 | 생성키/manifest·network config/genesis·별도 digest. 기존 파일 무덮어쓰기 | CIDR 충돌·키 책임 불명·부분 생성이면 중단하고 journal 보존. 실제 메모리 요구는 미측정 |
| 1 체인·계약·Witness | Besu4개, ledger network/volume, 새 deployer와2-of-3 승인자, 이후 Witness4개·각 RPC/키. 아래 chain plan 사용 | `deploy-service-registry.ts inspect`로4개 chain/genesis/높이 관측→검토 artifact 배포→code/profile/receipt→같은 snapshot의 서로 다른3Witness와 freshness 확인. TCP health나 로컬 EVM PASS만으로 합의 성공 판정 금지 | identity 불일치·합의 진행 정지·quorum 부족 시 후속 단계 중단. 소유 resource만 정리하고 genesis/배포 pending journal/실제 관측 보존 |
| 2 인증·업무 API | 별도 PG/LOGIN0000~0006 또는 검증된 restore, 독립 HTTPS Anchor, 준비된 키·trust/web pin·OIDC, issuer/sender/platform/web와 승인된 HTTPS ingress. PBX용 인증서는 미리 준비하되 PBX daemon·AI는 아직 불필요 | issuer startup checkpoint, 실제 OIDC callback·세션/CSRF/tenant·업무/위임·개별 승인·실제 Witness 권한 조회. 기관 등록은 관리 UI→기존 worker→확정event/current state. Worker는 이때 별도 기동 | 실제 IdP 실패·Anchor/gate·공개 trust 불일치면 신규 권한 차단. PBX readiness가503인 상태를 인증 검증 성공과 구분. 승인 소비는 media binding 준비 후 |
| 3 PBX·브라우저 | 검토 Asterisk/TURN, ODBC/TLS/WSS/UDP, 로그인한 양쪽 웹, 기관/위임 확정 | 수락/검증 전 송수신 차단, 실제 양방향 RTP/decoded audio·DTLS fingerprint·ARI mapping, 철회·logout·lease 종료 후 회수 | UI 연결 문구·HTTP200만 성공 금지. 불명 연결은 회수·자기 테스트 채널만 정리. 기존 media harness/관측을 남김 |
| 4 제공자 | 실제 연결의 remote audio, 명시 동의, 모델/보관/소량 예산 | 실제 STT revision→규칙+LLM→원문 근거 경고, 동의 철회 후 전송/늦은 결과 중단·사용량·비용 관측 | consent 혼합·예산 초과·보관 불명·provider 장애면 분석 중단. 실패를 위험 없음으로 표시하지 않음 |
| 5 전체·GCP 이전 | 위 단계의 같은 release/contract/trust identity, 별도 승인된 GCP 대상과 일관 backup/fence 절차 | 체인/미디어 포함 실제 회수·재시작·복원, 같은 image/논리 identity·소비/세대 보존. 새 환경 주소/CA/OIDC/TURN은 재검증 | 소프트웨어 rollback으로 구 권한을 되살리지 않음. 진행 세션/임시 키는 이전하지 않음. 독립 Anchor는 과거 DB와 함께 rollback하지 않음 |

노드4개·Witness3-of-4·관리2-of-3을 줄여 원래 보장을 검증했다고 하지 않는다. 같은 호스트 배치를 독립 기관/호스트 내성으로 설명하지 않는다. 각 단계는 자신의 실제 명령·설정/환경 identity·assertion·실패/skip·로그 hash를 기존 evidence/runner에 남기고 다음 단계로 넘긴다. 미확정 tx에 새 nonce를 발급하거나 전체 volume을 초기화하지 않는다.

### 전체 설정에 묶이지 않는 첫 체인 plan

전체 Compose는 선택하지 않은 서비스의 `${VAR:?}`도 해석한다. OIDC/PBX/AI 값을 가짜로 채우지 말고 **원본에서 아래 고정 서비스만 추출**한다. 별도 AUTH_PLAN에는 인증 단계 구성만 넣어 아직 없는 TURN/Asterisk 이미지 때문에 인증 준비를 막지 않는다. PBX 공개 인증서·주소·ARI 보호 참조는 현재 서비스 trust 준비에 필요하다. 이는 운영자의 일회 준비 명령이며 별도 설정 기준/배포 플랫폼이 아니다. 설치 Compose의 `--no-path-resolution` 지원을 확인하고 저장소 루트에서 실행한다. source·출력 파일은 새 보호 경로, `FINALS_DATA_DIR` 등 bind 참조는 절대 경로를 사용한다.

```sh
# 이 두 명령은 기동 없는 로컬 구성 처리다. output 경로는 새 파일을 사용한다.
docker compose --env-file /dev/null -f infra/deploy/compose.yml \
  config --no-interpolate --no-env-resolution --no-path-resolution --no-normalize --format json > "$RAW_COMPOSE"
node --input-type=module - "$RAW_COMPOSE" "$CHAIN_PLAN" "$AUTH_PLAN" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const full=JSON.parse(readFileSync(process.argv[2],'utf8'));
const names=['besu1','besu2','besu3','besu4','registry-deployer','witness1','witness2','witness3','witness4'];
const plan={name:full.name,services:Object.fromEntries(names.map(n=>[n,full.services[n]])),networks:{ledger:full.networks.ledger},volumes:Object.fromEntries(['besu1-data','besu2-data','besu3-data','besu4-data'].map(n=>[n,full.volumes[n]]))};
writeFileSync(process.argv[3],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
const authNames=['postgres','migration-runner','issuer','sender','platform','worker','web','https'];
const auth={name:full.name,services:Object.fromEntries(authNames.map(n=>[n,full.services[n]])),networks:full.networks,volumes:{'postgres-data':full.volumes['postgres-data'],'caddy-data':full.volumes['caddy-data']}};
writeFileSync(process.argv[4],JSON.stringify(auth,null,2)+'\n',{flag:'wx',mode:0o600});
JS
```

아래부터는 **실제 기동/chain 실행 허가 후에만** 실행한다. `CALLSIGN_PROJECT`는 동일 배포의 고유 이름, `CHAIN_ENV`는 선택한 체인 단계 공개/보호 참조다. image digest·키·artifact는 생성/검토된 실값만 사용한다. subnet 충돌을 해소하기 전에는 실행하지 않는다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$CHAIN_PLAN" \
  up -d --no-build --pull never besu1 besu2 besu3 besu4
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain node scripts/restricted.mjs chain \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$CHAIN_PLAN" --profile operations \
  run --rm --no-deps --pull never registry-deployer pnpm exec tsx scripts/deploy-service-registry.ts inspect /release/network-observation.json
# 관측된 genesis/artifact hash를 검토한 뒤 같은 registry-deployer를 기본 명령으로 run하여 --apply 수행
# 새 deployment.json을 검토·배치한 뒤에만 Witness를 기동
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$CHAIN_PLAN" \
  up -d --no-build --pull never witness1 witness2 witness3 witness4
```

계약 배포 기본 run 명령은 위 inspect 줄의 뒤쪽 `pnpm ... inspect ...` override만 제거한 동일 `registry-deployer` 호출이다. 그 command가 기존 `pnpm ledger:deploy-service --apply`다. 인증 단계는 같은 `-p "$CALLSIGN_PROJECT"`와 위 `AUTH_PLAN`을 사용해 `issuer sender platform web`만 `up --no-deps --no-build --pull never`하고 DB/Anchor 준비를 선행한다. registration 처리를 위해 worker를 별도로 시작한다. media 단계에서 `--profile pbx --profile media`로 `asterisk turn`을 추가하고 OIDC 검증은 HTTPS ingress가 필요하므로 인증 단계에서 승인된 기존 ingress 또는 `AUTH_PLAN`의 `--profile https` 서비스 `https`를 별도로 시작한다. media 추가는 원본 Compose/PBX overlay와 같은 project 이름을 사용한다. 각 `up`은 범주 승인 guard를 사용한다. 일반 `deployment.sh start`는 **전체 설정과 검증을 끝낸 이후**의 전체 기동 편의 명령이지 최초 단계별 검증 명령이 아니다.


## 7. 보존·정리와 이번 요약의 재현성

- 검토 작업에서는 서비스·컨테이너·DB·volume·키·인증서·계약을 생성하거나 기동하지 않았다. 따라서 기존 프로세스를 종료하거나 데이터를 지우지 않았다.
- 구성 검사에서 만든 임시 공개 Compose JSON 8개만 제거했다. 웹 build의 ignore된 출력은 보존했다.
- 요약 작성 전 tracked 변경은 없었고, 기존 untracked 33개는 보존했다. 사용자 요약 MD 5개와 과거 `.progress.json` 28개이며 이번 게시에 임의로 포함하지 않았다.
- 최초 작성 후 이 요약만 추가 untracked 상태였으며, 당시 문서 작성 요청에서는 추가 커밋·push를 하지 않았다.
- Git SHA만으로 배포 전체를 재현한다고 주장하지 않는다. 실제 릴리스에는 소스·lockfile·migration·계약 artifact·이미지 digest·환경 identity·공개 trust pin·보호 참조와 단계별 실제 증거가 함께 필요하다. 비밀값·백업 원문·DB 데이터는 Git에 넣지 않는다.

## 8. 다음 단계와 종료 판단

이번에 마친 범위는 **기본 실행·trust·CA·retention·Docker context·시작 의존성의 정합성 수정과 오프라인 확인, 단계별 실제 연결 절차 정리 및 게시**다.

첫 실환경 단계는 네트워크 충돌과 실행 호스트/소유권을 결정하고, 실제 이미지·키·환경을 준비한 뒤 명시적 허가를 받아 **Besu 4개 → 실제 계약 metadata → Witness 4개/3-of-4 증언**을 확인하는 것이다. 인증·미디어·AI는 자신의 선행 증거를 받은 뒤 순차 연결한다. 노드 수나 정족수를 줄여 원래 공동 운영 보장을 검증했다고 하지 않는다.

외부 선택·생성값·실환경 관측이 필요한 차단은 남겨 둔다. 미실행 경로를 성공으로 만들기 위한 기능 추가나 가짜 기본값은 넣지 않았다.

## 9. 상세 기준 문서

이 파일은 이번 검토를 한곳에서 읽기 위한 기록이다. 새로운 요구사항 기준을 만들지 않는다.

- [MASTER 개발 명세](MASTER-DEVELOPMENT-SPEC.md): 요구사항 ID와 완료 조건.
- [이번 진행 기록](FINALS-IMPLEMENTATION-PLAN.md#release-candidate-20261031): 수정·검증·과거 증거의 적용 범위.
- [RUNBOOK](RUNBOOK.md#배포-후보와-실제-연결-순서): 설정·실행 순서의 지속 갱신 기준.
- [아키텍처](ARCHITECTURE.md), [알려진 한계](KNOWN-LIMITATIONS.md), [서비스 가이드](guide/README.md).

**미확인:** 실제 이미지·TLS·IdP·Besu/Witness·PBX/음성·외부 AI·GCP 연결. 코드 검사 통과와 실제 서비스 성공은 별개다.
