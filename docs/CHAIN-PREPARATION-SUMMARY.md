# CallSign 첫 체인 실행 준비 작업 정리

> 기록 범위: 이 문서는 제목 아래 날짜의 작업을 정리한 과거 기록이며, 구현 커밋과 별도의 문서 보존 커밋으로 관리한다. 시험 수·미실행 항목·미커밋 표시는 당시 기준이다. 최신 상태는 [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md)을 따른다.

작성일: 2026-11-01(KST)

이번 작업은 노드를 실행하기 전에 필요한 신규 배포 설정안과 준비 절차를 구체화한 것이다. **서버의 실제 설정·Docker 네트워크·서비스·volume은 변경하지 않았다.** 저장소 안의 코드·설정 템플릿·문서만 수정하고 오프라인 검사 후 게시했다.

이 파일은 해당 결과와 배포 입력표·후속 명령을 한곳에 모은 기록이다. 이 요약 자체는 코드 게시 후 별도 작성했으며, 아래 최종 코드 커밋에는 포함되지 않는다. 최초 작성 당시에는 **미커밋 파일**이었다. 요약 작성 중에는 시험이나 서비스를 다시 실행하지 않았다.

## 1. Git 기준과 게시 결과

| 항목 | 결과 |
|---|---|
| 작업 시작 | `87a2d37d3ec49462925771013aa8e2c8615755c9` |
| 저장소·브랜치 | [0u-Y/CallSign](https://github.com/0u-Y/CallSign), `main` |
| 코드·설정 커밋 | `8a174ca2bd32469730f99fed61d179fa66a4795d` — Derive ledger peers and staged checks from deployment inputs |
| 문서·증거 커밋 | `36e88bd8744c15f3e57cd76ca51645e268e9d41f` — Document host-specific chain preparation and deployment gates |
| 일반 push | 완료. 원격 main과 로컬 최종 SHA 일치 확인 |
| CI | [light 성공](https://github.com/0u-Y/CallSign/actions/runs/41302876671) |
| 기존 작업 보존 | 기존 미추적 요약6개·진행 포인터28개 유지. 관련 없는 파일은 stage하지 않음 |

시험은 시작 커밋 이후 미커밋 소스에서 수행했고, 검증한 코드는 이후 첫 커밋에 보존했다. 원본 증거의 시험 HEAD·시각·source hash를 최종 커밋에서 시험한 것처럼 바꾸지 않았다. 공개 이력 재작성·force push·hook 우회는 하지 않았다.

## 2. 발견해서 실제로 수정한 문제

| 문제와 영향 | 수정 | 주요 파일·요구사항 |
|---|---|---|
| ledger subnet과 Besu advertised/static peer 주소가 여러 곳에 고정되어 주소 변경 시 서로 어긋남 | `LEDGER_IPV4_PREFIX` 하나로 private IPv4 /24·validator .11~.14·advertised host·host allowlist·static peers/permissions를 파생 | `.env.example`, `infra/deploy/compose.yml`, `scripts/besu-peers.ts`, CHAIN-001/002·OPS-001/003 |
| 준비 스크립트와 Compose가 다른 prefix를 사용할 수 있음 | `prepare-besu-peers.ts --env-file`과 generator의 `CALLSIGN_ENV_FILE`을 기존 parser에 연결. 기존 peer 파일 내용이 다르면 덮어쓰지 않고 중단 | `scripts/prepare-besu-peers.ts`, `scripts/generate-besu.sh`, CHAIN-001/002 |
| 전체 preflight가 초기 체인에 필요 없는 PBX/OIDC/AI/web 설정까지 요구 | 기존 CLI에 `--phase chain --step prepare|nodes|deploy|witness` 추가. 단계별 결정·생성물 검사 분리. Witness 점검에 배포자 개인키를 요구하지 않음 | `scripts/preflight.ts`, `scripts/preflight-chain.ts`, OPS-003·TEST-001 |
| chain9서비스 추출본을 해석하려면 Besu만 켤 때도 아직 없는 app image·기관/승인자 값이 필요 | 원본 Compose에서 첫4노드 전용 plan도 추출. 같은 project로 계약·Witness를 나중에 추가 | `docs/RUNBOOK.md`, OPS-003 |
| 보간 전 짧은 host mount가 named volume으로 분류되어 추출본 파싱 실패 | Besu/Witness28개 mount를 명시적 bind·`create_host_path:false`로 변경. 누락 파일 자동 디렉터리 생성도 방지 | `infra/deploy/compose.yml`, OPS-001·TEST-001 |
| 설정 이름만 나열하면 사용자 결정과 이후 생성물을 구분하기 어려움 | 기존 RUNBOOK에 단일 입력표·검사별 A~E 분류·첫 실행 자원/명령/판정/정리 절차 반영 | MASTER·진행표·RUNBOOK·아키텍처·알려진 한계 |

기존 기본 prefix `10.203.0`과 과거 호환 Compose는 보존했다. 신규 후보를 현재 서버에 적용하지 않았으며, 기존 genesis·validator 키·기관 identity·epoch를 재생성하지 않았다.

## 3. 실제로 확인한 환경

| 읽기 전용 관측 | 결과·한계 |
|---|---|
| 기본 ledger | `10.203.0.0/24`가 현재 host/Docker 망과 중복 |
| 신규 후보 | `10.206.0.0/24`는 조회한 IPv4 interface·모든 routing table·Docker IPAM과 비중복. **제안이며 미적용** |
| 조회 범위 | Docker network26개, IPv4 route81개, interface27개. 개별 host IP·전체 route 목록은 공개 기록에 싣지 않음 |
| CPU/메모리 | 논리 CPU24개, available36157MiB(약35.3GiB) |
| Swap/디스크 | swap 사용10116MiB, 짧은 후속 두 표본의 in/out은0. 디스크 여유 약453GiB |
| 설치 도구 | Node22.22.2, pnpm11.27.0, Python3.12.3, Docker Compose5.0.0·iproute |
| Besu image | 로컬 tag26.8.1의 실제 RepoDigest 확인. 실행하지 않음 |
| app runtime image | 현재 소스의 이미지는 미생성. 이전 다른 image를 대신 사용하지 않음 |

이 값은 관측 당시 상태다. 실제 실행 직전에 다시 확인해야 하며, 현재 자원 여유만으로 기동이나 부하 시험을 허가한 것은 아니다. 숨은 VPN·조직망·향후 GCP 네트워크까지 비충돌을 보장하지 않는다.

## 4. 이번 검사 결과와 증거

| 검사 | 실제 결과 | 적용 범위 |
|---|---|---|
| 최종 `pnpm light` | **45개 파일·225개 시험 PASS** | 타입·소스 검사와 네트워크/listen 차단을 유지한 단위 검사 |
| 전체 Compose/PBX 구성 파싱 | PASS | 서비스 기동 없는 문법/구조 검사 |
| 첫4노드 plan | PASS | app/OIDC/PBX/AI 값 없이 후보 IP·subnet·advertised host·bind·project·자원 상한 파싱/대조 |
| chain9/auth8 추출본 | PASS | 미입력 값을 보간하지 않은 구성 파싱. 실제 준비 완료 아님 |
| generator·RUNBOOK shell/inline JS | PASS | 구문 검사. 명령 실행 성공을 뜻하지 않음 |
| diff·문서 링크·소스 hash·staged 내용 | PASS | 최종 코드가 light snapshot과 일치하고 비밀/관련 없는 파일 제외 |
| 전체 runtime preflight | **BLOCKED63 / PASS16 / SKIPPED1** | 실제 배포값 미입력 상태. 가짜 값으로 차단 수를 줄이지 않음 |

처음 추출본에서 발생한 mount 파싱 실패는 설정 결함으로 수정했다. Compose JSON의 memory limit 숫자 문자열을 정수와 직접 비교한 중간 검사 오류는 검사 코드 문제로 구분해 숫자로 비교했고, 예산 assertion은 유지했다.

현재 후보 prefix와 실제 관측만 전달한 단계별 preflight는 다음과 같다. 실제 project·배포 경로·chain ID나 생성되지 않은 키를 만들어 넣지 않았다.

| 단계 | PASS | BLOCKED | SKIPPED | 해석 |
|---|---:|---:|---:|---|
| prepare | 4 | 3 | 0 | 주소 후보는 확인, 공개 결정은 미정 |
| nodes | 4 | 4 | 0 | 실제 입력·노드 생성물 준비 전 |
| deploy | 6 | 9 | 1 | 로컬 artifact 일부 확인, 배포자·image 등 준비 전 |
| witness | 4 | 11 | 1 | 실제 metadata·공개 manifest·증언자 키 준비 전 |

검사 개수는 사용자 입력 개수나 완성률이 아니다. 코드 검사 PASS·설정 준비·실환경 검증을 분리한다. 이번 작업의 앞선223시험 기록은 당시 증거로 보존하고 최종225시험과 합산하지 않는다. 수정하지 않은 웹 build·계약/EVM·DB/브라우저 통합은 반복하지 않았다.

실제 수행한 대표 명령:

```sh
pnpm evidence:collect artifacts/chain-preparation-final-source-20261101.json light
bash -n scripts/generate-besu.sh
docker compose --env-file /dev/null -f infra/deploy/compose.yml config --no-interpolate --no-env-resolution --no-path-resolution --no-normalize --format json
git diff --check
```

증거:

- [이번 네트워크·차단 분류·구성 검사 기록](../artifacts/chain-preparation-20261101.json)
- [최종 light와 실행 당시 소스 hash](../artifacts/chain-preparation-final-source-20261101.json)
- [같은 작업의 선행 검사 기록](../artifacts/chain-preparation-source-20261101.json)

## 5. 배포 입력표와 단계별 사전 점검

아래는 현재 RUNBOOK의 입력표와 명령을 함께 실은 것이다. 실제 값의 지속 갱신 기준은 RUNBOOK이며 이 요약은 작성 시점 기록이다. **아래 생성·기동·RPC·배포·정리 명령은 향후 해당 범주의 명시적 실행 허가 후에만 사용한다. 이번에는 실행하지 않았다.**

### 2026-11-01 서버용 배포 입력표

**호스트 설정은 변경하지 않는다.** 현재 신규 배포 후보는 `LEDGER_IPV4_PREFIX=10.206.0`이다. 읽기 전용으로 확인한 interface·모든 IPv4 routing table·Docker IPAM과 비중복이며, 기존 `10.203.0.0/24`는 충돌한다. 숨은 VPN/조직망·미래 GCP까지 보장하지 않는다. 기본값은 기존 배포를 위해 보존했고 신규 env에서만 후보를 선택한다.

체인/Witness mount는 명시적 `type: bind`와 `create_host_path: false`로 선언해 보간 전 추출 시 named volume 오분류와 누락 파일 자동 생성을 막는다. Compose subnet·validator `.11`~`.14`·advertised host·host allowlist·static peers/permissions는 같은 prefix에서 파생된다. Witness와 deployer는 `besu1`~`besu4` 내부 DNS를 사용해 주소 중복 입력이 없다. 과거 호환 `infra/compose/docker-compose.yml`의 고정 주소는 보존하며 신규 배포에 섞지 않는다. **기존 배포 이동 시 genesis·validator 키·기관 identity·epoch를 재생성하지 않는다.** peer 도구는 기존 내용이 다르면 덮어쓰지 않고 중단한다. 기존 배포 이동은 원본 보존·정지 승인·새 peer 파일 검토·Compose 동시 전환의 별도 작업이다.

기준 파일은 기존 `.env.example`, 실제 입력은 Git 밖 보호 `CHAIN_ENV`/배포 env다. env를 `source`하지 않는다. `CHAIN_ENV`는 env 파일 경로, `CALLSIGN_PROJECT`와 아래 plan 경로는 작업자가 정하는 shell 변수다. Compose `-p`에는 env 파일과 같은 project 값을 지정한다. 새 설정 프레임워크나 별도 비밀 저장소는 만들지 않는다.

| 설정 → 소비자 | 공개/보호 참조 | 현재 값·상태 | 최초 단계·결정/생성 주체 | 없으면 막히는 기능 |
|---|---|---|---|---|
| `CALLSIGN_PROJECT` → Compose `-p`/chain preflight | 공개 ID | 미정인 고유 project; 기존 project와 겹치지 않게 선택 | 입력 검토·운영자 | 소유 자원 식별 |
| `LEDGER_IPV4_PREFIX` → Compose/peer generator | 공개 | **제안** `10.206.0`; 기존 기본 `10.203.0` 유지 | 입력 검토·망 관리자 | 주소 일관성/충돌 해소 |
| `LEDGER_OBSERVED_CIDRS` → preflight만 | 로컬 관측 | 매 실행 직전 아래 명령으로 조회 | 입력 검토·운영자 | 관측된 망과의 중복 판정 |
| `NETWORK_ID` → genesis/Besu/deployer | 공개 | template `20260914`의 신규 사용 여부 미정; 기존 chain ID는 유지 | 입력 검토·공동 운영자 | chain identity |
| `FINALS_DATA_DIR` → host bind | 보호 경로 참조 | 미정인 새 전용 절대 경로. container `/network`·`/keys`·`/trust`와 구분 | 입력 검토·운영자 | 준비물 위치·소유권 |
| `CALLSIGN_NETWORK_CONFIG`, `CALLSIGN_BESU_DIR` → generator | 보호 경로 참조 | 신규 설정 파일과 `${FINALS_DATA_DIR}/besu` | 네트워크 생성·운영자 | 올바른 genesis/키 mount |
| `BESU_IMAGE` → generator/validator4 | 공개 digest | 아래 로컬 RepoDigest 확인; 실행 지원은 미확인 | nodes·이미지 검토자 | 노드 기동 준비 |
| `CALLSIGN_APP_IMAGE` → deployer/Witness | 생성 공개 digest | **미생성**. 같은 source의 app Dockerfile runtime target build 후 확정 | deploy·승인된 build 담당 | deploy/Witness; nodes는 불필요 |
| `DEPLOYER_PUBLIC_ADDRESS`, `INITIAL_BALANCE_WEI` → network-config | 공개 | 미정. 잔액은 합성 네트워크의 배포용이며 실제 자산/보상 아님 | network 생성·배포자 | 배포자 genesis 잔액 |
| `DEPLOYER_KEY_PATH` → deployer `/deployer/key`만 | 보호 파일 | 미준비; validator/승인자와 별도 키 | deploy·배포자 | 계약 서명. Witness에 전달하지 않음 |
| `REGISTRY_APPROVERS` → 계약 생성자 | 공개 주소3개 | 서로 다른 키 소유자 미정;2-of-3 유지 | deploy·독립 승인자3명 | 공동 관리 정책 |
| `INSTITUTION_ID` → metadata/Witness query | 공개 | 미정. 첫 경로 전체에서16~128자 동일 값 | deploy·기관 책임자 | 기관 문맥 조회 |
| `REGISTRY_ARTIFACT_PATH`, `REGISTRY_ARTIFACT_SHA256` → `/artifact/registry.json` | 공개 파일/hash | template의 실제 오프라인 산출물/hash | deploy·검토자 | artifact 대조 |
| `DEPLOYMENT_WORK_DIR` → deployer `/release` | 보호 경로 참조 | 미정인 새 디렉터리. 실제 runtime UID가 쓸 수 있어야 함 | deploy·운영자 | 관측/pending/receipt 기록 |
| `EXPECTED_GENESIS_HASH`, `DEPLOYMENT_PATH` → deployer/trust/Witness | 실행 생성값 | 실제 RPC inspect와 배포 후 생성. host `${FINALS_DATA_DIR}/deployment.json` ↔ Witness `/trust/deployment.json` | deploy 이후·도구/운영자 | 생성 전 미입력은 정상; 생성 후 필수 |
| `besu/genesis.json`, `besu/keys/node{1..4}/key(.pub)` → validator4 | 키 보호·genesis/pub 공개 | 미생성 또는 기존 자료 검토 전 | nodes 전·승인된 generator/각 소유자 |4노드 준비 |
| `witness-keys/witness-{1..4}.json`, `public-manifest.json` → Witness/검증자 | 키 보호·manifest 공개 | 미준비. 각 Witness는 자기 RPC·키로 조회/서명 | Witness 전·증언자4명 | 공개키 고정·3-of-4 확인 |
| 기관 승인/콜센터/PBX/admin/stopper 키 → API/worker | 보호 파일 | 소유자 미정; 승인자·validator·Witness·배포자와 역할 분리 | 기관 등록/API·각 소유자 | 해당 역할만 차단 |
| `ISSUER_URI`, `SERVICE_URI`, `DEPLOYMENT_ID`, `FINALS_ACCOUNTS_PATH` → manifest/계정/Anchor | URI/ID 공개·accounts 보호 | 미정. 기존 keys 도구가 URI도 요구하므로 Witness 키 준비 전 결정 | keys/auth·기관/콜센터/IdP 관리자 | 해당 준비만 차단; Besu에는 불필요 |
| `ISSUER_DATABASE_URL`, `AUTH_DATABASE_URL`, `WORKER_DATABASE_URL`, PBX LOGIN/비밀번호, migration owner | 보호 참조 | 미준비. Platform은 DB 계정을 갖지 않음 | database·DB 관리자 | DB/API만 차단 |
| `WEB_ORIGIN`, `CALLSIGN_DOMAIN`, `PUBLIC_DEPLOYMENT`, `DEMO_MODE` → API/웹 | 공개 | 미정. 비loopback origin은 `true`/`false` 필요 | auth·도메인 운영자 | 실제 공개 인증 |
| `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUTHORIZATION_URL`, `OIDC_TOKEN_URL`, 업무/공식 client·audience | 공개 등록값 | 미정. **공개 client Authorization Code+PKCE**, 서로 다른 업무/공식 client·audience, `auth_time` 필요. 두 callback 모두 `${WEB_ORIGIN}/service` | auth·IdP 관리자 | 실제 인증; confidential-client 자동 지원 아님 |
| `SERVICE_EXTRA_CA_PATH` → Compose issuer/worker `/tls/extra-ca.pem`; host `NODE_EXTRA_CA_CERTS` | 공개 CA의 보호 경로 참조 | 미준비. Host Node는 시작 전 직접 지정, Compose만 자동 매핑 | auth/media/recovery·TLS 관리자 | TLS 신뢰. 개인키 포함 금지 |
| `CONSUMPTION_ANCHOR_URL/TOKEN` → issuer/worker | URL 공개·token 보호 | 별도 수명 HTTPS 저장소/운영자 미정. DB 백업과 함께 rollback 금지 | recovery/auth·독립 운영자 | checkpoint/gate. 같은 host는 host 장애 독립성 아님 |
| SIP/WSS/realm/domain·PBX 주소·ARI/ODBC/TLS·TURN 주소/자격·image | 주소/cert 공개·자격 보호 | 기본 media10.205.0.20, 나머지 미정. 내부 `https://asterisk:8089`, 브라우저 같은 origin `/pbx/ws` | trust/media·통신 운영자 | trust/media만 차단 |
| `TRUST_BUNDLE_PATH`, `VITE_SERVICE_TRUST_SHA256`, `CALLSIGN_WEB_IMAGE` → API/웹 | 생성 공개 파일/hash/digest | **미생성**. 계약 metadata+PBX 공개 cert→trust→pin→웹 build | trust/web·준비 도구 | 실제 웹 배포; 첫 chain 단계는 불필요 |
| STT/LLM key·model, retention/quota | 보호 자격·공개 정책 | 제공자/보관/소량 예산 미정, 기존 보관 기본604800초 | provider·기관/제공자 관리자 | provider만 차단 |
| GCP 주소/인증서/접근·registry 경로 | 공개 설정/보호 참조 | 미선택. chain/기관/epoch/소비 이력은 유지 | 이전 시·별도 승인 | 현재 서버 첫 단계와 분리 |

#### 기존63개 BLOCKED를 선행 원인으로 묶기

이 표의 A~E는 이번 준비 분류이며 기존 `preparation.category`의 A~F 의미를 바꾸지 않는다. [검사별 매핑](../artifacts/chain-preparation-20261101.json)은 현재 검사 ID 각각을 원인·주체·단계에 연결한다.

| 분류 | 원인과 파생 검사 | 준비 주체·소비 단계 |
|---|---|---|
| A 소스/설정 결함 | 고정 ledger 주소 분산·첫 단계와 전체 설정 혼합 | 이번 prefix 파생/chain 점검/4노드 plan으로 수정. host 설정 변경 없음 |
| B 공개 결정 | DNS/origin·OIDC 등록 및 분리, 기관/콜센터 ID/URI·chain ID·공동 승인자·SIP/TURN/공개 media·Anchor URL | 담당자 결정. nodes는 prefix/project/path/chain ID부터 |
| C 승인된 생성물 | image digest·역할 키·public manifest·PBX cert·deployment metadata·trust/pin | 승인된 image/key/cert/배포/trust 도구. 임의 값 입력 금지 |
| D 보호 참조/외부 계정 | accounts JSON·서로 다른 DB LOGIN·ARI/PBX/내부/Anchor token·TURN/provider 자격·공개 CA 참조 | DB/IdP/TLS/provider/역할 운영자. separation 오류는 동일 원인 |
| E 실행 관측 | image 내용·TLS·RPC/합의·receipt/code·Witness 서명/최신성·GRANT·media/provider | 단계 실행 승인 후. `network-and-runtime`의 SKIPPED는 PASS 아님 |

로컬 Besu tag26.8.1의 실제 RepoDigest: `hyperledger/besu@sha256:6f3f21ce533383fcc8db3bce02252b59d5a9e776b72b5a1c8ecd2db011600042`(linux/amd64). 실행 검증/미래 host 설치 보장은 아니다. 현재 source의 app runtime 이미지는 아직 없다. runtime build는 별도 승인 대상이고 웹 pin·PBX·OIDC를 기다릴 필요가 없다.

#### 기동 없는 단계별 사전 점검

기존 CLI에 `--phase chain --step prepare|nodes|deploy|witness`를 추가했다. 기존 runtime preflight를 완화하지 않는다. 입력 검토/노드 생성물/배포자 준비/Witness 준비를 분리하며 PASS는 로컬 검사 범위다. 매 실행 전 관측을 갱신하고 env에 영구 고정하지 않는다. default route만 제외하며 모든 table의 특정 IPv4 route·interface·Docker IPAM은 포함한다. 조회 실패는 빈 문자열로 진행하지 말고 중단한다.

```sh
# 읽기 전용. 출력은 CIDR 목록뿐이며 주소/route는 변경하지 않는다.
export LEDGER_OBSERVED_CIDRS="$(python3 - <<'PY'
import ipaddress,json,subprocess
run=lambda args: json.loads(subprocess.check_output(args,text=True))
ids=subprocess.check_output(['docker','network','ls','-q'],text=True).split()
nets=run(['docker','network','inspect',*ids]) if ids else []
routes=run(['ip','-j','-4','route','show','table','all'])
interfaces=run(['ip','-j','-4','address','show'])
cidrs={c['Subnet'] for n in nets for c in (n['IPAM'].get('Config') or []) if c.get('Subnet') and ':' not in c['Subnet']}
cidrs.update(r['dst'] for r in routes if r.get('dst') and r['dst'] not in ['default','0.0.0.0/0'])
cidrs.update(str(ipaddress.ip_network(f"{a['local']}/{a['prefixlen']}",strict=False)) for n in interfaces for a in n['addr_info'] if a['family']=='inet')
print(','.join(sorted(cidrs)))
PY
)"
test -n "$LEDGER_OBSERVED_CIDRS" || exit 1
pnpm preflight --env-file "$CHAIN_ENV" --phase chain --step prepare
# 아래 검사는 해당 생성물이 준비된 단계에서만 수행한다. 검사 자체는 기동하지 않는다.
pnpm preflight --env-file "$CHAIN_ENV" --phase chain --step nodes
pnpm preflight --env-file "$CHAIN_ENV" --phase chain --step deploy
pnpm preflight --env-file "$CHAIN_ENV" --phase chain --step witness
```

위 네 검사를 한 번에 통과시키려 하지 않는다. `prepare`에서 결정값을 검토하고 승인된 생성 단계 후 `nodes`, 실제 app image/배포자 준비 후 `deploy`, 실제 metadata·Witness 키 준비 후 `witness`를 실행한다. `generate-besu.sh`에 `CALLSIGN_ENV_FILE="$CHAIN_ENV"`를 전달하면 peer 설정도 같은 env를 읽는다. 직접 준비할 때는 `prepare-besu-peers.ts DIRECTORY --env-file "$CHAIN_ENV" --apply`다. Node/Compose 모두 env 파일보다 process 환경값이 우선이므로 오래된 prefix export를 제거/확인한다. 실행 허용변수는 env 파일에 저장하지 않는다.

신규 생성은 별도 허가 후 `prepare-service-network.ts NEW_CONFIG --apply`→`CALLSIGN_NETWORK_CONFIG`/`CALLSIGN_BESU_DIR`를 지정한 `generate-besu.sh`다. 기존 keys 도구는 **새 빈 배포 디렉터리**를 요구하므로 신규라면 `prepare-finals.ts keys`를 먼저 수행하거나, validator만 먼저 확인할 때는 향후 기관/Witness 키를 별도 새 경로에서 준비한 뒤 역할별 소유권을 검토해 배치한다. 기존 디렉터리에 keys를 재실행하지 않는다. 이번에는 어떤 키/파일 생성 도구도 `--apply`하지 않았다.

검토한 공개 입력은 해당 도구가 실제로 읽는 process 환경에도 전달한다. 아래는 **신규 배포 생성 허가 후**의 명령이며 이번에 실행하지 않았다. `FINALS_DATA_DIR`는 keys 명령에 대해 새 빈 경로여야 하고, `CALLSIGN_NETWORK_CONFIG`는 새 파일 경로다. `NETWORK_ID`·`DEPLOYER_PUBLIC_ADDRESS`·`ISSUER_URI`·`SERVICE_URI`·`BESU_IMAGE`는 위 입력표에서 확정한 값이어야 한다. 기존 키/배포가 있으면 이 블록을 사용하지 않는다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure \
  pnpm exec tsx scripts/prepare-finals.ts keys "$FINALS_DATA_DIR" --apply
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure \
  pnpm exec tsx scripts/prepare-service-network.ts "$CALLSIGN_NETWORK_CONFIG" --apply
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure CALLSIGN_ENV_FILE="$CHAIN_ENV" \
  CALLSIGN_BESU_DIR="$FINALS_DATA_DIR/besu" node scripts/restricted.mjs infrastructure \
  bash scripts/generate-besu.sh
```


## 6. 첫 체인 실행 자료·판정·정리

### 전체 설정에 묶이지 않는 첫 체인 plan

전체 Compose는 선택하지 않은 서비스의 `${VAR:?}`도 해석한다. OIDC/PBX/AI 값을 가짜로 채우지 말고 **원본에서 아래 고정 서비스만 추출**한다. 별도 AUTH_PLAN에는 인증 단계 구성만 넣어 아직 없는 TURN/Asterisk 이미지 때문에 인증 준비를 막지 않는다. PBX 공개 인증서·주소·ARI 보호 참조는 현재 서비스 trust 준비에 필요하다. 이는 운영자의 일회 준비 명령이며 별도 설정 기준/배포 플랫폼이 아니다. 설치 Compose의 `--no-path-resolution` 지원을 확인하고 저장소 루트에서 실행한다. `RAW_COMPOSE`/`NODES_PLAN`/`CHAIN_PLAN`/`AUTH_PLAN`은 서로 다른 새 절대 경로로 정하고, source·출력 파일은 새 보호 경로, `FINALS_DATA_DIR` 등 bind 참조는 절대 경로를 사용한다.

```sh
# 이 두 명령은 기동 없는 로컬 구성 처리다. output 경로는 새 파일을 사용한다.
docker compose --env-file /dev/null -f infra/deploy/compose.yml \
  config --no-interpolate --no-env-resolution --no-path-resolution --no-normalize --format json > "$RAW_COMPOSE"
node --input-type=module - "$RAW_COMPOSE" "$CHAIN_PLAN" "$AUTH_PLAN" "$NODES_PLAN" <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
const full=JSON.parse(readFileSync(process.argv[2],'utf8'));
const names=['besu1','besu2','besu3','besu4','registry-deployer','witness1','witness2','witness3','witness4'];
const plan={name:full.name,services:Object.fromEntries(names.map(n=>[n,{...full.services[n],...(n.startsWith('besu')?{mem_limit:'3g',cpus:2,restart:'no'}:n.startsWith('witness')?{mem_limit:'512m',cpus:0.5,restart:'no'}:n==='registry-deployer'?{mem_limit:'2g',cpus:1}: {})}])),networks:{ledger:full.networks.ledger},volumes:Object.fromEntries(['besu1-data','besu2-data','besu3-data','besu4-data'].map(n=>[n,full.volumes[n]]))};
writeFileSync(process.argv[3],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
const nodes={...plan,services:Object.fromEntries(names.slice(0,4).map(n=>[n,plan.services[n]]))};
writeFileSync(process.argv[5],JSON.stringify(nodes,null,2)+'\n',{flag:'wx',mode:0o600});
const authNames=['postgres','migration-runner','issuer','sender','platform','worker','web','https'];
const auth={name:full.name,services:Object.fromEntries(authNames.map(n=>[n,full.services[n]])),networks:full.networks,volumes:{'postgres-data':full.volumes['postgres-data'],'caddy-data':full.volumes['caddy-data']}};
writeFileSync(process.argv[4],JSON.stringify(auth,null,2)+'\n',{flag:'wx',mode:0o600});
JS
```

아래부터는 **실제 기동/chain 실행 허가 후에만** 실행한다. `CALLSIGN_PROJECT`는 동일 배포의 고유 이름, `CHAIN_ENV`는 선택한 체인 단계 공개/보호 참조다. image digest·키·artifact는 생성/검토된 실값만 사용한다. 신규 prefix 선택을 승인하고 해당 env로 peer/plan을 함께 준비하기 전에는 실행하지 않는다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$NODES_PLAN" \
  up -d --no-build --pull never --wait --wait-timeout 120 besu1 besu2 besu3 besu4
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain node scripts/restricted.mjs chain \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$CHAIN_PLAN" --profile operations \
  run --rm --no-deps --pull never registry-deployer pnpm exec tsx scripts/deploy-service-registry.ts inspect /release/network-observation.json
# 합의 진행은 새 output 이름의 두 관측과 동일 높이 block hash로 별도 판정한다.
# 관측 genesis hash를 EXPECTED_GENESIS_HASH에 반영하고 artifact/승인자/기관 문맥을 검토한 뒤만 배포:
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain node scripts/restricted.mjs chain \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$CHAIN_PLAN" --profile operations \
  run --rm --no-deps --pull never registry-deployer
# 새 deployment.json을 검토·배치한 뒤에만 Witness를 기동
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$CHAIN_PLAN" \
  up -d --no-deps --no-build --pull never witness1 witness2 witness3 witness4
```

계약 배포 기본 run 명령은 위 inspect 줄의 뒤쪽 `pnpm ... inspect ...` override만 제거한 동일 `registry-deployer` 호출이다. 그 command가 기존 `pnpm ledger:deploy-service --apply`다. 인증 단계는 같은 `-p "$CALLSIGN_PROJECT"`와 위 `AUTH_PLAN`을 사용해 `issuer sender platform web`만 `up --no-deps --no-build --pull never`하고 DB/Anchor 준비를 선행한다. registration 처리를 위해 worker를 별도로 시작한다. media 단계에서 `--profile pbx --profile media`로 `asterisk turn`을 추가하고 OIDC 검증은 HTTPS ingress가 필요하므로 인증 단계에서 승인된 기존 ingress 또는 `AUTH_PLAN`의 `--profile https` 서비스 `https`를 별도로 시작한다. media 추가는 원본 Compose/PBX overlay와 같은 project 이름을 사용한다. 각 `up`은 범주 승인 guard를 사용한다. 일반 `deployment.sh start`는 **전체 설정과 검증을 끝낸 이후**의 전체 기동 편의 명령이지 최초 단계별 검증 명령이 아니다.

### 첫 체인 실행의 자원·판정·정리

이 절의 **기동·RPC·키 생성·배포·정리 명령은 이번에 실행하지 않았다.** 첫 실행은 Besu4만 사용하는 `NODES_PLAN`, 이후 app image가 준비된 `CHAIN_PLAN`으로 deployer/Witness를 추가한다. DB·Anchor·API·웹·OIDC·PBX·TURN·AI는 실행하지 않는다. 전체 Compose의 미입력 값 때문에 첫4노드를 막지 않는다.

현재 설치: Node22.22.2, pnpm11.27.0, Python3.12.3, Docker Compose5.0.0, iproute 도구. source와 lockfile의 설치 의존성을 재사용한다. app image는 미생성이므로 임의의 과거 witness image를 대용하지 않는다. key/cert/image 생성·다운로드는 이번 승인 범위 밖이다. 다음 생성 과정의 역할별 파일 소유자와 container UID 접근을 먼저 확인하고 `chmod 777`로 해결하지 않는다.

첫4노드 plan은 **시험용 상한 제안**으로 각 memory3GiB·CPU2·restart=no를 적용한다. Besu4 합계12GiB, 이후 Witness4 각512MiB·CPU0.5와 deployer2GiB를 합쳐 최대16GiB를 예약하고 기존 작업에 available16GiB 이상을 남기는 조건으로 시작한다. 미실행 Besu의 실제 요구량이 아니라 중단 가능한 시험 예산이다. 첫 노드/계약/Witness 각 단계는 최대10분, TCP health 준비는 최대120초만 기다린다. 시작 직전 자원을 다시 조회하고 여유 부족이면 시작하지 않는다. `vmstat 1 3`, `free -m`, `uptime`, `df -h`, 다음 project 제한 stats로 관측한다.

```sh
# 허가 후 자원 관측. project label로 이번 컨테이너만 선택하며 env/명령 인자는 출력하지 않음.
owned_ids="$(docker ps -q --filter "label=com.docker.compose.project=$CALLSIGN_PROJECT")"
if [ -n "$owned_ids" ]; then docker stats --no-stream $owned_ids; fi
```

available16GiB 미만, 지속적인 swap in/out 증가, 기존 작업의 영향, OOM/restart, disk 여유20GiB 미만, identity 불일치·height 정지·quorum 부족이면 중단한다. 메모리 제한 때문에 실패하면 그 사실을 남기며 자동 확장/반복 기동하지 않는다. 컨테이너 제한은 합의 성능/SLA 측정이 아니다.

| 순서 | 정확한 실행/관측 | 성공 assertion·산출물 | 실패 시 |
|---|---|---|---|
| 1 입력/생성물 검사 | 위 `preflight --phase chain --step prepare`, 승인된 생성 후 `nodes`, node plan `config --quiet` | 새 project·경로·선택 prefix·최신 망 관측·genesis/peer/키 metadata 일치 | BLOCKED/FAIL이면 기동하지 않음 |
| 2 Besu4 | 아래 NODES_PLAN의4서비스만 기동, `--wait --wait-timeout 120` 추가 가능 | 프로세스 health와 RPC는 생존 증거. 이후 inspect 두 개 시점에서 네 노드의 같은 chain/genesis, 동일 높이의 block hash 일치, 모든 height 전진을 별도로 확인 | TCP만 열렸으면 합의 PASS 금지 |
| 3 실제 계약 | app image 준비→`deploy` preflight→아래 inspect→관측 genesis hash 검토→같은 deployer 기본 명령 run | receipt success·배포 주소·code hash·PROFILE/초기 정책·생성자 승인자 일치. pending journal/metadata 보존 | 결과 불명은 같은 tx hash 조회. 새 nonce/새 배포로 우회 금지 |
| 4 Witness4 | metadata를 host `${FINALS_DATA_DIR}/deployment.json`에 검토 배치→`witness` preflight→아래4서비스 | 자기 RPC별 실제 canonical block 대조·고정 공개키의 서로 다른3서명·동일 snapshot·10초 freshness | health200만 PASS 금지. 서명·code/chain 불일치면 중단 |

네 노드의 **동일 높이 block hash 대조**는 실제 RPC `eth_getBlockByNumber`로 한다. 기존 inspect 산출물은 chain/genesis/높이만 기록하므로 그것만으로 동일 높이의 합의나 장애 내성을 판정하지 않는다. 운영자는 두 inspect 사이에 `docker compose ... exec -T besuN`의 설치된 RPC 클라이언트 또는 아래 app 런타임의 viem으로 동일 block을 조회하고 관측값을 evidence에 남긴다. 장애 주입/validator 축소는 이 첫 정상 연결 단계에 포함하지 않는다.

Witness 판정은 기존 `aggregateWitnesses`/`verifyStateBundle`을 재사용한다. 공개 manifest는 API가 돌려준 키가 아니라 각 키 소유자가 검토한 사전 자료다. 다음은 **새로 배포한 미등록 기관 상태만** 확인하는 명령이다. 기관이 이미 등록되어 policyVersion이0이 아니면 이 명령을 수정해 계속하지 말고 별도 current policy/trust 검토 단계로 이동한다. 미등록 상태의 증언 성공은 업무 발신 권한의 성공이 아니다. 기존 failover 스크립트는 이전 Compose/API/DB를 기동하므로 여기서는 사용하지 않는다.

```sh
# 실제 chain 실행 승인 후에만. 공개 manifest 하나만 추가 mount, 장기 개인키는 읽지 않음.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain node scripts/restricted.mjs chain \
  docker compose -p "$CALLSIGN_PROJECT" --env-file "$CHAIN_ENV" -f "$CHAIN_PLAN" --profile operations \
  run --rm -T --no-deps --pull never \
  -v "$FINALS_DATA_DIR/public-manifest.json:/public-manifest.json:ro" \
  registry-deployer node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createPublicClient,http} from 'viem';
import {aggregateWitnesses} from './services/api/src/witness-aggregate.ts';
import {verifyStateBundle} from './packages/verifier/src/index.ts';
const d=JSON.parse(readFileSync('/release/deployment.json','utf8'));
const m=JSON.parse(readFileSync('/public-manifest.json','utf8'));
const clients=[1,2,3,4].map(n=>createPublicClient({transport:http(`http://besu${n}:8545`,{timeout:2500,retryCount:0})}));
const heights=await Promise.all(clients.map(c=>c.getBlockNumber()));
const height=heights.reduce((a,b)=>a<b?a:b);
const blocks=await Promise.all(clients.map(c=>c.getBlock({blockNumber:height})));
assert.equal(new Set(blocks.map(b=>b.hash)).size,1);assert.ok(blocks[0].hash);
const trust={networkId:d.networkId,genesisHash:d.genesisHash,registryAddress:d.registryAddress,registryProfile:d.registryProfile,policyVersion:'0',witnessThreshold:3,supportedProtocolVersions:[1],enrollmentPublicKey:m.publicKeys['issuer/approval-v1'].publicJwk,witnessPublicKeys:[1,2,3,4].map(n=>({witnessId:`witness-${n}`,kid:m.publicKeys[`witness-keys/witness-${n}`].kid,jwk:m.publicKeys[`witness-keys/witness-${n}`].publicJwk}))};
const delegationId='callsign-bootstrap-absent-delegation';
const bundle=await aggregateWitnesses({endpoints:[1,2,3,4].map(n=>({witnessId:`witness-${n}`,url:`http://witness${n}:${4200+n}`})),institutionId:process.env.INSTITUTION_ID,delegationId,trust,timeoutMs:5000});
const result=await verifyStateBundle(bundle,trust,{nowWallSeconds:Math.floor(Date.now()/1000),nowMonotonicMs:performance.now(),expectedInstitutionId:process.env.INSTITUTION_ID,expectedDelegationId:delegationId,maxStateAgeSeconds:10,maxFutureSkewSeconds:0});
assert.equal(result.snapshot.institutionState.exists,false);assert.equal(result.snapshot.delegationState.exists,false);
assert.ok(result.signerIds.length>=3);
writeFileSync('/release/initial-witness-observation.json',JSON.stringify({recordedAt:new Date().toISOString(),scope:'real RPC/signed absent-state; not institution enrollment or fault tolerance',sameHeight:String(height),blockHash:blocks[0].hash,bundle,result},null,2)+'\n',{flag:'wx',mode:0o600});
JS
```

각 단계 시작/종료·설정/source/image/contract/manifest hash·성공/실패 assertion·자원 관측을 보존한다. 생성 전 `docker compose ls`, project label의 기존 container/network/volume 목록을 보호 실행기록에 저장한다. **이미 존재하는 project가 있으면 새 시험으로 간주해 정리하지 않는다.** 실패 시 먼저 이번 node/witness 서비스만 `stop -t 20`하고 로그·inspect의 허용 metadata를 보존한다. 이후 운영자가 생성 전 목록과 대조해 이번 container ID만 `docker rm`, 이번 network ID만 `docker network rm`한다. 이 명령에도 infrastructure guard를 적용한다. 체인 named volume/키·genesis·pending tx·metadata는 기본 보존하며, 삭제가 필요하면 별도 소유권·폐기 허가 뒤 정확한 ID에만 `docker volume rm`을 쓴다. `down -v`, prune, 기존 network 삭제는 사용하지 않는다. 이번에는 어떤 stop/rm도 실행하지 않았다.


## 7. 이번 종료 상태와 다음 최소 입력

**준비 코드·설정안·절차와 게시:** 완료. **실제 배포 설정:** 일부 미정. **실환경 실행:** 미검증이다.

첫4노드 실행 전에 필요한 결정은 다음으로 제한한다.

1. 신규 배포인지 기존 배포 이동인지, 현재 후보 `10.206.0.0/24`를 사용할지.
2. 고유 Compose project, 배포 전용 host 경로, 사용할 chain ID.
3. 배포자 공개 주소와 validator 키 생성·보관 책임. 이후 계약/Witness 단계 전에는 기관 문맥·공동 승인자3명·Witness4명의 책임을 확정한다.

키 원문·비밀번호·토큰을 채팅으로 제공할 필요는 없다. app image digest·genesis·validator 공개 정보·계약 주소/metadata·trust/pin은 승인된 생성 과정에서 확보할 값이다. OIDC·PBX·AI 전체 설정을 첫 Besu 기동의 선행 조건으로 요구하지 않는다.

이번 작업에서는 임시 Compose JSON만 소유 임시 디렉터리에서 정리했고 서비스·컨테이너·network·volume·키를 생성하거나 종료하지 않았다. 기존 미추적34개를 보존했고, 이 요약을 최초 추가한 당시에는 별도 미커밋 상태였다. 당시 요약 요청만으로 추가 commit/push를 하지 않았다.

상세 기준:

- [MASTER](MASTER-DEVELOPMENT-SPEC.md): 요구 ID와 완료 조건.
- [이번 진행 기록](FINALS-IMPLEMENTATION-PLAN.md#chain-preparation-20261101): 변경·증거·남은 경계.
- [RUNBOOK](RUNBOOK.md#2026-11-01-서버용-배포-입력표): 입력과 후속 명령의 현행 기준.
- [알려진 한계](KNOWN-LIMITATIONS.md), [아키텍처](ARCHITECTURE.md).

**미실행:** 모든 노드/서비스·키/인증서 생성·이미지 build/download·계약 배포·외부 AI·GCP. 오프라인 통과와 같은 호스트의 준비만으로 실제 합의·분산 내성·음성·복구 성공을 주장하지 않는다.
