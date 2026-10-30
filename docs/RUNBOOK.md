# 개발·배포·복구 운영 절차

**현재 단계에서는 아래 실환경 명령을 실행하지 않는다.** 사용자 요청으로 해당 범주 실행이 명시적으로 승인된 뒤 운영자가 수행한다. 자동 차단은 보안 sandbox가 아니라 실수 방지 장치다. 기존 프로세스·키·볼륨·증거를 정리하거나 초기화하지 않는다.

## 배포 후보와 실제 연결 순서

기준일2026-10-31, 조사 시작 `a6e2452`. 이 절은 현재 코드의 다음 실제 연결 절차이며 **아래 기동·생성·배포 명령은 이번에 실행하지 않았다.** 설정 준비와 소스 검사 통과는 실환경 연결 성공이 아니다. [검증·차단 기록](FINALS-IMPLEMENTATION-PLAN.md#release-candidate-20261031)을 함께 본다.

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

## 현재 실행 계약

기본 서비스는 등록 URI·갱신형 통화 유지·Asterisk 경로다. 실제 SQL·로컬 EVM·로컬 인증/HTTP/Chromium·영속 Anchor/application 복원의 선택 경계는 날짜별 증거로 확인했다. 체인/Witness·PBX/RTP·실제 IdP/AI·GCP의 전체 연결은 미검증이다. 신규 설치 migration은 `0000`~`0006`이며 새 cluster 복원은 먼저 빈 대상에 역할만 준비한다. 이번 배포 후보 검토는 어떤 서비스 기동도 승인하지 않는다. [현재 기준](#배포-후보와-실제-연결-순서).

용어: migration은 DB 구조 변경 적용, provisioning은 새 기관·계정·키 준비, trust bundle은 미리 신뢰할 기관·공개키·체인 설정이다. manifest는 배포 구성 기록, image digest는 이미지 내용 해시, scope는 로그인 용도다. OIDC는 외부 로그인 표준, TURN은 음성 중계, ARI는 Asterisk 교환기 제어 인터페이스다. [전체 통신 용어](PROTOCOL.md#protocol-profiles).

## 지금 가능한 작업

이미 설치된 의존성으로 `pnpm light`, `pnpm --filter @callsign/web build`. Compose 정적 검사: `docker compose -f infra/deploy/compose.yml config --no-interpolate --no-env-resolution --format json`. 서비스 기동·이미지 접근은 하지 않는다. `lint`는 소스 위생/문법 검사이며 전체 ESLint 검사가 아니다.

## 실행 범주

| 범주 | 이후 명시적 실행값 | 경로 |
|---|---|---|
| 인프라 기동/정지/이전 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure` | `scripts/deployment.sh`, 역할별 서비스 실행 파일 |
| DB 통합 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration` | `pnpm test:integration` |
| 계약·원장 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain` | 계약/장애 시험, 개별 승인자 서명 도구 |
| 미디어 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media` | `pnpm test:media`(기본 PBX/직접 통화 시험; 필수 env에 따라 NOT-RUN), `pnpm test:e2e`(초기 시연 경로), `demo:record` |
| 성능 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=performance` | `pnpm test:benchmark` |

범주값을 `.env.example`에 미리 설정하지 않는다. 직접 스크립트 실행과 Playwright/Vitest 통합 설정도 기본 거절한다. `media` E2E는 하위 dev 실행에 infrastructure 범주를 전달하므로, 스택 기동까지 승인된 뒤에만 실행한다. 체인/미디어/성능 CI 자동 실행은 없다. 수동 integration workflow는 GitHub `infrastructure-validation` environment의 required reviewers도 설정해야 한다.

## 프로필·로그인·재시작

기본은 `SERVICE_PROFILE=service`, `VITE_PROTOCOL_PROFILE=service`, `/service`다. `/v3/auth/me?purpose=work|official`과 `/v3/auth/logout`은 로그인 용도별 CSRF·쿠키·audience를 검사한다. 일반/공식 client와 audience를 분리하고 OIDC의 실제 `auth_time`을 제공해야 한다. 중요 관리 작업은 5분 이내 재인증을 요구한다. 로그아웃은 해당 용도 세션만 회수하고 replay ledger는 유지한다.

이전 직접 통화는 `SERVICE_PROFILE=finals`, `VITE_PROTOCOL_PROFILE=finals`, `/finals`와 기존 `/v2` API를 명시적으로 선택하는 호환 배포다. 이 경로의 DID 문서·`VITE_FINALS_TRUST_SHA256`·짧은 승인 만료 의미를 기본 서비스에 섞지 않는다. 초기 시연 `demo:*`는 고정 개발 키/데이터를 사용하므로 공개 기본 배포 도구가 아니다.

기본 배포 준비는 아래 ‘등록 주소·교환기 기본 서비스’를 따른다. 기동·정지·재시작은 해당 동작을 허가받은 후 `CALLSIGN_ENV_FILE=/etc/callsign/deployment.env bash scripts/deployment.sh start|stop|restart`를 사용한다. 이미지 자동 build/pull·migration·계약 배포·키 재발급은 일반 기동에 포함하지 않는다. `health`는 생존이고 `readiness`는 키·trust·DB gate·교환기 관측 등 준비 상태이며 실제 통화 성공은 아니다.

백업·복원은 아래 ‘일관 백업·새 대상 복원’, 키 회전은 ‘기관키·콜센터키 교체’를 따른다. 도메인 변경 시 기관 URI·VC·trust pin·OIDC callback/audience·origin·HTTPS/WSS·TURN을 함께 검토한다. 선택 DID 배포만 DID 문서도 변경한다. 기본 준비에는 DID 게시가 필수가 아니다.

## 역할별 직접 통화 자동 시험: 작성했으나 미실행

`playwright.finals.config.ts`는 서버를 자동 기동하지 않는다. 실제 역할 분리 직접 통화 경로 스택과 browser/microphone을 별도로 준비한 뒤 `pnpm test:media`를 사용한다. `CALLSIGN_MEDIA_ORIGIN`, 사전 로그인한 상담원/수신자의 Playwright storage 파일 경로(`CALLSIGN_MEDIA_GATEWAY_STORAGE`, `CALLSIGN_MEDIA_RECIPIENT_STORAGE`), 할당 업무 ID와 원장 등록 VC 내용 해시(`CALLSIGN_MEDIA_INTENT_ID`, `CALLSIGN_MEDIA_CREDENTIAL_DIGEST`)가 필요하다. 값이 없으면 NOT-RUN skip이며 PASS가 아니다. 이 시험은 실제 마이크 권한을 사용하고 STT 동의 버튼을 누르지 않아 유료 제공자는 호출하지 않는다. 해당 시험 코드는 native getStats에서 수락 전0/후 증가와 remote track 종료를 확인하지만 아직 실행하지 않았다. PBX용 `tests/media/service-pbx.spec.ts`도 작성했다. TURN relay·제공자 동의철회·실제 지연은 후속 실환경 검증 대상이다.

## 승인 뒤 통합 검증 순서

1. PostgreSQL migration·별도 계정 권한, 취소/소비 경합, crash 후 동일 영수증, 다른 승인·세션 결합 거절.
2. Issuer/Sender/OIDC의 인증·할당·키 mount·공식 업무 별도 audience와 객체 권한.
3. Besu4·witness4의 같은 chain/genesis/block/payload, VC 내용 해시 등록·철회, stale/정지/rollback, 실제 새키 복구.
4. 별도 기기의 HTTPS/WebRTC 마이크, 수락 전0 audio, 양방향 수락/음소거/거절/종료/장치오류, TURN relay/만료, 재연결 재검증.
5. STT/provider 소량 시험, partial/final/수정/동의철회/요청상한, 실제 지출/민감 로그 검사.
6. PBX는 Asterisk PJSIP/WSS·ARI·실제 DTLS-SRTP 종단·브리지와 브라우저 verifier를 대조한다. 제어 성공만으로 실제 음성 연결을 판정하지 않는다.
7. 허용된 소규모 장애/부하, GCP 재시작·backup/restore·rollback을 별도 실행하고 새 커밋·환경·raw 결과를 기록한다.

## 등록 주소·교환기 기본 서비스: 현재 실행 계약

기본 화면은 `/service`, `VITE_PROTOCOL_PROFILE=service`, 서버는 `SERVICE_PROFILE=service`다. `/finals`는 이전 직접 통화 호환 화면이다. 기본 서비스의 변경 요청을 이전 형식 API에 보내면 `COMPATIBILITY_PROFILE_REQUIRED`로 거절하며 검증 실패 때 이전 검증기로 우회하지 않는다. 인증 자체는 일반/공식 용도를 분리한 같은 구현을 두 경로가 공유한다.

### 새 배포 준비와 실행 승인 후 순서

아래 명령은 **현재 실행하지 않았다**. 각 명령은 별도 허가에 맞는 기존 guard가 있어야 동작한다. 이 문서가 실행 허가를 대신하지 않는다. 저장소의 예전 `demo:up`·`ledger:deploy`는 알려진 개발 키와 초기 시연 데이터를 사용하는 도구이며 공개 기본 배포에 쓰지 않는다.

1. 새 배포 경로, HTTPS/DNS·OIDC 두 audience/client·auth_time 정책, 독립 anchor의 HTTPS/인증·별도 저장소, 역할별 DB LOGIN, Asterisk 이미지 digest·ODBC driver, TURN과 공개 미디어 주소를 준비한다. `.env.example`은 이름만 제공하며 비밀값은 별도 보호 파일에 둔다. 최초 anchor는 별도 DB의 `infra/deploy/anchor-schema.sql`에 새 deployment/institution의 sequence `0`, 64자리 zero hash, epoch `1`로 한 번 사전 등록한다. 이 저장소를 VM 백업과 함께 복원하지 않는다. `pnpm anchor`는 별도 호스트의 loopback에서 기존 Fastify를 사용하며 HTTPS reverse proxy 뒤에 둔다.
2. 새 기관/콜센터 URI로 `pnpm exec tsx scripts/prepare-finals.ts keys NEW_DIRECTORY --apply`를 사용한다. 기관·Sender·PBX·Witness 키를 나눠 보관하고, 관리 승인자 3명의 개인키는 각자 환경에만 둔다. `accounts.json`은 기존 `provisioningAccountsSchema`를 따른다. 기관 담당자에는 `contact.manage`, 위임 관리자에는 `delegation.manage`, 긴급 정지자는 `institution.suspend`, 공동 복구 담당자는 `institution.recover`/`key.activate`를 명시한다. 상담원·수신자에게 관리 permission을 주지 않는다. 빈 permission은 관리 권한이 없다.
3. 새 Besu 설정은 `pnpm exec tsx scripts/prepare-service-network.ts NEW_NETWORK_CONFIG --apply`로 작성한다. `NETWORK_ID`, 본인 배포 계정의 `DEPLOYER_PUBLIC_ADDRESS`가 필요하다. 이어 사전 검토한 로컬 이미지에 대해 `CALLSIGN_NETWORK_CONFIG`, `CALLSIGN_BESU_DIR`, `BESU_IMAGE`를 지정해 `bash scripts/generate-besu.sh`를 실행한다. 이 도구는 validator 생성 컨테이너를 실행하므로 지금은 금지된 단계다. 이미지 자동 pull은 막았고 기존·불완전 키를 덮어쓰지 않는다.
4. 실제 migration은 `pnpm exec tsx scripts/migrate-finals.ts --apply`로 `0000`~`0005`를 적용한다. 별도 계정의 GRANT를 확인한다. `pnpm exec tsx scripts/provision-finals.ts PUBLIC_MANIFEST ACCOUNTS_JSON --apply`는 새 기관·역할 계정용이며 기존 DB 덮어쓰기 도구가 아니다.
5. 실제 체인을 명시적으로 기동한 뒤 검토한 새 ServiceRegistry artifact와 새 배포 계정 키 하나로 `pnpm ledger:deploy-service --apply`를 사용한다. `REGISTRY_ARTIFACT_PATH`, 그 파일의 `REGISTRY_ARTIFACT_SHA256`, `EXPECTED_GENESIS_HASH`, `DEPLOYER_KEY_PATH`, `DEPLOYMENT_PATH`, `BESU_NODE_URLS`가 필요하다. 서명한 배포 요청을 `.pending.json`에 보존하며 응답 유실 후 같은 hash로 조회한다. 기관 등록·seed·자금 전송을 자동 수행하지 않는다. 출력은 실제 code hash와 배포 높이·registry profile·초기 정책 hash를 포함한다. 이 저장소의 `artifacts/service-registry-build-20261027.json`은 오프라인 컴파일 산출물이며 배포 증거가 아니다. 생성자에 승인자3과 초기 policyHash가 들어간다.
6. Asterisk 설정은 `pnpm exec tsx scripts/prepare-pbx.ts NEW_CONFIG_DIRECTORY --apply`로 작성한다. `.example`의 외부 주소와 비밀값을 검증해 치환하며 기존 폴더를 덮지 않는다. 검토한 Asterisk 22 이미지에 PJSIP/WSS·ARI·ODBC·SHA-256 digest 인증 기능과 PostgreSQL Unicode driver가 있어야 한다. 실제 driver 이름이 `PostgreSQL Unicode`인지 확인한다. `odbc.ini`는 [공식 ConnSettings](https://odbc.postgresql.org/docs/config-opt.html)로 `pbx,pg_catalog` search_path를 지정한다. PBX 로그인에는 pbx schema만 허용한다.
   미디어 구성은 고정 컨테이너 IPv4 `10.205.0.20`을 `PBX_PRIVATE_ADDRESS`로 사용한다. 배포 Compose의 고정 주소와 endpoint의 `media_address`가 같아야 한다. `PBX_PUBLIC_ADDRESS`는 같은 포트를 보존하는 정적 1:1 NAT의 공인 IPv4다. 검토한 [Asterisk 22 RTP 설정](https://raw.githubusercontent.com/asterisk/asterisk/22/configs/samples/rtp.conf.sample)의 `ice_host_candidates`로 이 주소를 매핑한다. 다른 NAT 구조라면 이 예제를 그대로 쓰지 말고 실제 ICE 후보·RTP 수신 경로를 검증한 구성으로 바꾼다. Asterisk의 자체 STUN/TURN 설정과 정적 host mapping을 무조건 함께 켜지 않는다. 브라우저 TURN은 별도다. `gw_priority`를 사용하는 이 Compose는 [Docker Compose 2.33.1 이상](https://docs.docker.com/reference/compose-file/services/#gw_priority)이 필요하다. 여기서 버전/주소는 실행 검증된 값이라는 뜻이 아니다.
7. Asterisk TLS/DTLS 인증서는 `asterisk/tls/cert.pem`, 개인키는 `key.pem`에 둔다. 내부 ARI/WSS 인증서의 SAN은 `asterisk`를 포함하고 신뢰 CA를 사용한다. 공개 인증서·CA만 `asterisk/tls/public/{cert.pem,ca.pem}`으로 복사한다. Issuer/worker/nginx에는 이 공개 폴더만 mount한다. 기관키·콜센터키·PBX 개인키를 브라우저에 전달하지 않는다. `SIP_WSS_URL`은 같은 공개 origin의 `/pbx/ws`다. ARI 8089는 내부 전용이며 PBX UDP 10000~10099, TURN 포트는 검토한 방화벽에서만 연다. GCP에서는 `enable_pbx_media`·`enable_turn`을 명시 검토한다.
8. `pnpm exec tsx scripts/prepare-finals.ts trust DIRECTORY NEW_TRUST_OUTPUT --apply`으로 URI·등록 키·PBX 인증서 지문·4개 Witness와 정책을 고정한다. 출력한 `VITE_SERVICE_TRUST_SHA256`으로 웹을 빌드한다. 이후 실제 배포는 같은 소스의 고정 이미지와 `compose.yml`+`compose.pbx.yml`, `https/pbx/media` profile을 사용한다. GCP systemd도 같은 구성을 사용하며 일반 재시작에 초기화·배포·seed를 끼우지 않는다.
9. 기관 관리 화면에서 EIP-712 최초 등록 요청과 독립 승인자 2명의 서명을 제출한다. `scripts/sign-recovery.ts REQUEST ONE_KEY EXPECTED_DIGEST register --sign`는 승인자 키 하나만 사용한다. `pnpm worker`는 별도 원장 관리/긴급 정지 키와 worker DB 계정만으로 실행한다. worker의 등록 확정과 Witness 상태를 확인한 뒤 업무 위임을 발급한다. VC 등록 worker가 처리한 다음 상담원/수신자 두 웹에서 새 통화 시도·개별 승인·등록·발신·수락을 진행한다. 두 화면의 SDK 검증 전 마이크를 전송하면 실패다.

### 설정의 기준과 최초 준비 순서

현재는 아래 작업을 **실행하지 않는다**. 각 단계의 실제 명령과 입력 경로는 바로 위 [새 배포 준비 절차](#새-배포-준비와-실행-승인-후-순서)의1~9번과 아래 표를 함께 따른다. 준비 도구는 기본 dry-run이며 `--apply`/`--sign`와 기존 실행 guard를 모두 요구한다. 보호 env 파일은 데이터로 읽고 shell의 `source`로 실행하지 않는다. 실제 비밀값은 채팅·증거·Git에 넣지 않는다. 아래 개별 준비 명령은 보호된 프로세스 환경의 입력을 사용한다. `--env-file` 지원은 preflight/prepare:execution/validate와 deployment.sh의 명시적 입력에 한정하며, 개별 도구에 지원하지 않는 옵션을 붙이지 않는다. [준비 계획 도구](../scripts/prepare-execution.ts)는 로컬 검사와 순서만 출력한다.

| 기준/산출물 | 준비 주체·입력 | 생성과 검증 시점 |
|---|---|---|
| 공통 정책·템플릿 | 저장소의 `.env.example`, 계약 profile, 기본 정책·lease | 정책값은 운영자가 검토한다. 템플릿 복사는 실제 설정 완료가 아니다 |
| 배포 공개 설정 | 운영자의 배포/기관 ID, 기관·콜센터 URI, chain ID, HTTPS/WSS·TURN·OIDC 등록값, 승인자 공개 주소3개 | `pnpm prepare:execution --env-file PROTECTED_ENV --dry-run`; 비밀값 대신 보호 파일·환경 참조 |
| 앱 이미지·서비스 키 | 같은 소스의 app Dockerfile, 각 키 소유자 | 앱 이미지를 먼저 준비한다. 새 빈 디렉터리에 기관/콜센터/PBX/Witness 키를 생성하고 공개 manifest를 남긴다. 관리자/정지/공동 승인키는 별도 소유한다 |
| DB·최초 계정 | 새 시험 DB, owner 연결, 네 개의 서로 다른 LOGIN 비밀 참조, 검증할 OIDC issuer/subject | `0000`~`0005` migration → `psql -X -v ON_ERROR_STOP=1 -f infra/deploy/provision-logins.sql` → 최초 `provision-finals.ts --apply`. SQL은 기존 LOGIN이 있으면 정지하며 비밀번호를 바꾸지 않는다 |
| 체인·계약 metadata | 검토 이미지·genesis·validator 키, deployer 하나, ABI artifact | 명시적 체인 기동/배포 후 실제 주소/code hash/배포 블록을 기록한다. `.pending.json`이 있으면 같은 tx hash부터 재조회한다 |
| PBX·공개 trust | 실제 Asterisk 모듈/ODBC driver·인증서·CA, 공개 manifest, 실제 deployment metadata | PBX 설정 → trust 생성 → canonical trust hash를 고정해 웹 이미지 build. 웹 이미지는 앱 이미지와 달리 이 단계까지 만들 수 없다 |
| 독립 anchor·서비스 | 별도 관리자/수명 저장소, 새 배포의 zero record, 위 산출물 | 초기 계정 등록은 gate를 닫힌 상태로 둔다. 서비스가 실제 zero anchor와 최초 checkpoint를 확인한 후만 gate를 연다. 기존 anchor는 초기화하지 않는다 |
| 기관·위임 | 최근 인증한 첫 기관 관리자, 별도로 준비한 공동 승인자 | 관리 UI 등록 → 독립 두 서명 → worker 확정 → Witness 대조 → 위임 등록 확정. 최초 trust 생성은 기관 등록 완료를 기다리지 않는다 |
| 실행 증거·릴리스 | 실제 단계별 assertion/파일 hash, 환경 identity | dirty worktree 검사와 clean Git 릴리스를 구별한다. 이미지·metadata·trust는 나중에 생성되는 결과이며 지금 사용자가 추측할 값이 아니다 |

Compose의 migration-runner는 앱 이미지·공개 manifest·최초 accounts 파일 mount가 필요하다. 따라서 **앱 이미지/키/검토한 accounts JSON을 먼저 준비**하고 DB 전용 작업을 수행한다. 최초 관리자와 공동 승인자는 이 파일에서 준비하며 일반 관리 API로 공동 승인자를 임의 생성하지 않는다. 역할별 DB 로그인 provisioning은 migration 완료 뒤 owner가 수행하고, 서비스 계정으로 migration하지 않는다.

전체 Compose 모델을 bootstrap에서 파싱할 수 있도록 웹 이미지의 미준비 sentinel과 빈 trust pin 기본값을 두었다. sentinel은 실행 가능한 이미지가 아니며 full preflight와 `deployment.sh start`가 실제 7개 digest와 pin을 요구한다. 이것을 준비 완료로 해석하거나 직접 전체 `up`으로 건너뛰지 않는다. 최초 DB·체인 준비와 일반 `start|restart`를 분리한다. 새 배포에는 기존 개발 키/DB를 복사하지 않으며 기존 배포 복원에는 새 키/anchor를 생성하지 않는다.

준비 중 일부 파일만 생겼으면 `preparation-state.json` 또는 회전별 journal과 생성 파일을 보존한다. 같은 경로 재실행은 충돌로 중단한다. 키 소유자가 공개키/완료 목록을 확인한 뒤 누락된 공개 산출물을 복구하며 이미 생성한 키를 재발급하지 않는다. migration source hash가 과거 적용 기록과 다르거나 비어 있으면 자동 채택하지 않고 owner가 이행 기준을 검토한다.

### 공동 설정 변경과 구 배포 이행

1. 기본 관리 화면에서 현재 directory/policy와 원장 상태를 확인한다. 현재 지원 공식 경로는 `/official` 하나다. 새 정책/목록 제안은 exact 이전·다음 hash/version/epoch와 nonce/deadline에 고정한다.
2. 독립 승인자가 자기 환경에서 `pnpm exec tsx scripts/sign-recovery.ts REQUEST ONE_KEY EXPECTED_DIGEST configuration --sign --output NEW_SIGNATURE_JSON`으로 같은 digest를 검토/서명한다. 개인키는 API·브라우저에 제출하지 않는다. 두 유효 서명을 수집한 뒤 제출한다. 중복 키·세 번째 잘못된 서명·다른 작업/기관/domain 서명은 거절한다.
3. UI의 submitted는 새 정책 활성화가 아니다. worker 확정 receipt·정확한 nonce event·같은 블록 contract state와 최신 Witness를 대조한 뒤 정책 활성화를 요청한다. 실패/결과 불명은 jobs 화면과 worker 오류를 확인하며 요청 내용을 바꿔 재시도하지 않는다.
4. 정책 hash 변경은 epoch를 증가시켜 기존 VC·승인·통화를 회수한다. 새 정책 버전에 맞춘 `SERVICE_POLICY_VERSION`·trust/웹 pin을 명시 게시하고 새 VC·업무를 만든다. 공식 경로 표시명만 변경하면 기존 권한 세대는 유지한다. 자동 hot rollout이나 무중단 통화 복원 보장이 아니다.
5. 구 `InstitutionRegistry`에는 upgrade 구조가 없다. 새 계약 주소·code hash·초기 policyHash·승인자·배포 블록을 검토하고 trust를 명시 전환한다. 구 DB/anchor의 이력을 버리고 같은 배포인 것처럼 시작하지 않는다. authority checkpoint가 없는 기존 DB는 자동 채택하지 않으며 검토한 새 배포 또는 별도 데이터/신뢰 이행이 필요하다. `authorityCheckpointVersion` flag만 바꿔 복구 gate를 우회하는 절차는 없다.

### 계정 준비·회수와 복구 기준

외부 IdP 계정 생성과 내부 계정 등록을 구별한다. 신규 내부 계정은 관리 UI가 등록 issuer/정확한 subject를 연결하고 첫 로그인에서 실제 토큰을 검증한다. 이름/이메일로 권한을 연결하지 않는다. OIDC issuer의 raw `|`는 복합 principal 구분을 위해 금지하며 subject의 `|`는 허용한다. 일반 관리자는 공동 승인자 생성/수정·자기 권한 상승을 할 수 없다. 최근 auth_time·CSRF·요청 ID를 요구하고 SQL 함수도 권한·세대를 재검사한다.

최초 provisioning은 새 빈 DB용이다. 운영 중 계정 변경은 관리 API를 사용하며 `provision-member.ts`는 새 checkpoint 배포의 우회 변경을 거절한다. `manage_account` 실행 권한은 issuer에만 부여하고 public.users 직접 쓰기 권한을 주지 않는다. 비활성/소속·역할 변경은 세션 세대를 올리고 로그인·통화·동의/분석을 회수한다.

새 배포 최초 준비는 별도 anchor의 zero record와 authority metadata version을 확인하고 최초 journal checkpoint를 기록한다. 미등록 체인의 기관 준비 단계와 실제 통화 readiness는 구별한다. 전체 journal은 읽기 전용 snapshot으로 검사하고 마지막 짧은 잠금에서 head/metadata/검사 token을 재검사한다. anchor CAS 이후 DB commit 결과가 불명확하면 gate를 닫는다. 정확한 CAS next readback·완전한 DB 이력 외에는 자동 해제하지 않는다. 계정/키/정책 및 취소 사건도 checkpoint에 포함하므로 소비 이력만 확인해서는 안 된다.

### 내부 DB/RPC에 접근하는 최초 일회 작업

호스트에는 DB/RPC를 노출하지 않는다. 따라서 URL이 `postgres`·`besu1`인 관리 명령을 호스트에서 실행할 수 있다고 가정하지 않는다. 아래는 이미지를 별도 검토/준비하고 새 키·genesis·고정 peer·보호 env·공개 manifest·계정 파일을 준비한 **새 배포에서 실행 허가 후** 사용하는 명령이다. `operations` profile은 일반 기동에 포함하지 않는다. 최초 bootstrap에서는 기관 서비스의 `REGISTRY_ADDRESS`를 비워 둘 수 있지만 Issuer는 이 상태로 기동하지 못한다. 웹 이미지 참조는 사전에 정한 릴리스 tag로 두고, trust/pin 생성·이미지 준비 후 실제 digest로 고정한다. migrator 비밀값은 일회 작업에만 제공하고 일반 기동 환경에는 필요하지 않다. [Compose one-off run](https://docs.docker.com/reference/cli/docker/compose/run/)의 `--no-deps`·`--pull never`로 의존 서비스 자동 기동과 이미지 다운로드를 막는다.

```sh
# 전체 서비스 설정을 이미 준비한 배포용 예시다. 초기 체인은 위 배포 후보 절의 부분 plan을 사용한다. 기존 데이터는 재초기화하지 않는다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure docker compose --env-file /etc/callsign/deployment.env -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml up -d --no-build --pull never postgres besu1 besu2 besu3 besu4
# DB schema: 전용 일회 계정만 사용한다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure docker compose --env-file /etc/callsign/deployment.env -f infra/deploy/compose.yml --profile operations run --rm --no-deps --pull never migration-runner
# 새 기관/사전 등록 계정: public manifest와 FINALS_ACCOUNTS_PATH만 읽는다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure node scripts/restricted.mjs infrastructure docker compose --env-file /etc/callsign/deployment.env -f infra/deploy/compose.yml --profile operations run --rm --no-deps --pull never migration-runner pnpm exec tsx scripts/provision-finals.ts /provision/public-manifest.json /provision/accounts.json
# 원장 identity 관측만: 키를 읽거나 tx를 제출하지 않는다. 결과를 생성한 네트워크와 대조한다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain node scripts/restricted.mjs chain docker compose --env-file /etc/callsign/deployment.env -f infra/deploy/compose.yml --profile operations run --rm --no-deps --pull never registry-deployer pnpm exec tsx scripts/deploy-service-registry.ts inspect /release/network-observation.json
# 검토 후 EXPECTED_GENESIS_HASH를 보호 env에 기록한다.
# 새 계약만: 검토된 artifact·deployer 키 하나, 신규 DEPLOYMENT_WORK_DIR에 응답 유실 journal을 보존한다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain node scripts/restricted.mjs chain docker compose --env-file /etc/callsign/deployment.env -f infra/deploy/compose.yml --profile operations run --rm --no-deps --pull never registry-deployer
```

그 뒤 검증된 `DEPLOYMENT_WORK_DIR/deployment.json`을 기존 파일과 대조해 새 `FINALS_DATA_DIR/deployment.json`으로 배치한다. 기존 파일에는 자동 복사/덮어쓰지 않는다. 공개 trust·웹 pin을 생성하고 같은 소스 revision의 web 이미지를 별도 준비한 뒤 `deployment.sh start`로 나머지 기본 PBX 서비스를 기동한다. app runtime 이미지 빌드는 web pin 생성에 의존하지 않도록 Docker stage를 분리했다. 이미지 build·push·pull은 이번에 하지 않았다. migrator에는 공개 manifest/계정 파일만, deployer에는 자기 배포키/artifact/새 결과 폴더만 mount한다. 일반 Platform/Issuer에 migrator/deployer credential을 주지 않는다.

### 승인 뒤 검증 명령: 자동 서비스 기동 없는 경로

환경이 준비됐고 해당 실행을 별도 허가받은 경우에만 다음 순서를 사용한다. guard 값을 이번 작업에서 바꾸지 않았다.

```sh
# 실제 PG: 기존 회귀 + 새 quota/claim 시험. 이 명령 자체에는 서버/migration hook이 없다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration node scripts/restricted.mjs integration pnpm exec vitest run --config vitest.integration.config.ts tests/integration/finals-store.test.ts tests/integration/finals-session-scopes.test.ts tests/integration/service-runtime.test.ts

# 실제 브라우저/PBX. 사전 준비한 서버·별도 두 로그인 storage·업무/VC env가 필요하다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media node scripts/restricted.mjs media pnpm exec playwright test --config playwright.finals.config.ts tests/media/service-pbx.spec.ts

# 오프라인 한국어 개발 fixture만 비교하며 제공자를 호출하지 않는다.
pnpm exec tsx scripts/evaluate-risk.ts
```

호스트에서 시험 DB에 접근할 수 없으면 `TEST_DATABASE_URL`을 별도 빈 시험 DB로 설정하고 다음 guarded one-off 경로를 사용한다. 일반 서비스의 DB URL·키는 이 컨테이너에 주지 않으며 서버나 migration을 자동 기동하지 않는다. 시험 DB schema와 전용 auth LOGIN은 별도로 준비해야 한다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration node scripts/restricted.mjs integration docker compose --env-file /etc/callsign/deployment.env -f infra/deploy/compose.yml --profile validation run --rm --no-deps --pull never test-runner
```

PG 시험은 별도의 빈 시험 DB를 사용한다. 원장/관리키 회전은 준비된 체인·계약·Witness에서 신규 VC·소비·철회·새 세대·구 승인 거절·worker 응답 유실/재시작 순으로 확인한다. 브라우저 시험은 수락 전 전송량 0·양측 실제 음성·음소거·거절/부재/종료·로그아웃·만료·재접속 거절·TURN relay를 따로 확인한다. 유료 제공자는 별도 허가·소량 예산으로 동의/철회·수정/역순·늦은 결과·비용·보관을 확인한다. 이후에만 장애/부하·GCP 재시작/복구를 검증한다. 제공자 계약 smoke는 아래 도구를 사용한다. 체인 장애·전체 복구 자동 시험은 보완이 필요하며 명령을 꾸며내지 않는다.

### 통화 유지·회수와 운영 실패

- `CALL_LEASE_SECONDS=30`, `CALL_MAX_SECONDS=14400`은 정책 초기값이다. schema 범위 내에서 선택하고 trust의 policy와 서버 값을 같은 릴리스로 맞춘다. readiness가 불일치를 거절한다. 120초 최초 연결, 관측 8초+각 시계 오차 1초 조건과 구분한다. 임의 TTL 증가는 해결책이 아니다.
- 서버는 최초 bridge 전에 현재 권한을 확인하고 양측 검증 준비 서명을 검사한다. 진행 중 freshness가 지나면 음성/분석을 정지한다. 기존 binding과 양측 갱신 서명·아직 유효한 lease에 한정한 명시적 미확인 계속은 별도 상태로 표시한다. 명시 철회·세대 교체·기관/계정 정지는 회수한다.
- 원장 worker는 동일 raw transaction을 저장하고 receipt를 재조회한다. 최대 12회·지수 backoff 후 실패를 남긴다. 결과 불명 tx가 있으면 같은 signer의 새 nonce 발급도 멈춘다. `/v3/management/jobs`에서 상태·hash·사용량을 보고, 최근 재인증과 권한으로 `/retry-job`을 요청하면 같은 작업을 재조회한다. 영구 revert/잘못된 요청을 정상 성공으로 바꾸지 않는다. 수동 원장 도구와 worker가 같은 관리 계정을 동시에 쓰지 않는다.
- Issuer 재시작은 기존 통화를 종료하고 채널/endpoint 정리를 재시도한다. 원장 worker는 재시작 후 저장한 tx와 cursor를 이어가지만 통화를 자동 부활시키지 않는다. 전환/재협상/새 PeerConnection에는 새 시도·수신 nonce·검증이 필요하다.
- 원격 오디오만 전송한다. 전사/원음은 기본 비영구이며 동의 철회/종료 시 메모리·늦은 결과를 폐기한다. STT 초·LLM 요청·입력 바이트를 예약/계측한다. 제공자 응답이 불명확한 채 프로세스가 죽으면 예약을 보수적으로 전액 반영하며 자동 환급하지 않는다. 실제 청구 통화·가격 정산은 별도 미구현이다.

### 일관 백업·새 대상 복원

`scripts/backup.sh`는 이제 typed bundle 도구를 호출한다. 별도 허가 후 통화를 종료하고 worker·체인을 정상 정지한 maintenance에서만 사용한다. `BACKUP_CONFIRMATION=MAINTENANCE-WITH-QUIESCED-CHAIN`, 새 `BACKUP_DIR`, `FINALS_DATA_DIR`, `MIGRATOR_DATABASE_URL`, 실제 정지된 체인의 `CHAIN_SNAPSHOT_ARCHIVE`, `DEPLOYMENT_ID`, 독립 anchor URL/token, 외부 `BACKUP_ENCRYPTION_KEY_PATH`, 보호된 실행 환경 파일 `BACKUP_DEPLOYMENT_ENV_PATH`가 필요하다. 키 파일은 보호한 32 byte이며 배포/백업 폴더 밖에 둔다. DB snapshot·공유 잠금 중 dump와 키/설정을 암호화하고, 체인 snapshot과 실행 환경 파일도 별도로 암호화한다. 승인키 버전과 구성 manifest를 대조한다. anchor 자체는 포함하지 않는다. 이 도구가 실행 중 체인 파일 복사의 정합성을 보장하는 것은 아니다.

`scripts/restore.sh`는 `RESTORE_CONFIRMATION=NEW-EMPTY-DATABASE-AND-DIRECTORY`, `RESTORE_DATABASE_URL`, `RESTORE_DATA_DIR`, `RESTORE_BUNDLE`, 외부 암호화 키를 요구한다. 기존 DB·경로에는 덮지 않고 checksum·GCM 인증 후 복원하며 gate를 닫는다. `deployment.env.restored`는 새 호스트의 주소·계정·경로를 검토한 뒤 수동 배치하며 자동으로 읽어 기동하지 않는다. 체인 archive는 별도 검토 후 새 volume에 복원한다. 복원한 서비스는 최신 독립 anchor와 소비 journal/SQL namespace·권한 세대를 대조해야만 발급을 재개한다. 일치하지 않으면 `CONSUMPTION_HISTORY_RECOVERY_REQUIRED`로 중단한다. **SQL gate를 ready로 직접 고치는 절차는 제공하지 않는다.**

외부 anchor만 전진하고 DB commit 여부가 불명확하면 해당 VM 백업만으로 자동 해제하지 않는다. 최신 일관 DB/소비 증거와 독립 기준을 복구하거나 승인자들과 재신뢰 절차를 결정해야 한다. 데이터 권한 세대의 rollback은 소프트웨어 이미지 rollback과 다르며, 과거 키/VC/승인을 되살리면 안 된다. 이 전체 절차는 작성·정적/암호화 단위 검사만 했고 실제 백업/복원을 실행하지 않았다.

### 기관키·콜센터키 교체

기본 경로는 `/v3/management/recover`로 2-of-3 EIP-712 복구를 worker에 제출하고 원장 새 승인키·epoch를 확인한 뒤 `/v3/management/activate-key`를 사용한다. 기존 `/v2` 명령은 호환 배포용이다. 새 기관키는 `approval-vN.json`으로 별도 준비한다. 콜센터키를 함께 바꾸면 `serviceKeys=[{uri,kid,publicKey,version}]`와 `serviceKeyApproval={request,signatures}`를 보낸다. 요청은 `institutionId/expectedEpoch/newEpoch/issuerKeyDigest/keysHash/nonce/deadline`에 결합하며, URI 오름차순 키 목록의 JCS SHA-256을 `0x` prefix와 함께 keysHash로 사용한다. `issuerKeyDigest`도 새 공개 JWK의 JCS SHA-256이다. 승인자는 `sign-recovery.ts ... service-keys`로 그 전체 요청에 서명한다. 기관 복구 서명을 키 목록 변경 승인으로 재사용하지 않는다.

새 콜센터 키는 version에 맞는 `sender/key-vN` 공개 manifest 항목과 `SENDER_KEY_FILENAME`을 준비한다. trust 재생성·웹 pin/이미지 rollout 전에는 이전 앱이 새 기관키를 검증할 수 없으므로 새 연락을 열지 않는다. 구 증거/키/백업을 자동 삭제하지 않는다.

### 고정 노드·운영 관측·릴리스

`generate-besu.sh`는 허가 후 공개 노드키 4개에서 `prepare-besu-peers.ts`를 호출해 static peer와 local node allowlist를 작성한다. 기존 내용과 다르면 덮지 않고 검토를 요구한다. [Besu 공식 local permissioning](https://github.com/besu-eth/besu-docs/blob/main/docs/private-networks/how-to/use-local-permissioning.md)에 따라 기본 Compose는 discovery를 끄고 네 노드 목록을 mount한다. 계정 allowlist는 현재 활성화하지 않으며 계약 호출자/공동 서명 검사와 내부 RPC 접근 통제가 적용된다. validator·승인자 집합은 고정이며 임의의 런타임 변경 도구를 공개하지 않는다. node allowlist와 합의 검증자 집합은 서로 다른 것이다.

관리 화면의 `/v3/management/health`는 노드별 chain/genesis·블록 시각·동기화·peer와 복구 gate·실패 작업을 보여준다. 조회 장애/진행 정지는 운영 상태이며 Witness 권한 증명이나 침해 판정이 아니다. 외부 알림 전송과 자원/지연 실측은 별도 준비가 필요하다.

새 계정은 허가 후 `pnpm exec tsx scripts/provision-member.ts ACCOUNTS_JSON`으로 기존 기관에 추가할 수 있다. `MIGRATOR_DATABASE_URL`, `INSTITUTION_ID`, 등록된 `OIDC_ISSUER`, 상담원이라면 기존 `SERVICE_URI`를 명시한다. 입력은 `provisioningAccountsSchema`이며 기존 계정/role을 덮지 않는다. 일반 서비스에는 migrator 계정을 부여하지 않는다. 기존 계정 비활성/permission/소속 변경은 최근 로그인·CSRF를 검사하는 관리 API를 쓴다.

`pnpm release:manifest NEW_OUTPUT_PATH`는 오프라인 파일 작성 도구다. 검토/커밋한 clean source, `CALLSIGN_APP_IMAGE`/`CALLSIGN_WEB_IMAGE`/`ASTERISK_IMAGE`/`TURN_IMAGE`의 검토된 digest, `DEPLOYMENT_PATH`, `TRUST_BUNDLE_PATH`, 동일 clean commit의 `RELEASE_EVIDENCE_PATH`를 요구한다. 이미지 registry를 조회하거나 성공 시험을 만들어내지 않는다. 이번 worktree는 미커밋이므로 이 도구를 실행해 릴리스를 만들지 않았다.

### 요청 한도와 제공자 검증 소스

1초 통화 관측은 문맥·증거·상태 및 유지 갱신을 요청한다. 기존 IP당 120회/분 제한을 그대로 쓰면 정상 연결도 막으므로 로그인 쿠키별 임시 제한과 인증 후 영속 사용자별 `API_REQUESTS_PER_MINUTE`(초기 600)을 구분했다. 익명 요청은 IP별 120회/분, nginx는 IP별 60회/초와 burst 120의 초기 보호값을 사용한다. 인증 전 쿠키별 제한은 인증을 대신하지 않으며 실제 사용자 quota는 기관/사용자/분으로 SQL에서 집계한다. 이 값들은 부하 시험·수용량·SLA가 아니다. 실제 NAT/사용자 규모에 맞게 검증하고 조정한다.

아래는 **제공자 호출까지 별도 승인된 후만** 실행한다. 키 존재만으로 자동 실행하지 않으며 이번에는 타입 검사만 했다. `stt`는 동의받고 길이를 검토한 짧은 WebM 샘플(1 MiB 이하)을 요구하고 연결 시간 30초, `llm`은 비식별 전사문 4000 byte 이하·1회 요청이다. 연결 초/바이트는 제공자의 실제 음성 길이 과금이나 월 지출 한도를 보장하지 않으므로 콘솔 한도와 가격·보관 조건도 확인한다. 출력은 새 파일에 입력 hash·횟수·결과 건수만 기록하며 원음/전사문은 복사하지 않는다.

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media CALLSIGN_PROVIDER_CONFIRMATION=CONSENTED-SAMPLE-WITH-BUDGET pnpm test:providers stt CONSENTED_SHORT_WEBM NEW_RESULT_JSON
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media CALLSIGN_PROVIDER_CONFIRMATION=CONSENTED-SAMPLE-WITH-BUDGET pnpm test:providers llm DEIDENTIFIED_TRANSCRIPT_FILE NEW_RESULT_JSON
```

실제 한국어 정확도는 별도 holdout과 사람 정답으로 평가해야 한다. 위 smoke 통과를 품질·지연·비용·통화 E2E 통과로 확대하지 않는다.

API/worker SQL 연결은 statement timeout 5초·lock timeout 2초의 초기 제한을 사용한다. DB 경합·처리 시간은 실환경 검증 후 조정하며 전체 transaction 원자성/성능을 이 값만으로 보장하지 않는다. 인증 DB pool은 4개로 제한했고 구성·역할별 총 연결 수는 실제 환경에서 관측한다.

## 서비스 기동 없는 실행 전 검사와 증거

지금 실행 가능한 명령이다. 서버·네트워크·키 로딩·migration·브라우저 hook이 없다. preflight는 설정이 없으면 exit2(BLOCKED), 잘못된 조합이면 exit1(FAIL), 로컬 검사에 문제가 없으면 exit0이다. PASS여도 DNS/로그인/GRANT/이미지 모듈/미디어/독립 anchor의 실제 동작은 입증하지 않는다.

```sh
pnpm light
pnpm --filter @callsign/web build
pnpm exec tsc -p services/api/tsconfig.runtime.json --noEmit
pnpm preflight
pnpm exec tsx scripts/evaluate-risk.ts
pnpm evidence:collect artifacts/NEW-OFFLINE-EVIDENCE.json --dry-run
pnpm evidence:collect artifacts/NEW-OFFLINE-EVIDENCE.json light web runtime preflight rules
```

증거 파일 이름은 새 경로를 사용한다. collector는 기존 파일을 덮지 않으며 allowlist 밖 명령을 실행하지 않는다. dry-run은 어떤 검사도 실행하지 않고 파일 hash/Git 상태만 수집한다. 출력은 크기를 제한·비밀값을 제거하며 공유 전 추가 검토한다. 미커밋 worktree hash 증거와 clean Git 릴리스 증거를 구분한다. 실제 브라우저 trace/화면·통화 관측·metric은 실행 후 별도 참조를 붙인다. 지금은 수집하지 않았다.

### 실행 허가 후 추가로 확인할 시험

이미 준비한 별도 빈 시험 DB와 승인받은 환경에서만 아래를 실행한다. 이 명령에는 자동 기동/migration hook이 없다. guard 값을 지금 변경하지 않았다.

```sh
# SQL 함수/독립 연결 경합/claim/세션 세대/nonce lease/초기 checkpoint
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration node scripts/restricted.mjs integration pnpm exec vitest run --config vitest.integration.config.ts tests/integration/service-runtime.test.ts
# 별도 단일사용 HTTPS anchor fixture + TEST_DATABASE_URL. 초기화/reset 없이 실제 CAS 대조
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration node scripts/restricted.mjs integration pnpm exec vitest run --config vitest.integration.config.ts tests/integration/independent-anchor.test.ts
# 짧은 실제 계약 시험. 노드/fork 없이 수행하더라도 별도 실행 승인 필요
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain node scripts/restricted.mjs chain forge test --match-contract ServiceRegistryTest -vv
# 두 로그인 환경·실제 PBX: 수락 전 양방향 송신0, 양방향 실제 RTP, 철회/로그아웃 cleanup
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media node scripts/restricted.mjs media pnpm exec playwright test --config playwright.finals.config.ts tests/media/service-pbx.spec.ts
```

독립 anchor 시험에는 `ANCHOR_INTEGRATION_URL/TOKEN/DEPLOYMENT/INSTITUTION`이 필요하다. 배포는 일반 서비스와 달라야 하고 institution은 `anchor-test:`로 시작하는 사전 등록 zero record여야 한다. 메모리 anchor를 쓰는 SQL 시험과 독립성을 주장하는 실제 anchor 시험을 혼합하지 않는다. 계약 시험→새 배포와 witness 대조→정책/키 회수→PBX 양방향 미디어→소량 제공자→재시작/일관 복원→장애·성능→GCP 순서로 진행하고 각 단계 PASS/FAIL/SKIPPED/BLOCKED를 기록한다.

### PBX·백업의 추가 수용 조건

Asterisk `TIMEOUT(absolute)` 설정/조회가 실제 이미지에서 지원되고 API/DB 장애 뒤에도 이전 허가 기한 이내 채널이 종료되는지 확인한다. ARI 요청 최대3초를 기한에서 빼므로 실제 발신/갱신 transport window는120초 또는 lease보다 짧을 수 있다. 제어 요청 성공만으로 음성 전달 성공으로 세지 않는다. [TIMEOUT 함수](https://docs.asterisk.org/Latest_API/API_Documentation/Dialplan_Functions/TIMEOUT/), [ARI variable/function API](https://docs.asterisk.org/Asterisk_20_Documentation/API_Documentation/Asterisk_REST_Interface/Channels_REST_API/), [PJSIP 인증 기능](https://docs.asterisk.org/Configuration/Channel-Drivers/SIP/Configuring_res_pjsip/PJSIP-Authentication/)을 적용하되 선택한 이미지 모듈/버전은 별도 검증한다.

백업 manifest는 암호화 키에서 HKDF로 분리한 MAC 키로 인증하고 파일 hash·크기·대상 배포를 검사한다. tar의 링크/특수 파일/경로 이탈을 거절한다. 인증 없는 구 manifest는 자동 신뢰하지 않는다. 복원은 새 빈 대상만 허용하고 로그인 세션을 모두 폐기하며 gate는 닫힌다. DB·체인·키/trust의 일관 snapshot과 독립 anchor 대조 전 공개하지 않는다. application 범위의 영속 Anchor·별도 cluster 복원은2026-10-30 기록에서 확인했다. 전체 chain/운영 키 복원은 아직 실행하지 않았다.

## 단계별 검증과 판정

[고정 단계 정의](../scripts/validation-stages.ts)와 [runner](../scripts/validation-runner.ts)는 서비스를 기동하거나 migration·이미지 build·장애·클라우드 작업을 자동 수행하지 않는다. 기본은 dry-run이며 정확한 단계·환경 JSON·새 증거 파일을 요구한다. 환경 파일은 `infra/validation/offline.json` 또는 검토한 `test-environment.example.json` 복사본이다. 실제 시험은 `environmentId`/`deploymentId`가 `test:`로 시작하고 `DEPLOYMENT_ID`와 같아야 한다. 예제의 REPLACE 값은 실행할 수 없다.

```sh
# 지금 허용: source 검사. 누락된 사용자 설정은 BLOCKED로 남음
pnpm validate --stage offline --environment infra/validation/offline.json --output artifacts/NEW-OFFLINE.json --execute
# 서비스 검증의 선행 증거는 이후 단계와 같은 test identity/보호 설정으로 생성
pnpm validate --stage offline --environment REVIEWED_TEST_ENVIRONMENT_JSON --env-file REVIEWED_TEST_ENV --output artifacts/NEW-OFFLINE-PASS.json --execute
# 지금 허용: 자식 명령을 실행하지 않는 계획
pnpm validate --stage database --environment infra/validation/test-environment.example.json --output artifacts/NEW-DB-PLAN.json --dry-run
# 전체 서비스 입력과 이후 생성값을 구별
pnpm preflight --env-file PROTECTED_ENV --phase bootstrap
pnpm preflight --env-file PROTECTED_ENV --phase runtime
```

preflight 준비 분류는 A=코드/템플릿, B=기존 로컬 자료, C=사용자/외부 설정, D=이후 준비 작업의 생성값, E=실제 연결/기동, F=선택 기능이다. bootstrap 검사는 나중에 생성하는 D 항목과 provider 준비를 SKIPPED로 남긴다. 전체 서비스 필수 보장을 없애는 옵션이 아니다. runner의 `runtime` step은 TypeScript 검사 이름이다. preflight의 `--phase runtime`은 별도의 전체 설정 검사이며 생성값과 provider를 다시 요구한다. E(네트워크/기동)는 여전히 미확인이다. [현재 항목별 결과](../artifacts/execution-preparation-rechecked-20261029.json)의 `checks`에 검사 ID·원인·영향 단계·입력 형식·준비 주체·선행 조건·다음 절차가 있고 `steps`에는 생성 순서가 있다.

| 단계 | 필요한 입력·선행 증거 | 자동 검사와 수동 확인 | 중단 조건·성공 기준 |
|---|---|---|---|
| offline | 기존 도구, 명시한 공개/보호 설정 | light·웹 build·runtime 타입·bootstrap preflight·규칙 회귀 | 코드 FAIL은 후속 명령 중단. 설정 BLOCKED는 다른 독립 오프라인 검사를 계속하되 단계는 BLOCKED |
| database | 소스 검사 통과(전체 설정 PASS와 별개), 별도 `callsign_test_*` DB, owner TEST_DATABASE_URL·별도 TEST_AUTH_DATABASE_URL, migration/GRANT 적용 완료 | 실제 독립 SQL 연결·잠금·소비·commit 후 응답 유실·quota·claim·migration hash·권한 | 모든 실제 assertion 실행/통과. pending/skip은 PASS가 아님. 자동 DB 생성/적용 없음 |
| chain | database, 실제 deployment/trust 파일 | 제한된 Foundry 계약 시험; Besu/Witness/정책·키 회수는 MANUAL | 다른 signer2·nonce/domain/legacy 거절; 같은 snapshot3 Witness, 구 VC/lease 회수의 실관측 필요 |
| media | database+chain, 같은 test 배포의 양측 로그인 storage·할당 업무·확정 위임·trust pin | 실제 PBX 시험은 배포 identity 선검사, 수락 전 sent0/수신 track 차단, 양측 RTP·decoded audio 에너지·logout 회수. TURN·철회/lease 경계는 MANUAL | HTTP200/연결 문구만으로 판정 금지. zero assertions/skip/identity 불일치 차단 |
| provider | media, 동의받은 작은 WebM/전사, 모델·키 참조, `CONSENTED-SAMPLE-WITH-BUDGET` 확인 | 기존 고정 provider smoke 각1요청; 동의 철회/늦은 응답/보관 조건은 MANUAL | 실제 final 전사·근거 일치 출력. 재시도 전 불명 요청/지출을 확인. 한국어 품질 평가는 별도 |
| recovery | database+chain, 별도 HTTPS anchor 단일사용 zero fixture | 실제 CAS 시험; 재시작/raw tx/실제 새 대상 복원은 MANUAL | 오래된 DB가 gate를 못 열고 옛 세션이 부활하지 않는 실관측. 원 배포는 정지/수정하지 않음 |
| performance | media+recovery, 실제 관측 JSON | 실제 측정 수집은 MANUAL, 오프라인 분위수 판정은 자동 | 각 구간100표본 이상·실패 수 포함·같은 monotonic 관측자. 부족하면 BLOCKED |
| cloud | recovery와 실제 동일 릴리스 manifest, `cloud-test` identity | GCP 이전·재시작·복원은 MANUAL; API/Terraform 자동 호출 없음 | 동일 image/contract/trust, 재초기화 없이 재시작·gate·미디어를 실제 확인 |

이후 **시험 환경의 준비와 별도 실행 승인을 모두 받은 뒤** 첫 서비스 검증 명령은 다음이다. `REVIEWED_TEST_ENV`는 운영 DB와 다른 TEST_DATABASE_URL·TEST_AUTH_DATABASE_URL을 담고, 허용 플래그는 파일 안에 넣지 않는다. 먼저 offline의 light/web/runtime/rules 소스 검사를 통과해야 한다. 전체 서비스 preflight 차단은 DB 검증의 선행 PASS로 요구하지 않는다. DB 전용 입력은 database 단계에서 별도로 검사한다.

```sh
# 아래는 미래 integration 실행 승인 뒤만 사용
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm validate --stage database --environment REVIEWED_TEST_ENVIRONMENT_JSON --env-file REVIEWED_TEST_ENV --prerequisite artifacts/NEW-OFFLINE-PASS.json --output artifacts/NEW-DATABASE.json --execute
```

나머지도 같은 명령의 `--stage`를 위 순서대로 바꾸고 단계별 선행 결과를 `--prerequisite FILE`로 각각 전달한다. guard 범주는 database/recovery=`integration`, chain=`chain`, media/provider=`media`, performance=`performance`, cloud=`infrastructure`다. runner가 이 값을 만들거나 바꾸지 않는다. 단계별 정확한 argv·입력·제한 시간(최대120초)은 정의 파일에 고정되어 있고 임의 shell 문자열을 실행하지 않는다. timeout은 이번 runner가 생성한 자식 process group만 회수하며 시험이 생성하지 않은 서비스를 정리하지 않는다.

### 증거·resume·수동 판정

증거에는 run ID/UTC·HEAD/dirty·source hash·설정 hash·공개 contract/trust/환경 identity·요구 ID·기대 조건·실제 assertion·종료 코드·실패 원인과 출력 파일 hash를 묶는다. secret 값은 출력하지 않는다. 고정 sidecar/이번 실행 출력 폴더만 수집하며 파일당2MiB·20개 이하, 로그64KiB로 제한하고 민감값·JWT·DB URL·이메일·전화번호를 가린다. 공유 전 별도 검토하고 원본 민감 trace는 공개 artifacts에 넣지 않는다. 브라우저 쿠키 storage·원음·기본 trace/video는 수집하지 않는다. 보관 기한은 배포 운영자가 정하며 runner는 기존 증거를 자동 삭제하지 않는다.

`.progress.json`은 미완료 실행의 위치이며 PASS가 아니다. 완료되면 최종 evidence 경로와 hash만 가리킨다. `--resume`에는 미완료 progress 또는 최종 evidence를 사용하고 완료 pointer 자체는 주지 않는다. 일치해도 실제 검사는 재실행한다. 코드·설정·계약·trust·환경이 달라지거나 선행 증거가1시간을 넘으면 해당 단계/의존 단계는 다시 검사한다. 측정/릴리스 산출물은 해당 단계 입력으로 따로 hash하여, 나중에 생길 파일이 앞선 DB/미디어 검사의 순환 의존이 되지 않게 한다. provider resume은 비용/불명 결과를 검토하고 새 예산으로 시작해야 하므로 차단한다.

자동화하지 않은 단계는 **MANUAL**이고 임의 PASS placeholder가 없다. 수동 관측은 아래 모양의 공개 JSON을 별도 새 파일에 남긴다. 실제 실행 전에 이 예제를 실제 관측값으로 채우지 않는다.

```json
{"stage":"chain","step":"besu-witness","identityHash":"ACTUAL_RUN_IDENTITY_HASH","checkedAt":"ACTUAL_UTC_TIME","verdict":"PASS","checks":{"STATE-001":true,"STATE-002":true,"CALL-006":true},"sources":[{"path":"artifacts/ACTUAL_OBSERVATION.json","sha256":"ACTUAL_FILE_SHA256"}]}
```

review 파일은 `{"reviewer":"operator:ROLE","observations":[{"id":"besu-witness","artifact":"artifacts/OBSERVATION.json","sha256":"ACTUAL_SHA256"}]}` 형태다. 정확한 step의 모든 요구 ID에 실제 boolean assertion, 명시적 `verdict: PASS|FAIL`, 최근 시간·같은 identity·실제 출처 파일 hash가 필요하다. PASS는 모두 true, FAIL은 적어도 하나 false여야 한다. `--review-evidence OLD --manual-review REVIEW_FILE --output NEW`는 명령/제공자를 재실행하지 않는 메타데이터 검토 전용이며 `--execute`와 함께 쓸 수 없다. 호환용 status는 MANUAL로 남지만 새 assessment.verdict는 검토된 PASS 또는 FAIL을 표현한다. 검토된 PASS와 무결한 관측만 다음 단계에 사용할 수 있고 실행 허가를 대신하지 않는다. 과거 MANUAL은 판정 불명으로 취급한다. 증거 작성자와 시험 설계자가 같을 수 있으므로 외부 환경 관측과 사람의 독립 검토를 함께 남긴다.

### 성능 관측 계약

[평가 도구](../scripts/evaluate-performance.ts)는 실제 표본 입력만 판정한다. scope는 `verification=network-and-witness-inclusive`, `revocation=confirmation-observed-to-client-ack`, `authorization=issuer-request-to-signature`, `ice=checking-to-connected`, `media=prepare-to-two-way-rtp`, `analysis=remote-segment-to-warning`이다. 표본은 `durationMs`·`outcome: success|failure`와 provenance=`actual-observation`, clock=`observer-monotonic`을 명시한다. 성공 표본에 nearest-rank `ceil(p*n)-1`로 p95를 계산하되 실패가 있거나 최소100표본이 안 되면 목표 달성으로 세지 않는다.

철회는 체인 확정을 관측한 때부터 측정하므로 확정→관측 지연의 상한 `boundaryUncertaintyMs`와 근거 파일 hash도 요구하고 그 상한을 duration에 더한다. 상한을 입증할 수 없으면 BLOCKED다. 서버/브라우저의 시각을 단순 차감하지 않는다. 검증500ms·철회5초는 목표이며 상태 최대10초는 별도 stale/clock-skew 시험이다. 단위 시험의 합성100표본을 실측에 쓰지 않는다.

### 정책·키·trust 전환의 중단과 재개

1. 현재/제안 내용과 기관·chain·계약·action·nonce·deadline·digest를 관리 화면에서 대조하고 제안 파일을 내보낸다. 각 승인자는 같은 내용을 별도 도구로 검토한다. 서명 파일을 가져오면 등록 signer·중복·만료·정족수를 확인한다. 내용 수정 시 이전 서명을 버리고 새 제안을 생성한다. 웹은 개인키를 받지 않는다.
2. 운영자는 신규 업무/승인 발급을 중단할 변경 창을 공지한다. 공동 서명 제출만으로 새 정책이 활성화되지 않는다. 확정 event/state/Witness 후 정책 hash 변경이면 새 epoch로 구 VC/승인/lease를 회수한다. 단순 공식 경로 표시명 변경은 세대와 진행 통화를 유지한다.
3. 새 기관/콜센터 키는 `prepare-finals.ts approval-key|service-key DIRECTORY NEW_PUBLIC_MANIFEST --apply`로 비활성 상태에서 준비한다. 역할별 버전>1과 새 manifest 경로를 요구하며 구 파일을 보존한다. 공동 회전·확정 이전에는 mount/pin을 활성화하지 않는다.
4. 확정한 policy/keyversion에 맞춰 새 trust 생성→웹 build/pin→Issuer/worker 공개 trust·실제 runtimePolicy 일치 확인→readiness→새 위임/업무 순으로 게시한다. `assertPublishedTrust`는 불일치 동안 신규 업무·위임·시도·challenge·승인·소비를 막는다. 관리/복구·이미 소비된 같은 영수증 재조회는 가능한 범위로 유지한다.
5. 구 탭은 새 API 키를 자동 신뢰하지 않는다. 상태 불일치/회수 시 음성/분석을 중단하고 새 버전에서 재로그인/새 시도를 안내한다. 웹 캐시·여러 replica는 새 pin/동일 이미지 기준으로 확인한다. 일부 게시만 성공하면 발급 차단을 유지한 채 남은 replica/웹을 게시하며 nonce를 바꿔 같은 관리 명령을 다시 제출하지 않는다.
6. 소프트웨어 rollback은 현재 chain/epoch/trust와 호환하는 이미지로만 한다. 구 정책/키/DB 백업을 되돌려 구 권한을 살리지 않는다. 최신 독립 anchor와 일치하는 이력·공동 재신뢰 근거가 없으면 gate를 닫고 공개하지 않는다.

## 실행 전 정합성 보완 — 2026-10-29 후속

### 사용자 결정은 다섯 묶음으로 준비

아래는 기존 `.env.example` 입력을 묶은 목록이다. 별도의 설정 저장소가 아니다. 비밀값 원문을 채팅으로 요청하지 않는다. 43개 C 검사와19개 D 검사를 이 목록의 입력 수로 해석하지 않는다.

| 항목 ID·목적 | 실제 소비 코드 | 형식·비밀 여부 | 준비 주체·선행 조건 | 최초 필요 단계·미입력 영향 |
|---|---|---|---|---|
| INPUT-01 배포 identity와 접속 경계 | finals-config, prepare-service-network, deploy-service-registry, Vite config, Compose/nginx | DEPLOYMENT_ID·INSTITUTION_ID·양의 NETWORK_ID·기관/콜센터 HTTPS URI·CALLSIGN_DOMAIN/WEB_ORIGIN·SIP_WSS_URL·PBX 공인IPv4·TURN_URLS. 공개 설정 | 운영자/기관: 새 배포인지 기존 배포 이전인지 먼저 결정. DNS/TLS/주소는 외부 등록·할당 후 확보 | 해당 환경 준비/chain/media. DB 시험 자체에는 불필요. 실제 주소·기관 ID를 생성하지 않음 |
| INPUT-02 계정과 공동 승인 주체 | assertInitialAccounts, OIDC flow, account-management, governance-v2 | 일반/공식 client/audience 분리·issuer/JWKS/authorize/token HTTPS, 정확한 issuer\|subject 계정 JSON, 서로 다른 EVM 승인자 주소3개. 계정 파일은 개인정보로0600; 공개키 주소는 공개 | 기관·IdP 관리자/독립 승인자: 실제 IdP 계정과 등록 정책을 확인. 이름·이메일 자동 연결 금지 | 최초 계정 준비/auth/기관 등록. 미준비면 해당 로그인·등록 차단, 순수 DB 경계 시험은 가능 |
| INPUT-03 DB·키·독립 복구의 소유 경계 | migrate-finals, provision-logins.sql, signing-key, postgresAuthorityStore, consumption-anchor | 역할별 DB URL·서로 다른 LOGIN, 보호 키/비밀번호/token 파일 참조, FINALS_ACCOUNTS_PATH, 독립 HTTPS anchor. 비밀/개인정보 보호 | DB owner·역할별 키 소유자·별도 anchor 관리자: 기존 대상의 보존과 새 시험 DB 분리. anchor를 서비스 백업과 함께 복원하지 않음 | 첫 database는 TEST_DATABASE_URL와 TEST_AUTH_DATABASE_URL만 필수. 실제 계정/키/anchor는 이후 해당 단계에서 요구 |
| INPUT-04 실행물·미디어 구성 | app/web Dockerfile, release-manifest, prepare-pbx, asterisk, pbx-routes | 실제 검토 이미지7개 digest·Asterisk22 모듈/ODBC driver·PBX TLS/DTLS/CA 파일·ARI/PBX DB 보호 참조. digest/공개 cert는 공개, key/비밀번호는 비밀 | 운영자/이미지·인증서 관리자: 기존 설치 자료는 파일/메타데이터로 확인 가능하지만 runtime 지원은 미검증. 실제 build/인증서 준비 승인 뒤 산출 | 실제 DB 준비에는 PostgreSQL/기존 도구, PBX 이후에는 해당 모듈·인증서 필요. 전체 스택을 먼저 만들 필요 없음 |
| INPUT-05 분석 제공자와 보관/시험 예산 | transcription, service-audio, risk, provider-smoke | Deepgram/Anthropic 모델 이름·보호 API key 참조·동의된 소량 입력·보관/예산 정책. 키/입력은 비밀/민감 | 기관 개인정보 책임자/제공자 계정 관리자: 계정 등록·지원 모델/보관 조건 확인 | provider/실제 분석. 없으면 분석 불가를 표시. DB·chain 검증에는 요구하지 않음 |

기존 서버에서 읽기 전용으로 확인 가능한 것은 현재 Git/lockfile/SQL/계약 artifact·hash·Compose의 고정 내부 주소, 보호 env/키 경로의 존재·권한·추적/ignore 여부다. 프로세스 환경·비밀 파일 내용을 출력하거나 DNS/RPC/API에 조회하지 않는다. 제공자/IdP/인증서의 실제 유효성과 배포 중인 이미지 내용은 로컬 파일 존재로 추정하지 않는다.

기본 내부 ARI `https://asterisk:8089`와 PBX IPv4 `10.205.0.20`은 실제 Compose 근거가 있다. 변경하면 Compose network/endpoint 설정도 함께 검토한다. 실제 외부 DNS·OIDC subject·승인자·계약 주소·이미지 digest는 기본값으로 만들지 않는다.

### 나중에 생성되는 값과 GCP 경계

| 생성/확보 항목 | 주체·선행 조건·소비처 |
|---|---|
| 새 역할키·공개 manifest | 승인된 keys 준비, 각 소유자 보관 → Issuer/Sender/PBX/Witness. 일반 재시작에 생성하지 않음 |
| 실제 genesis·계약 metadata/code hash | 승인된 네트워크/배포 → Witness/worker/verifier/trust. 구 배포를 임의 새 identity로 바꾸지 않음 |
| 공개 PBX cert·trust/pin | 인증서 발급/실제 deployment → trust 생성 → 웹 hash 고정/build. 비밀키는 공개 trust에 넣지 않음 |
| 앱/웹/인프라 이미지 digest·릴리스 증거 | 실제 검토/build 및 단계별 검증 후 생성. 임의 digest로 차단을 줄이지 않음 |
| GCP 전용 VM/network/firewall/DNS 서비스 계정 참조 | 이전 결정 후 운영자가 준비. 서버의 첫 DB 시험에는 필요 없음 |

같은 배포를 GCP로 이전하면 기관/콜센터 논리 URI·기관 ID·chain/genesis·registry·epoch·키 세대·소비/감사 이력을 유지해야 한다. IP/파일 경로·TLS·OIDC callback·TURN 등의 변경은 별도 설정으로 검토한다. URI·등록 키·계약·정책·PBX fingerprint가 바뀌면 새 trust/pin/서명 범위와 필요한 공동 변경을 적용한다. 구 epoch나 소비 이력을 되돌리지 않는다.

진행 통화·브라우저 임시 개인키·로그인 세션·SIP 임시 자격은 이전하지 않는다. 회수 후 새 로그인/새 시도를 요구한다. 독립 anchor는 이전 bundle 밖에서 최신성을 유지하며 복원 DB와 다르면 gate를 닫는다. 새 환경에서 OIDC/최소권한·Witness/freshness·TLS/DTLS/TURN·양방향 음성·철회·anchor·재시작을 다시 검증한다. GCP 리소스 생성이나 실제 복원은 이번에 수행하지 않는다.

### 판정 축과 첫 DB 검증

새 evidence의 `assessment`는 단계/결과별로 다음 축을 독립 기록한다. 기존 `status`는 과거 도구 호환용이다.

- method: automatic/manual (혼합 단계는 manual로 표시하고 결과별 방식을 확인).
- execution: not-run/running/completed/blocked/skipped.
- verdict: PASS/FAIL/unjudged.
- review: required/unreviewed/reviewed.

미실행 수동 단계는 unjudged/required다. 출처 hash·동일 identity·모든 요구 assertion·명시적 verdict와 검토자 기록이 충족된 metadata review만 completed/reviewed/PASS 또는 FAIL로 기록한다. 파일 첨부만으로 PASS하지 않는다. 과거 MANUAL에는 이 정보가 없으므로 선행 증거로 추정 수락하지 않는다. 자동 실패는 수동 검토로 덮지 않는다. FAIL 검토는 보존하지만 다음 단계 통과로 쓰지 않는다.

소스 검사 PASS와 전체 설정 preflight는 별개다. 첫 DB 단계는 현재 소스의 light/web/runtime/rules PASS, 변경 없는 HEAD/소스/공개 파일 identity, 최근 증거와 DB 전용 설정을 요구한다. offline 전체 상태가 관련 없는 설정 누락으로 BLOCKED여도 이 네 검사가 실제 통과하고 실패가 없으면 **소스 검사 선행 조건만** 충족한다. 소스 단계의 종합 판정이나 전체 배포 준비를 PASS로 바꾸지 않는다.

아래는 아직 실행하지 않을 **최초 검증용 명령**이다. `TEST_ENV_JSON`은 예제에서 검토해 만든 test: identity 파일, `TEST_ENV`는 별도 시험 owner/auth URL을 담는0600 보호 env 파일이다. 실제 준비값으로 바꾸며 비밀은 명령문에 적지 않는다.

```sh
# 허용된 offline 검사: 실행 guard는 설정하지 않는다
pnpm validate --stage offline --environment TEST_ENV_JSON --env-file TEST_ENV --output artifacts/NEW-SOURCE.json --execute
# 미래 DB 통합 승인 뒤에만 실행. runner가 DB를 생성/기동/migration하지 않음
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm validate --stage database --environment TEST_ENV_JSON --env-file TEST_ENV --prerequisite artifacts/NEW-SOURCE.json --output artifacts/NEW-DATABASE.json --execute
```

필수 조건: test: 배포 ID와 DEPLOYMENT_ID 일치, 운영 DB와 다른 `callsign_test_*` DB에0000~0006 적용 및 역할 GRANT 완료, TEST_DATABASE_URL=시험 owner, TEST_AUTH_DATABASE_URL=같은 시험 DB의 별도 auth LOGIN. 미래 준비 명령은 기존 migration/provision-logins 절차를 사용한다. AI/OIDC/PBX/기관 등록/실제 trust를 DB 경계 시험 선행 조건으로 추가하지 않는다. 결과는 NEW-DATABASE JSON/고정 sidecar·진행 파일이다. assertion 미실행/skip·권한 과다·hash 불일치·guard/identity 불일치·실패·timeout이면 중단한다.

### 미커밋 checkpoint의 포함·제외

tracked 수정뿐 아니라 untracked인 앱/서비스/프로토콜/verifier/계약/시험/SQL/도구/설정 템플릿도 함께 보존해야 한다. pnpm-lock.yaml·workspace·package manifest·Dockerfile·Compose·genesis 생성 코드·계약 artifact와 그 검토 hash도 필요하다. runner는 sourceFiles 목록/hash를 출력하고 artifacts 아래 실제 선택 계약 artifact를 별도 publicFiles hash에 포함한다. 두 값은 전체 배포 복제본이 아니다.

개인키·보호 env·OIDC/브라우저 storage·전사/원음·DB/chain volume·임시 build/cache는 코드 checkpoint에서 제외하고 역할별 별도 보호/백업 정책을 따른다. 기존 증거는 삭제하지 않으며 검토 후 참조로 보존한다. HEAD/소스 hash 외에 실제 이미지·환경·contract/trust·독립 anchor·DB 이력과 운영 기록이 있어야 같은 배포를 재현할 수 있다. 이번에 stage/commit/push하지 않는다.

## 자원 제한 PostgreSQL 검증 실측 절차

2026-10-29 사용자 한정 승인으로 첫 DB 통합15시험이 통과했다. 전체 서비스/독립 anchor/chain/통화 성공과 구별한다. 이후 실행도 별도 허가와 현재 자원 재확인이 필요하다. 이번 시험/실패·수정 근거는 [최신 기록](FINALS-IMPLEMENTATION-PLAN.md#postgres-validation-20261029)을 따른다.

이미 실행 중인 Docker와 로컬 `postgres:17.6-alpine` image ID만 사용했다. 다운로드/Compose/기존 Postgres 사용은 안 한다. 다음은 같은 방식의 준비 명령 형태이며 NAME/DB/보호 파일은 새 작업 전용 값을 먼저 준비한다.

```sh
docker network create --opt com.docker.network.bridge.enable_ip_masquerade=false --label callsign.test=RUN_ID NAME
docker run --pull=never -d --name NAME --label callsign.test=RUN_ID --label com.centurylinklabs.watchtower.enable=false --network NAME --publish 127.0.0.1::5432 --memory 512m --memory-swap 512m --cpus 1 --pids-limit 128 --shm-size 64m --tmpfs /var/lib/postgresql/data:rw,size=256m,mode=0700 --env-file PG_TEST_ENV LOCAL_IMAGE_ID postgres -c shared_buffers=32MB -c work_mem=2MB -c maintenance_work_mem=16MB -c max_connections=40
docker exec NAME pg_isready -h 127.0.0.1 -U cs_test_owner -d callsign_test_UNIQUE
```

PG_TEST_ENV는0700 임시 디렉터리의0600 파일로 POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD만 담는다. 비밀번호는 시험용으로만 생성하고 명령 argv/증거/Git에 넣지 않는다. 별도 보호 TEST_ENV에는 test: DEPLOYMENT_ID, owner TEST_DATABASE_URL, 같은 DB의 다른 TEST_AUTH_DATABASE_URL을 둔다. Docker internal network에서는 이 환경의 host port mapping이 생성되지 않았으므로 동일 옵션으로 무조건 재시도하지 않는다. localhost port 연결과 시험 DB 이름/label을 확인한 다음에만 migration을 적용한다.

해당 보호 프로세스 환경의 MIGRATOR_DATABASE_URL로 `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration node --import tsx scripts/migrate-finals.ts --apply`를 실행한다. 이후 owner의 psql로 기존 provision-logins.sql을 적용하며 네 비밀번호는 보호 stdin/env로 전달한다. 기존 LOGIN이 있으면 도구는 덮어쓰지 않는다. 시험 env JSON/URL은 이전 절의 runner 명령에 그대로 사용한다.

source 검사에서 타입 검사 프로세스 트리 RSS는 약1.2GiB를 사용했다. 테스트 예산은2GiB·DB512MiB이며 기존 작업용 available8GiB 이상을 남긴다. worker1이라도 Promise.all과 실제 독립 SQL 연결의 경합은 유지한다. 5분 한도, available/pswpin/pswpout·자식 RSS를 관측하고 한도 초과 시 이번 자식과 DB만 중단한다. 실제 실행에서 환경 부족/timeout/skip은 PASS가 아니다.

증거와 실패 관측을 먼저 보존하고 생성 label/id를 대조한 뒤 이번 컨테이너와 network만 제거한다. tmpfs 데이터는 컨테이너와 함께 없어지며 별도 volume을 만들지 않는다. 마지막에 보호 임시 자격 파일도 제거한다. 전역 prune, 기존 DB 정리, 기존 프로세스 중단은 하지 않는다. 공급자·OIDC·체인 설정이 없어도 이 DB 검증은 가능하다.

실행 결과: 수정 checkpoint `7c1df4f`에서 같은 DB 재실행15/15, 남은 worker queue0을 확인했다. [최종 결과](../artifacts/local-postgres-result-20261029.json)에 정리 완료·시험 HEAD·소스 hash가 있다. 두 번째 cluster 정리는304초로5분 목표를4초 넘겼으며 이후 실행에서는 hard deadline 이전 정리 여유를 확보한다. 이 결과는 독립 anchor·disk 복구·전체 서비스 검증이 아니다.

## 로컬 EVM 계약 검증 (2026-10-30)

사용자의 이번 한정 허가는 서버 없는 Foundry 로컬 EVM과 제한 fuzz/일반 Git push다. 기존 chain guard를 유지한다. Anvil/Besu/RPC·fork·배포·DB를 이 명령에 끼우지 않는다.

```sh
# 설치된 forge/Solc/기존 의존성이 있을 때만, 별도 허가 후 사용
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain timeout 90s pnpm test:contracts:offline
```

이 명령은 `forge test --offline --threads 1 --fuzz-runs 32 --fuzz-seed 0x20261030`이다. 현재 검증은 Solc0.8.30·cancun·optimizer10000·FFI=false, 시험 자식의 address-space2GiB 상한에서 수행했다. 별도 output/cache를 사용하려면 forge의 `--out`/`--cache-path`를 지정한다. 기존 cache 삭제나 compiler 자동 다운로드로 우회하지 않는다. 도구/버전이 없으면 BLOCKED로 남긴다.

`artifacts/contract-interop-fixture-20261030.json`은 실제 앱 typed-data·worker ABI·consumer event ABI로 생성한 공개 시험 벡터다. 운영키나 실제 배포 metadata가 아니다. Solidity가 이를 읽어 실제 수락/변조 거절·digest/signer·event bytes를 검증하고, light 단위 시험도 현재 앱 출력과 비교한다. FFI는 필요 없다.

```sh
# 실제 로컬 compiler artifact를 입력해 새 경로에 생성한다. 네트워크/운영키 없음.
node --import tsx scripts/contract-interop.ts contracts/out/ServiceRegistry.sol/ServiceRegistry.json artifacts/NEW-REVIEWED-FIXTURE.json
```

기존 벡터를 자동 덮어쓰지 않는다. 앱/서명 규약 변경 시 새 벡터 diff와 Solidity 입력 경로를 함께 검토한다. bytecode가 바뀌면 ABI·검토 hash·신뢰 이행도 별도로 갱신하며 배포는 별도 승인이다. 이번에는 계약 본체/ABI/bytecode가 기존 검토 artifact와 같아 재배포나 artifact 교체가 필요하지 않았다.

수락 기준은 전체21시험 실패/skip0, fuzz32case에서2개씩 실제 상태 변경, 정상 대조군이 성공하는 문맥의 replay 거절, 실패 시 상태/nonce 보존이다. 이것을 전체 상태 공간·Besu/QBFT·Witness·미디어 회수·실측 지연 검증으로 확대하지 않는다. [최신 계약 기록](FINALS-IMPLEMENTATION-PLAN.md#contract-validation-20261030)을 따른다.

CI 이식성: source hygiene의 파일 열거는 Git checkout의 cached/untracked 목록을 사용한다. rg 설치를 실행 환경 전제로 두지 않는다. conflict marker/JS syntax 검사와 Git-only PATH 회귀를 유지한다. 2026-10-30 최초 push CI의 rg ENOENT와 수정은 진행표에 기록했다.


<a id="authenticated-http-tests"></a>

## 인증·HTTP·브라우저 통합 검증

별도 사용자 허가 후 `pnpm test:http`를 사용한다. 기존 database 단계와 기본 light에는 포함하지 않는다. 시험은 실제 issuer/platform/Sender Agent 라우트·OIDC callback·세션/CSRF/권한 검사·PostgreSQL을 사용하며, 원장 현재 상태와 독립 anchor만 시험 adapter로 대체한다. PBX/음성·외부 제공자를 실행하지 않는다.

필요 입력과 준비 순서:

1. 새 고유 `callsign_test_*` DB가 있는 별도 PostgreSQL cluster/container를 loopback에 준비한다. 기존 인스턴스를 사용하지 않는다. migration 전에 `docker exec TEST_CONTAINER pg_isready -t 2 -U TEST_OWNER -d TEST_DB`로 준비 완료를 확인한다. 준비 안 된 상태에서 migration을 시작하지 말고 최대10초 안에 준비되지 않으면 중단한다. 이번 실행은 로컬 `postgres:17.6-alpine`, 512MiB·CPU1·tmpfs256MiB·max_connections32를 사용했다. 이미지가 없으면 다운로드하지 않고 중단한다. 컨테이너 label에 시험 identity를 기록한다.
2. owner `MIGRATOR_DATABASE_URL`로 기존 `scripts/migrate-finals.ts --apply`를 integration 범주에서 실행한다. `infra/deploy/provision-logins.sql`로 별도 issuer/auth/worker/PBX LOGIN을 준비한다. 비밀번호는 보호 환경파일에만 두고 owner를 API에 전달하지 않는다. 기존 LOGIN이 있으면 재설정하지 말고 다른 시험 cluster를 사용한다.
3. 보호 디렉터리 `CALLSIGN_HTTP_TEST_ROOT`(0700)에 시험용 `tls.key`(0600), `tls.crt`를 준비한다. 설치된 OpenSSL로 1일짜리 **시험 전용** 인증서를 만들며 SAN은 `IP:127.0.0.1,DNS:localhost`다. 운영 인증서/키를 복사하지 않는다. 예: `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout "$CALLSIGN_HTTP_TEST_ROOT/tls.key" -out "$CALLSIGN_HTTP_TEST_ROOT/tls.crt" -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1,DNS:localhost`. 쉘의 umask는077로 둔다.
4. 보호 환경파일에 `TEST_DATABASE_URL`=owner, `ISSUER_DATABASE_URL`=issuer LOGIN, `AUTH_DATABASE_URL`/`TEST_AUTH_DATABASE_URL`=auth LOGIN을 지정한다. 같은 시험 DB의 서로 다른 LOGIN이어야 한다. `NODE_EXTRA_CA_CERTS`는 위 tls.crt의 경로다. Node 시작 전에 설정해야 하며 TLS 검증을 전역 해제하지 않는다. 실제 OIDC/ARI/STT/LLM/클라우드 자격정보는 시험 환경에 상속하지 않는다.
5. 기존 pnpm 의존성과 설치된 Playwright Chromium/headless shell을 확인한다. 시험은 브라우저나 모듈을 설치하지 않는다. 브라우저가 없으면 HTTP 검증과 구분해 환경 차단으로 기록한다.

보호 환경파일을 검토해 현재 shell에 읽은 뒤 실행할 정확한 명령:

```sh
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration timeout 120s pnpm test:http --reporter=json --outputFile=artifacts/NEW-HTTP.json
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration timeout 120s pnpm exec vitest run --config vitest.integration.config.ts tests/integration/finals-store.test.ts tests/integration/finals-session-scopes.test.ts tests/integration/service-runtime.test.ts tests/integration/database-readiness.test.ts --reporter=json --outputFile=artifacts/NEW-DATABASE.json
```

`NEW-*`는 기존 증거와 겹치지 않는 새 이름으로 바꾼다. HTTP fixture는 고유 기관/계정을 만들고 issuer·platform·Sender Agent·HTTPS 웹·OIDC의 포트를 직접 할당한다. 체인 상태 adapter는 지정한 digest만 확정 상태로 간주하고, 미확정/철회/조회 불가를 따로 시험한다. 앱의 인증·서명 검증을 대체하지 않는다. `test:` 배포 identity와 loopback origin, 같은 `callsign_test_*` DB의 별도 LOGIN이 아니면 adapter 주입을 거절한다. `oidc_state`·세션 row를 정상 로그인 fixture로 직접 주입하지 않는다. discovery 문서는 fixture가 제공하지만 현재 앱은 명시적으로 설정한 authorize/token/JWKS URL을 소비한다.

통과 조건은 JWT 실패 경계·정확한 issuer/subject·work/official 분리·CSRF·재인증·계정 회수·실제 DB 행/outbox·동시 소비의 같은 서명 영수증·lease 서명 및 브라우저 클릭 결과다. HTTP200/문구만으로 판정하지 않는다. Chromium은 시험 인증서만 허용하도록 해당 context의 `ignoreHTTPSErrors`를 사용하고 Node↔OIDC는 추가 CA로 검증한다. 운영 TLS/실제 IdP 호환성의 검증이 아니다.

각 단계는120초 이내, worker1로 실행한다. DB512MiB 외 Node/브라우저 예산2GiB를 잡고 가용 메모리8GiB 미만·지속적 swap 입출력·기존 작업 영향이면 중단한다. 정상 종료 시 app·Vite·fixture·browser를 닫는다. 강제 timeout 때에는 **이번 실행이 만든 자식 process group**만 회수하고, DB label/identity를 대조한 후 해당 컨테이너만 제거한다. 전역 prune/pkill을 사용하지 않는다.

스크린샷은 ROOT 아래 고유 `run-*` 디렉터리의 `service-mobile.png`/`service-desktop.png`다. cookie/storage/trace는 저장하지 않는다. 공유 전 합성 계정만 들어 있는지 확인하고 실제 API/DB 결과·코드 hash와 함께 보존한다. 보호 ROOT에는 테스트 개인키와 인증서가 있으므로 통째로 커밋하지 않는다. 증거 추출 후 이번 자원과 보호 파일만 제거한다.


### 인증 후속 경계 검증

`pnpm test:http`는 `service-http.test.ts`와 `service-boundaries.test.ts`를 worker1로 실행한다. 두 파일은 `service-http-fixture.ts`의 같은 실제 서버 lifecycle을 사용한다. 후속 시험은 시나리오마다 고유 기관·계정·DB 상태를 만들고 자체 행만 제거한다. 공동 승인자는 같은 Chromium 프로세스의 **서로 다른 browser context**를 사용하고, 다중 탭 시험은 의도적으로 하나의 context를 공유한다. 키는 Node 준비 단계에만 존재하고 서명 파일만 화면에 가져온다.

- 원장 확정은 fixture log와 계약 조회 응답을 실제 SQL event consumer에 공급한다. Witness는 4개 시험키로 실제 JWS를 만들고 집계·서명·freshness 검사를 그대로 수행한다. 실제 RPC·Witness 서비스·합의 시험은 아니다.
- 시계 주입은 통화 업무 권한의 경계에만 적용한다. OIDC 서명·auth_time·cookie 조건은 완화하지 않으며 세션 만료 시험은 해당 합성 계정의 시험 session 행만 만료시킨다.
- 응답 지연·유실은 `route.fetch()`가 받은 **실제 API 응답**을 보류하거나 버린다. 응답 본문을 성공 mock으로 바꾸지 않는다. STT/LLM은 명시적인 provider fixture이며 실제 WebSocket·동의·quota·revision·AbortSignal 경로를 사용한다. 원격 마이크/RTP는 검증하지 않는다.
- 통과 조건은 제안 digest와 독립 서명·정족수, outbox/confirmed/activated 분리, 잘못된 이벤트·Witness 거절, 이전 계정 응답 폐기, 서버 세션 회수, 실제 저장된 단일 업무와 재시도 결과, 동의 철회 후 provider push0 및 늦은 위험 결과 폐기다. 공식 업무는 목록 버튼 출현을 기다린 뒤 만료·삭제를 비교한다. 로그인 완료는 callback200과 정확한 계정 heading을 기다린다. 고정 sleep·무제한 retry를 사용하지 않는다.

DB 회귀를 따로 실행할 때에는 전체 integration glob 대신 아래 네 파일을 지정한다. 이전 시연 API와 독립 anchor 시험은 각자의 환경이 필요한 별도 범위다.

```bash
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration timeout 120s pnpm exec vitest run --config vitest.integration.config.ts tests/integration/service-runtime.test.ts tests/integration/finals-session-scopes.test.ts tests/integration/finals-store.test.ts tests/integration/database-readiness.test.ts --reporter=json --outputFile=artifacts/NEW-DATABASE.json
```

DB의 최초 준비 완료는 `pg_isready -h 127.0.0.1 -U TEST_OWNER -d callsign_test_UNIQUE`로 확인한다. 공식 PostgreSQL 이미지의 초기화용 임시 Unix socket만 열린 시점에는 migration을 시작하지 않는다. 실제 자격은 앞 절의 보호 파일/환경 참조를 사용한다.

후속 증거는 [경계 검증 평가](../artifacts/service-boundaries-20261030.json)에 연결한다. 실패 이력도 보존하고 부분 필터 실행의 SKIPPED를 전체 PASS에 합산하지 않는다. 검증 이후에도 실제 체인·독립 anchor·PBX·제공자·운영 IdP 검증은 별도 허가와 설정이 필요하다.


## 쓰기 중 백업 준비와 별도 cluster 복원

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

## 영속 anchor·앱 복원 검증

[2026-10-30 실행 기록](FINALS-IMPLEMENTATION-PLAN.md#persistent-recovery-20261030)은 같은 호스트에서 분리한 PostgreSQL 저장소·HTTPS anchor·API/worker 재시작과 **앱 범위** 암호화 복원을 확인했다. 실제 체인/미디어·호스트 전원/디스크 장애·독립 기관 운영은 별도다. 이후 실행도 별도 허가·현재 자원 확인이 필요하다. 전체 recovery runner의 chain 선행 조건은 전체 배포 복원에 대한 조건으로 유지한다. 아래 application 시험은 그 PASS를 대신하지 않는다.

### 소유 시험 환경 준비

1. 고유 `callsign_test_*` identity와0700 보호 ROOT를 정한다. 기존 이미지 `postgres:17.6-alpine`이 없거나 현재 여유가 없으면 다운로드/기존 서비스 중단으로 우회하지 않는다. 이번 기준은 DB 합계768MiB/CPU1.5, Node 예산2GiB, worker1, 명령240초·개별 시험 최대65초다. available8GiB 미만·지속 swap·기존 작업 영향이면 이번 자원만 중단한다.
2. 서비스와 anchor에 **각각 다른** 컨테이너·named volume·비밀번호·LOGIN을 사용한다. `docker volume create --label callsign.recovery=IDENTITY VOLUME` 뒤, 기존 이미지에 `--pull=never --label callsign.recovery=IDENTITY --memory=512m --memory-swap=512m --cpus=1 --pids-limit=100 --mount source=SERVICE_VOLUME,target=/var/lib/postgresql/data --env-file PROTECTED_SERVICE_ENV -p 127.0.0.1::5432`를 지정한다. anchor는 별도256m/CPU0.5/volume/env로 만든다. ROOT를 양쪽의 **같은 절대 경로**에 bind하면 native DB 도구가 보호 파일을 읽고 쓸 수 있다. `POSTGRES_USER=test_owner`, `POSTGRES_DB=callsign_test_UNIQUE`, `POSTGRES_PASSWORD`는 각각 보호 env 파일에만 둔다. 접속 준비는 Unix socket이 아니라 `pg_isready -h 127.0.0.1`로 확인한다.
3. 서비스 DB owner의 `MIGRATOR_DATABASE_URL`을 보호 환경에서 읽고 `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration pnpm exec tsx scripts/migrate-finals.ts --apply`를 실행한다. `infra/deploy/provision-logins.sql`로 issuer/auth/worker/PBX의 서로 다른 LOGIN을 준비한다. owner를 API 실행 계정으로 사용하지 않는다.
4. anchor DB owner로 `infra/deploy/anchor-schema.sql`을 적용한다. 별도 anchor service LOGIN은 해당 테이블의 SELECT/UPDATE만 부여하고 token도32자 이상으로 분리한다. 시험은 owner의 `ANCHOR_ADMIN_DATABASE_URL`로 **매번 새로운** 기관/deployment의 zero 행만 만든다. 이미 전진한 anchor를 삭제/초기화/과거 복원하지 않는다. 운영 준비도 같은 별도 수명 원칙을 따르며 DB 백업에 anchor 저장소를 포함하지 않는다.
5. ROOT에 시험 전용 `tls.key`0600·`tls.crt`를 준비한다. SAN은 `IP:127.0.0.1,DNS:localhost`이며 `NODE_EXTRA_CA_CERTS`를 Node 시작 전에 지정한다. `ANCHOR_TLS_KEY_PATH`/`ANCHOR_TLS_CERT_PATH`는 둘 다 설정하거나 둘 다 생략한다. 운영 기본은 기존 reverse proxy HTTPS 경로를 사용할 수 있다. worker의 CA bundle도 anchor와 PBX가 사용하는 신뢰를 포함해야 하며 CA를 자동 신뢰하지 않는다.
6. `TEST_DATABASE_URL`/`MIGRATOR_DATABASE_URL`은 새 서비스 시험 owner, `ISSUER_DATABASE_URL`/`AUTH_DATABASE_URL`/`WORKER_DATABASE_URL`/`TEST_AUTH_DATABASE_URL`은 별도 서비스 LOGIN이다. `ANCHOR_DATABASE_URL`은 별도 저장소의 anchor service LOGIN이다. `CALLSIGN_RECOVERY_TEST_ROOT`, `CALLSIGN_RECOVERY_ID`, `ANCHOR_TOKEN`, TLS 경로, `TMPDIR`을 보호 환경에서 설정한다. URI·비밀번호·키 원문을 로그/명령 인자에 넣지 않는다.

호스트에 `pg_dump`/`pg_restore`/`psql`이 없다면 설치·다운로드 대신 이미 실행 허가받은 시험 이미지의 native 도구만 사용한다. 아래 보호 wrapper는 ROOT가 컨테이너 안에서도 같은 경로로 mount된 경우의 예다. `CALLSIGN_TEST_PG_CONTAINER`는 identity/label을 대조한 **서비스 시험 컨테이너** 이름이다. 세 이름의 실행 파일에 동일 내용을0700으로 저장하고 해당 bin 경로를 시험 자식 PATH에만 추가한다. 다른 장비에 matching PostgreSQL client가 있으면 wrapper 없이 그 도구를 사용한다.

```python
#!/usr/bin/python3
import os, sys, subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

def local_uri(value):
    if value.startswith(('postgres://', 'postgresql://')):
        u = urlsplit(value)
        if u.hostname != '127.0.0.1' or not u.path.startswith('/callsign_test_'):
            raise SystemExit('DISPOSABLE_LOCAL_DB_REQUIRED')
        return urlunsplit((u.scheme, u.netloc.rsplit(':', 1)[0] + ':5432', u.path, u.query, u.fragment))
    return value

container = os.environ['CALLSIGN_TEST_PG_CONTAINER']
if not container.startswith('callsign_test_'):
    raise SystemExit('OWNED_TEST_CONTAINER_REQUIRED')
args = ['docker', 'exec', '--user', f'{os.getuid()}:{os.getgid()}', '-i']
if 'PGPASSWORD' in os.environ:
    args += ['-e', 'PGPASSWORD']
args += [container, Path(sys.argv[0]).name, *map(local_uri, sys.argv[1:])]
raise SystemExit(subprocess.run(args).returncode)
```

이번 wrapper도 기존 이미지·동일 UID/GID를 사용하고 loopback 포트와 보호 파일 mount 경로만 변환했다. 기존 DB에 이 wrapper를 사용하지 않는다.

### 명시적 시험 명령

```bash
# 기존 DB 네 파일과 영속 복구 시험. 이번 ROOT의 anchor/API/worker 자식 프로세스를 실행한다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration timeout 240s pnpm exec vitest run --config vitest.integration.config.ts tests/integration/persistent-recovery.test.ts tests/integration/service-runtime.test.ts tests/integration/finals-session-scopes.test.ts tests/integration/finals-store.test.ts tests/integration/database-readiness.test.ts --reporter=json --outputFile=artifacts/NEW-PERSISTENT-RECOVERY.json

# 영향받은 HTTP 경로만 확인한다. Vite/브라우저는 기동하지 않고 OIDC는 로컬 HTTPS fixture다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration CALLSIGN_HTTP_API_ONLY=true timeout 120s pnpm exec vitest run --config vitest.http.config.ts tests/integration/service-http.test.ts --testNamePattern='uses real|rejects issuer|enforces CSRF|issues and consumes|requires real recent|blocks new work' --reporter=json --outputFile=artifacts/NEW-HTTP-API.json
```

`CALLSIGN_HTTP_TEST_ROOT`는 같은 시험 TLS ROOT로 지정한다. 브라우저 케이스의 의도적 제외1개는 실제 실행6개와 별도로 기록한다. `persistent-recovery.test.ts`의 actor는 합성 bearer fixture이며 로그인 생성 검증을 대신하지 않는다. 실제 라우트·ServiceAuthority·SQL·journal·CAS·native backup/restore는 유지한다. 원장 전송/receipt는 명시적인 fixture이며 RPC를 호출하지 않는다. 시험별 관측 JSON은 ROOT 아래 UUID+wx로 새로 쓰며 원본을 덮지 않는다.

첫 Issuer는 별도로 사전 준비된 zero anchor와 빈 journal을 확인해 첫 authority checkpoint를 만든다. anchor가 없으면 자동 초기화하지 않는다. Worker는 기존 checkpoint 검증만 수행하며 zero checkpoint를 만들지 않는다. Issuer의 초기 확인이 끝난 다음 worker를 시작한다. Compose worker에도 별도 `DEPLOYMENT_ID`·anchor URL/token·신뢰 CA가 필요하다. gate가 닫히면 일반 작업 claim/renew/서명 저장/완료는 중단하고 terminal cleanup은 남긴다.

### 백업 범위·복원 실패·재개

현재 백업 준비는 위 ‘쓰기 중 백업 준비와 별도 cluster 복원’ 절의 DB 공통 drain token/fence 절차를 따른다. 다음은 이전 고정 fixture 시험의 전제다. 백업 동안 모든 API/worker 쓰기를 승인된 유지보수 절차로 멈추고 진행 중 요청을 drain해야 한다. SQL SHARE lock만으로 외부 anchor CAS를 막을 수는 없다. 독립 anchor는 조회를 위해 유지하지만 같은 배포의 다른 writer가 전진시키지 않아야 한다. 이를 확인할 수 없으면 확인 문자열만 넣어 실행하지 말고 BLOCKED로 남긴다. 이번 시험은 backup 동안 API/worker 자식이 없는 합성 환경에서 수행했다.

- 기본 `BACKUP_SCOPE=full`은 기존 `BACKUP_CONFIRMATION=MAINTENANCE-WITH-QUIESCED-CHAIN`과 실제 정지된 chain archive를 요구한다. 이번에는 실행하지 않았다.
- 체인 없는 검증은 `BACKUP_SCOPE=application`, `BACKUP_CONFIRMATION=QUIESCED-APPLICATION-ONLY`로 명시한다. 이 경우 manifest에도 application으로 기록하며 chain archive를 만들거나 채우지 않는다. 다른 issuer/sender/키/trust/config/deployment env 경계는 유지한다.
- manifest format1의 현재 producer는 scope·정확한 payload/tag 목록·hash/size·migration source hash를 MAC에 포함한다. 이 정보가 없는 이전 bundle은 자동 복원하지 않는다. 기존 파일을 수정해 통과시키지 말고 인증/내용/호환성을 별도 검토하고 준비 가능한 정상 원본에서 새 bundle을 만든다.
- 새 비어 있는 DB와 새0700 디렉터리만 사용한다. 모든 GCM payload와 archive 경로/형식을 확인한 뒤 SQL schema/data·migration 대조·gate 차단·세션/임시 자격 제거를 한 transaction으로 적용한다. 사용자 테이블이 하나라도 있거나 target 폴더가 이미 존재하면 중단한다.
- 영수증/journal·권한 epoch·키 version·계정 비활성/철회 이력을 보존한다. 세션·미사용 승인·challenge·요청 cache·lease·PBX 임시 자격/행은 다시 사용하지 않는다. outbox의 진행 claim만 해제하고 signed transaction/nonce/결과 불명 이력은 유지한다.
- 인증/복호화/archive/SQL 검증 실패는 새 DB에 정상 상태를 commit하지 않는다. SQL 적용 뒤 파일 쓰기 실패가 나면 gate는 blocked이고 완료 checkpoint는 쓰지 않는다. 대상은 재사용하지 말고 이 실행 소유의 부분 대상임을 확인해 폐기한 뒤 새 대상으로 재시도한다. 임시 복호화 파일은 finally에서 제거한다. 프로세스 강제 종료 때 남은 평문은 해당 보호 TMPDIR만 확인해 제거한다.
- 복원은 서비스 시작·anchor rollback·키 재발급·권한 generation 초기화를 하지 않는다. 최신 anchor 대조가 일치해야 gate를 열고, 새 로그인·새 통화 시도·공개 trust/키 검증을 적용한다. anchor가 앞서거나 이력이 손상됐으면 자동으로 맞추지 않는다. 현재 구현에는 이 불일치를 자동 해제하는 승인 복구 도구가 없으며 운영자의 원본 이력 복구/공동 재신뢰 결정이 필요하다.

공유 증거는 코드/도구 hash·원본 판정·관측 요약·비밀 제거 로그만 남긴다. 백업/복호화 키·dump·SQL 평문·session·개인키·브라우저 storage는 게시하지 않는다. 자식 서버/worker가 종료됐음을 확인하고 container/volume의 identity label을 대조한 뒤 **그 두 컨테이너·그 두 volume과 보호 ROOT**만 정리한다. 전역 prune, 기존 프로세스 종료, 기존 anchor 초기화는 하지 않는다.
