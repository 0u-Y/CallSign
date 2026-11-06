# 개발·배포·복구 운영 절차

### 공개 프런트엔드와 실제 통화 배포 구분

현재 시연 진입은 `/demo/work`(업무 관리), `/demo/call`(연락·통화)과 `/demo/governance`(공동 관리)이며 `/demo`도 연락 화면을 연다. `/service`는 업무 화면과 OIDC callback, `/official`은 별도 공식 인증을 유지한다. 현재 [공개 연락 화면](https://callsign-rouge.vercel.app/demo/call)과 [공동 관리 화면](https://callsign-rouge.vercel.app/demo/governance)은 실제 로그인·업무 API 연결 모드다. 별도로 생성하는 public preview 빌드는 API 미연결을 표시하고 로그인/통화를 수행하지 않는다. 공개 `/legacy/demo`는 `/service`로 이동한다. 과거 발표 컴포넌트는 소스 이력으로 보존한다. 현재 확정 배치는 Vercel frontend와 기존 서버컴의 지속 backend이며, AWS 이전은 이번 범위 밖이다. 현재 배치의 metadata/trust/PBX 인증서와 frontend pin을 일치시킨다. Vercel URL 유지를 위해 cookie·Origin·CSRF·WSS 조건을 완화하지 않는다.

시연 준비와 조작은 다음 순서다. 실제 실행 여부는 [현황표](guide/05-IMPLEMENTATION-STATUS.md)를 먼저 확인한다.

1. 운영자가 제공한 보호 계정 자료에서 기관·상담원·수신자·공동 승인자의 로그인을 확인하고 **서로 다른 브라우저 프로필**을 준비한다. 이메일/표시 이름 대신 제품 내부 계정 ID를 업무에 입력한다. 계정 ID는 로그인 후 ‘내 계정 식별자’에서 확인한다. 보호 비밀번호·서명키는 문서나 화면 공유에 포함하지 않는다.
2. ‘로그인 · 역할 연결 · 실행 준비’에서 업무 계정으로 로그인한다. 기관은 등록 콜센터를 고르고 수신자/상담원 ID로 업무를 생성한다. 위임 증서가 없으면 발급하고 **원장 등록됨**을 확인한다. 공동 승인자는 연락 업무 담당자와 별개다.
3. 상담원은 배정 업무에서 새 통화 시도를 만들고 해당 콜센터의 위임 증서를 선택해 개별 연락 승인을 받는다. 양측은 **같은 시도**를 선택한다. 승인한 상담원 브라우저를 새로고침하면 단기키를 잃으므로 새 시도가 필요하다.
4. 양측이 마이크 권한과 PBX 등록을 마친 뒤 상담원이 발신하고 수신자가 수락한다. 수락은 검증 성공과 다르며 양측 연결 검증·음성 수신을 따로 확인한다. 120초 시작 창을 넘긴 시도는 재사용하지 않는다.
5. 수신자는 상대 음성 분석에 별도로 동의한다. 분석 준비에는 제공자 설정·동의·남은 승인 예산이 필요하다. 동의 철회·화면 비활성 뒤에는 전송 중단 상태를 확인하고 필요하면 다시 동의한다. 경고 없음이나 분석 장애는 안전 판정이 아니다.
6. 업무 취소 또는 기관 정지 후 요청 접수·서버 적용·PBX 회수 관측을 구분한다. 조회 장애에도 공통 통화 종료를 사용할 수 있다. 공동 복구는 현재 epoch/nonce/만료의 요청을 독립 승인자들이 서명해 제출한다. API 접수→원장 확정→Witness 확인→새 키/trust 활성화→새 위임·새 연락 순서이며 구 승인·소비·종료 기록을 지우지 않는다.

후속 main `1e6a090`의 공동 복구 화면은 **공개 복구 요청 파일 → 각 승인자의 공개 서명 파일 → 로컬 검증 → 복구 권한자의 제출** 순서다. 서명키는 별도 도구에 두며 화면의 서명 수가 로그인한 사람의 키 소유나 원장 확정을 뜻하지 않는다. 기준 `20cbd65`의 JSON 직접 제출 화면과 구분한다. 최신 운영자의 화면 버전을 확인하고 사용한다.

계정·마이크·현재 trust pin·공개 HTTPS/API·SIP WSS·ICE/TURN·감시·분석 relay/provider 입력 중 빠진 조건이 있으면 해당 단계의 준비 미완료로 설명한다. 과거 합성 fixture를 실시간 결과처럼 대신 표시하지 않는다.


Vercel 배포를 확인할 때 `/build-meta.json`의 commit/target/publicPreview와 실제 직접 경로 렌더링을 함께 확인한다. 이 파일이 없거나 HTML fallback이면 배포 SHA 미확인이다. 저장소 vercel.json은 의도한 설정이며 원격 Root Directory·연결 브랜치가 같다는 증거가 아니다. 기존 프로젝트 ID만으로는 조회/게시할 수 없고 별도 token 보호 파일 참조가 필요하다. 당시 미연결 화면 캡처는 [재설계 근거](../artifacts/service-redesign-20261104.json), 이후 공개 연결의 확인 범위는 현황표에 연결한다.

인증 참조를 제공할 수 없다면 기존 프로젝트 대시보드의 Deployments → Create Deployment에서 **확인할 전체 Git SHA**를 지정한다([공식 Git reference 배포](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)). 프로젝트/환경과 배포 SHA를 함께 기록하고 오래된 deployment의 Redeploy를 대신 사용하지 않는다. 저장소 의도는 Root Directory `.`, Vite, `vercel.json`의 pnpm workspace build와 `apps/web/dist`이며 원격 설정을 확인하기 전 임의 변경하지 않는다. 먼저 Preview의 실제 `/service`·`/official`·`/demo/work`·`/demo/call`·`/demo/governance`·JSON build metadata·정적 자원을 확인하고 같은 검증 배포를 공개 주소에 반영한다. 연결 브랜치·환경·queued 원인은 프로젝트 접근 권한으로 확인해야 하며 대시보드 정보가 없으면 추정하지 않는다.



## 지속 서비스와 시험 환경의 분리

공개 로그인·API·미디어·분석의 확인 날짜와 실행 소스는 [현황표](guide/05-IMPLEMENTATION-STATUS.md)에서 관리한다. 전용 Funnel의 HTTPS/WSS 진단은 제품의 통화·분석 검증과 구분한다. 기존443은 다른 서비스 소유다. 사용자 승인 지속 조건은 시작 가용32GiB·실행 여유16GiB·소유 전체 관측16GiB·기존 구성요소 한도/압박 중단 유지·최대24시간이다. 전체 시험의 기본40GiB guard와 별개다.

전용 userspace 노드의 등록·Funnel 권한·HTTPS 활성화와 보존 identity를 재사용한다. `scripts/prepare-demo-ingress.py`는 등록 준비 도구이며 지속 backend launcher가 아니다. Tailscale Funnel의 TLS/TCP 성공으로 TURN relay·외부 브라우저 음성 성공을 주장하지 않는다. Vercel rewrite의 실제 진단은 [관측 기록](../artifacts/vercel-ingress-transport-20261105.json)을 따른다.

실제 OIDC는 기존 `compose.oidc.yml`에 `compose.oidc-server.yml`을 합쳐 보호된 env와 고유 project로 준비한다. 이 추가 설정은 기존 host namespace의 loopback54329(DB)·38080(IdP)·39000(readiness)만 사용하며 bridge/port publish/자동 restart를 사용하지 않는다. `docker compose ... config`에서 실제 병합 결과를 확인하고 기존 listener와 충돌하면 기동하지 않는다. NEW의 `oidc-init`만 `import --override false`를 실행하고, 일반 `oidc` 기동은 `start`만 실행한다. 실제 issuer/sub 로그인 검증 뒤 계정을 제품에 연결한다. realm JSON은 완전한 IdP 백업이 아니므로 영속 IdP DB를 보존한다.

지속 자원 감시는 `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure python3 scripts/monitor-deployment.py --env-file PRIVATE_DEPLOYMENT_ENV --output PRIVATE_NEW_MONITOR_DIR`로 시작한다. 60초 사전 관측과 살아 있는 monitor의 `ready.json`을 확인한 뒤 기동하며 이 표시는 제품 readiness가 아니다. 5초마다 검증된 소유 컨테이너의 cgroup 메모리와 호스트 PSI/swap/OOM을 확인한다. 로그는10MiB씩 두 파일로 제한한다. 중단 시 최초 사유를 보존하고 소유 애플리케이션→DB 순서로 중지한다. 자동 재기동하지 않으며 감시 종료도 서비스를 중지한다. 준비 시간을 포함해 감시 시작부터 최대24시간으로 제한한다.

시험 browser는 지속 Compose project와 다른 project 및 `lifecycle=trial`/고유 run-id를 사용한다. 시험 guard는 지속 관측량에 시험 cgroup과 host controller/browser RSS를 합산한다. start/status의 전체 소유권 검사는 엄격하게 유지한다. latch/stop은 각각 확인된 persistent 자원만 중지하고 혼합·불명확 자원은 제외 코드를 남긴다. 시험 정리는 별도로 full ID·project·deployment·lifecycle·run-id를 모두 대조한다.

자원 중단 뒤 사용자가 명시적으로 재개하면 `deployment-control.mjs review`에 보호 env와 `CALLSIGN_RESOURCE_REVIEW_REFERENCE`를 전달한다. 각 승인은 해당 중단 파일의 SHA에 연결된 새 review 파일로 남는다. 원본 중단·이전 review를 삭제하거나 덮어쓰지 않으며, 이후 중단은 다시 기동을 차단한다.

첫 지속 IdP 준비에서는 DB가 healthy가 됐고 NEW import 명령이 exit0으로 종료됐다. healthcheck가 없는 컨테이너를 읽는 기존 Docker template 오류로 감시/자동 중지가 실패해, 조회식을 수정한 뒤 소유 컨테이너를 중지했다. 영속 DB·원본 오류·latch는 보존했다. [실제 결과](../artifacts/persistent-idp-start-20261105.json). 이것은 최초 기동 당시 실패다. 이후 사용자 명시적 재개와 새로운 SHA 연결 review를 거쳐 정상 로그인·API 기동을 확인했으며, 원본 중단 파일은 그대로 보존한다.

첨부 디자인의 색감과 휴대폰 구성을 실제 `/demo/work`·`/demo/call`·`/demo/governance`에서 사용한다. 화면의 탐색은 명령이 아니며 시안의 타이머·전체 상태 초기화·승인자 전환은 실행 도구로 사용하지 않는다. 서로 다른 actor는 독립 브라우저 프로필로 로그인하고 실제 업무 생성→발신/수락→분석 동의→취소/회수를 수행한다. 새 반복은 새 업무·시도로 진행한다. 공개 frontend의 API 미연결 안내가 있으면 이 조작을 실행할 수 없다.

사용자가 전용 노드 등록과 해당 노드의 Funnel 권한·HTTPS 인증서 발급을 완료했다. 등록 링크 재승인을 요구하거나 기존 전체 구성원용 정책을 추가하지 않는다. 보존 identity로 실제 등록/권한을 조회하고, 진단 성공과 제품 backend·미디어 연결을 구분한다. [Funnel의 TLS 종료 TCP 전달](https://tailscale.com/docs/reference/tailscale-cli/funnel#use-a-tcp-forwarder)은 사용할 수 있는 전송 옵션이며, TURN 연동·외부 relay 성공을 입증한 것은 아니다.

현재 Vercel은 HTTP API rewrite와 `api/audio.ts`의 native WebSocket relay를 사용한다. 분석은 같은 origin의 cookie·CSRF·Origin 경계를 유지하며, SIP는 전용 Funnel WSS로 직접 연결한다. WebSocket 접속/거절은 실제 분석 동의·전사 성공과 별개다. HTTP rewrite 성공을 TURN 음성 성공으로 확대하지 않는다. 마이크 정책은 첫-party `(self)`만 허용하며 사용자 동작 전 요청하지 않는다.

현재 로그인은 `/demo/call` → **로그인 · 역할 연결 · 실행 준비** → **업무 계정 로그인**에서 진행한다. 합성 계정은 보호 파일 `.local/persistent-demo-connect-20261105T073906Z/oidc-persistent-inputs/login-credentials.protected.json`에서 확인하고 역할별 독립 브라우저 프로필을 쓴다. 비밀번호는 Git·채팅에 옮기지 않는다. 현재 서버는 `compose.data-server.yml`의 별도 loopback 제품/Anchor DB와 `compose.api-server.yml`의 일반 제품 entrypoint를 사용한다. 기존 실행에서 세 API의 `/health`·`/readiness` 200을 확인했다. 현재 가용성은 현황표와 실제 status로 확인한다. 과거 PBX 미준비503은 당시 기록이며, readiness200도 실제 사용자 통화 완료와 구분한다.

### 역할별 웹 조작

- 기관 담당자: `/demo/work`에서 업무 만들기 → 등록 콜센터·고객 계정·담당 상담원을 선택한다. 목적은 현재 이상거래 정책으로 고정된다. 선택 가능한 계정 목록은 소속 조회 권한이 있을 때만 제공되며 표시 이름이 없는 응답은 실제 ID로 대조한다. 응답 유실 후에는 같은 입력으로 재시도해 기존 멱등키를 유지한다.
- 위임 관리: 업무 배정과 별개로 콜센터의 위임을 발급·철회한다. 등록 대기를 완료로 보지 않는다. 선택 업무 취소는 확인 후 해당 업무에만 요청하며, 상세의 회수 관측에서 서버 적용과 PBX 관측을 따로 확인한다.
- 상담원: 배정 업무 선택 → 연락 검증으로 이동 → **연락 준비**. 등록 위임이나 진행 시도가 여럿일 때만 연결 준비 상세에서 선택한다. 수신자는 같은 업무에서 **연락 받을 준비**를 누른다. 각자 마이크 권한을 확인하고 PBX 준비가 끝나면 상담원이 **양측 웹으로 발신**, 수신자가 **통화 수락 및 검증 시작**을 누른다. 수신자의 수락·분석 동의는 별도이며, 전사/분석은 수신자의 인증 화면에서만 보인다. 세 탭 이동은 통화 controller와 audio DOM을 유지한다.
- 공동 승인자: `/demo/governance`에서 공개 요청 파일의 대상·변경 내용·만료를 검토하고 각자 보호 키로 별도 서명한다. 공개 서명 파일만 가져오며, 서로 다른 유효 서명 2개가 필요하다. 접수·원장 확정·Witness·서버 적용을 따로 확인하고 복구 후 새 위임·업무로 연락한다. 기존 통화는 부활하지 않는다.

UI만 격리 검증할 때는 설치된 의존성으로 웹을 build한 뒤 `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration node tests/ui/demo-workspace.mjs`를 실행한다. 이 명령은 별도 승인이 있는 frontend 시험용이다. loopback 정적 서버와 설치 Chromium을 사용하고 모든 API를 합성 응답으로 가로채며 외부 요청은 차단한다. 지속 backend에서 취소·정지·계정 변경을 시험하지 않는다. 캡처는 `.impeccable/review/`에 생성된다.

### 브라우저부터 실제 서비스까지

| 연결 | 현재 소비 코드/계약 | 지속 환경에서 필요한 확인 |
|---|---|---|
| frontend → API | `https://callsign-rouge.vercel.app/api/v3/*` → Funnel `/api/v3/*` → loopback Platform14100 | 실제 로그인 cookie·CSRF·역할별 업무 조회 확인 |
| frontend → 분석 | 같은 origin `/api/v3/audio` WSS → `api/audio.ts` → Funnel → 제품 분석 WS | Upgrade·거절 경계와 실제 동의된 음성/제공자 분석을 구분 |
| 로그인 → callback | `https://callsign-demo-l-fixed.tail37b235.ts.net/idp/realms/callsign-demo`, 업무/공식 별도 client·audience·PKCE, callback `WEB_ORIGIN/service` | 기존 Keycloak realm/계정 재사용. 관리 경로는 공개하지 않음 |
| 브라우저 → PBX signaling | `wss://callsign-demo-l-fixed.tail37b235.ts.net/pbx/ws` → loopback38088/ws, SIP subprotocol | 정확한 Vercel Origin만 허용. ARI TLS38089는 내부 전용 |
| 브라우저 ↔ 음성 | `turns:callsign-demo-l-fixed.tail37b235.ts.net:8443?transport=tcp` → TLS 종료 → loopback coturn13478 → 소유 relay49160–49200 UDP/PBX10000–10099 UDP | 공개 client leg는 TLS/TCP다. TURN↔PBX의 기존 호스트 주소와 실제 선택 ICE·양측 음성을 별도로 확인 |
| 내부 서비스 | 제품 DB54339·Anchor DB54349·OIDC DB54329, Besu RPC18541–18544·Witness14201–14204·Anchor14300 TLS | loopback/최소권한 유지. DB/RPC/Witness 관리/ARI 외부 공개 금지 |

세션 cookie는 HttpOnly/SameSite strict, OIDC state는 lax이며 변경 요청의 Origin/CSRF 검사를 유지한다. API base URL만 다른 사이트로 바꾸거나 cookie를 완화해 해결하지 않는다. Vercel의 [외부 rewrites](https://vercel.com/docs/routing/rewrites)와 [현재 WebSocket 문서](https://vercel.com/docs/functions/websockets)를 참고하되, 실제 제공자 분석·SIP·음성은 각각의 실행 근거가 필요하다. 현재 허용된 전용 WSS origin만 CSP에 포함하며 브라우저 보안/TLS 검증을 끄지 않는다.

현재 서버의 API/Witness는 `LISTEN_HOST=127.0.0.1`을 명시해야 한다. 이 값의 기본은 기존 container 배포를 위해 `0.0.0.0`이며 host-mode에서 기본값으로 시작하지 않는다. 실제 listener/port 충돌을 먼저 확인한다. Besu의 고정 peer 준비는 `prepare-besu-peers.ts --apply --host-loopback`을 명시할 때만127.0.0.1의 서로 다른30311~30314를 생성한다. 기존 private-network prefix 검사는 유지한다. 이 준비는 노드 기동이 아니며 P2P의 실제 bind interface와 RPC listen도 별도로 loopback에 고정해야 한다.

일반 Compose는 bridge·published port로 host route/firewall/NAT를 바꿀 수 있다([Docker 설명](https://docs.docker.com/engine/network/packet-filtering-firewalls/)). 현재 개발 서버에는 실행하지 않는다. 기존 proxy 변경·새 tunnel·port publish는 별도 결정 없이 우회 수단으로 사용하지 않는다. 기존 none namespace 시험 helper는 지속 서비스 launcher나 공개 인증 제공자가 아니다.

### 소유 자원과 운영 명령

배포 Compose의 서비스/volume에는 `org.callsign.lifecycle=persistent`와 고유 `org.callsign.deployment-id`를 붙인다. 시험은 별도 run ID/DB/키이며 full runner의 ephemeral label 또는 HTTP의 callsign.test marker를 사용한다. 시험 도구는 persistent label을 거절한다. 실제 운영 중인 환경을 ownership.json에 넣어 시험 cleanup을 적용하지 않는다.

현재 `callsign-demo-live`/`callsign-live-20261105`의 일반 서비스는21개이며 영속 DB·chain·Anchor·IdP를 유지한다. issuer만 독립 갱신했다면 `CALLSIGN_APP_IMAGE`는 나머지 앱의 기존 고정값을 유지하고 `CALLSIGN_ISSUER_IMAGE`에 검토한 issuer 이미지 고정값을 설정한다. Compose와 기존 컨테이너 재시작 검사는 같은 선택 규칙을 사용하며 다른 서비스의 이미지 불일치를 허용하지 않는다. 종료된 `oidc-init`·migration·browser helper는 일반 재시작 대상이 아니다. 현재 감시의 만료는 **2026-11-07 08:37 KST**다. 기존 monitor PID/start·최근 표본·monotonic 만료를 확인하며 새 monitor를 띄워 승인 기간을 연장하지 않는다.

저장소 루트에서 다음 보호 참조를 사용한다. env 내용이나 비밀번호를 출력하지 않는다.

```bash
CFG=.local/persistent-demo-connect-20261105T073906Z/live-20261105/deployment.env
MONITOR_DIR="$(cat .local/current-persistent-resume.path)/monitor"
CALLSIGN_ENV_FILE="$CFG" bash scripts/deployment.sh status
# 읽기 전용 재기동 사전 확인: 실제 동작이나 NEW를 실행하지 않음
CALLSIGN_DEPLOYMENT_TARGET=server CALLSIGN_MONITOR_DIR="$MONITOR_DIR" \
  node scripts/deployment-control.mjs server-check "$CFG" docker compose
# 진행 통화/시험을 종료한 뒤 실행. 같은 container ID와 영속 상태만 재사용
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure CALLSIGN_DEPLOYMENT_TARGET=server \
  CALLSIGN_MONITOR_DIR="$MONITOR_DIR" CALLSIGN_ENV_FILE="$CFG" bash scripts/deployment.sh start
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure CALLSIGN_DEPLOYMENT_TARGET=server \
  CALLSIGN_MONITOR_DIR="$MONITOR_DIR" CALLSIGN_ENV_FILE="$CFG" bash scripts/deployment.sh restart
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure CALLSIGN_ENV_FILE="$CFG" bash scripts/deployment.sh stop
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure CALLSIGN_ENV_FILE="$CFG" bash scripts/deployment.sh resource-stop
```

서버 start/restart는 이미 생성된21개 full ID의 소유권·고정 image·host network/미게시 port·강제 memory/swap 한도·restart=no와 정상 entrypoint를 확인한다. 활성 시험/초기화가 있거나 시작 여유32GiB·유효한 기존 monitor·미검토 중단 경계를 만족하지 못하면 실행하지 않는다. DB/Besu → IdP/Anchor → Witness/PBX/TURN → API/worker/ingress 순서로 시작하고 설정된 Docker health를 기다린다. 초기화·import·migration·seed·Compose up/build/pull은 실행하지 않는다. 부분 실패는 소유 profile을 중지하고 보호 `server-operation-*.json`·`.result.json`에 최초 단계/결과를 남기며 자동 재시도하지 않는다. STARTED는 컨테이너 기동 결과이므로 `/readiness`·공개 로그인·실제 통화는 별도로 확인한다. 2026-11-06 동일 소유 환경의 일반 restart에서 영속 상태·계정·영수증 보존과 readiness를 확인했으며 [현재 현황](FINALS-IMPLEMENTATION-PLAN.md#현재-상태와-다음-단계)을 따른다.

기본 bridge/published-port Compose의 개발 서버 start/restart 차단과 기존 AWS guard는 유지한다. 서버 모드는 새 환경의 NEW나 삭제된 컨테이너 재생성 도구가 아니다. 만료/자원 중단 뒤에는 원본 stop·review를 보존하고 해당 중단에 대한 새 명시적 승인을 받은 뒤에만 기존 `deployment-control.mjs review`를 사용한다. 정상 restart에서 review를 새로 만들거나 latch를 지우지 않는다. 실제 제공자를 켜는 서버 설정에는 승인된 유한 `CALLSIGN_ANALYSIS_SMOKE_BUDGET`의 정확한 id·만료·STT초·연결수·LLM요청수와 issuer의 동일 설정이 필요하다. launcher는 해당 image config ID의 `org.callsign.analysis-smoke-budget=v1`을 image inspect로 확인하므로 container label만 추가하거나 이 guard를 모르는 과거 runtime에 env만 붙여 활성화할 수 없다. 키 존재만으로 활성화하지 않는다.

status는 역할·deployment label이 맞는 서비스 ID/state/health만 출력한다. health와 전체 readiness는 다르며 monitor 생존을 증명하지 않는다. stop은 검사한 full container ID로 앱/worker/미디어를 먼저, DB/chain을 뒤에 중지하고 volume·키·genesis를 삭제하지 않는다. resource-stop은 보호 설정 디렉터리의 resource-stop.json을 먼저 보존하고 동일하게 중지한다. start/restart는 이 latch가 있으면 거절한다. stop/status는 latch 뒤에도 가능하다. 도구에 자동 latch 삭제·seed·NEW·prune는 없다. 서버 restart는 검토한 같은 이미지/영속 상태와 기존 감시 만료를 사용하며 초기화하지 않는다.

Compose 로그는 각 실행 overlay의 json-file 크기/개수 제한을 유지한다. 지속 감시는 위24시간 승인 안에서만 사용하며 준비 시간을 포함해 더 일찍 만료될 수 있다. 정상 종료 중 사라진 cgroup은 같은 full container ID의 종료와 OOM/강제 한도를 Docker에서 재확인할 때만0으로 집계한다. 실행 중 관측 누락·권한 오류·identity 변경은 중단 사유다. 시험90분을 무기한 운영 허가로 해석하거나 restart policy로 자원 중단을 무력화하지 않는다.

### Deepgram 한국어 + OpenAI 분석의 보호 입력

STT는 기존 Deepgram stream의 language=ko를 유지한다. 실제 `/service` 분석은 CALLSIGN_ANALYSIS_PROVIDER=openai와 OPENAI_MODEL을 명시한다. OPENAI_API_KEY_FILE·DEEPGRAM_API_KEY_FILE은 서버만 읽는 현재 UID 소유 일반 파일0600이어야 하고 심볼릭 링크·공개 권한·값과 파일 동시 지정은 거절한다. 키를 process.env에 다시 복사하거나 브라우저로 보내지 않는다.

선택 overlay `infra/deploy/compose.providers.yml`은 두 보호 파일만 issuer에 read-only mount한다. CALLSIGN_PROVIDER_CONFIG=deepgram-openai를 보호 CFG에서 명시해야 deployment.sh가 연결한다. 기본 none은 mount하지 않는다. 모델은 OPENAI_MODEL·DEEPGRAM_MODEL로 별도 지정하며 API 키의 존재를 운영 비용 승인으로 간주하지 않는다. 기존 Anthropic 경로는 명시/기존 설정에서만 유지하고 OpenAI 오류의 자동 fallback으로 사용하지 않는다.

서비스 분석 모델은 OpenAI gpt-5.4-mini-2026-03-17(Responses JSON schema, reasoning none, 출력700토큰)과 Deepgram nova-3/ko다. Codex 개발 도구와 별개다. 첫 smoke의 총$0.10·LLM 최대6요청·STT2연결×30초·재시도0 계획만 승인됐다([OpenAI 가격](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Deepgram 가격](https://deepgram.com/pricing)). 현재 첫 계획의 LLM 요청 수는 timeout 포함 소진했다. 동의한 로컬 합성 한국어 음원의 직접 전사도 확인했지만 빈 전사·오인식과 목적 관계 label 불일치가 있어 품질 PASS가 아니다. timeout의 실제 과금은 미확인이며 추정 비용을 청구 상한 보장으로 쓰지 않는다. 최신 사용량·실행 분모는 [후보 기록](../artifacts/product-candidate-20261104.json)의 designHtmlIntegration을 따른다. 지속 서비스의 추가 AI 실행에는 별도 제한 계획이 필요하다. 후속 main `1b11274`는 `CALLSIGN_ANALYSIS_SMOKE_BUDGET`의 만료·STT 연결 수/초·LLM 요청 수를 영속 quota에 연결한다. 이 코드 추가는 새 예산 승인이나 실제 제공자 호출 성공이 아니다. 설정 형식은 같은 소스의 `services/api/src/provider-configuration.ts`와 운영자가 승인한 보호 입력을 대조한다.

평가 CLI는 기존 비용 guard에 CALLSIGN_EVALUATION_MAX_REQUESTS를 추가해6 이하 계획을 선언할 수 있다. provider-smoke는 기존 결과 파일을 호출 전에 거절하고 STT 입력은 설치 ffprobe로30초 이하 단일 오디오인지 검사한다. 도구/동의 입력이 없으면 중단한다. 숫자 선언은 실제 invoice 강제 상한이 아니며 실제 가격·보관/학습 정책·계정 지출 제한은 실행 전 대조한다. OpenAI store:false도 제공자의 모든 보관을 없앤다는 보장이 아니다.

정책 결합·정정된 근거·동의/epoch/binding·timeout·취소·quota는 공통 orchestration을 유지한다. 거절/불완전 출력/제공자 실패는 분석 불가이며 기존 규칙 경고를 지우거나 안전 판정으로 바꾸지 않는다. 정상 서비스가 합성 제공자를 자동 선택하지 않는다.

### AWS로 전환할 때

이 절차는 과거 준비 내용으로 보존하며 현재 서버컴 지속 데모의 실행·완료 범위에는 포함하지 않는다.

같은 제품 이미지에 공개 주소·OIDC·TLS·영속 mount·보호 provider 파일만 환경별로 공급한다. 새 identity NEW는 새 키/genesis/기관/trust/웹을 생성한다. 기존 상태 이전은 source drain/fence → 일관된 암호화 백업 → source writer 중지 확인 → 별도 target RESTORE/현재 독립 Anchor 대조 → 새 외부 endpoint/trust 검증 → 사용자 전환 순서다. 같은 identity의 source와 target을 동시에 쓰기 상태로 열지 않는다. 되돌리기도 최신 journal/Anchor 일치와 단일 writer를 확인한 뒤 수행하며 과거 백업으로 gate를 초기화하지 않는다.

### RESTORE 도구의 native 실행 조건

복원 CLI는 Node 외에 동일 배포의 `pg_dump`/`pg_restore`와 GNU tar를 요구한다. 이번 소유 리허설은 고정 PostgreSQL 이미지의 native client에 정확한 runtime의 Node·GNU loader/라이브러리·GNU tar를 연결하고 현재 UID/GID로 실행했다. Alpine의 musl·BusyBox tar로 조용히 대체하지 않는다. 도구 자체 확인은 drain 전에 수행하고, 보호 출력0600·원본 fence·독립 Anchor를 유지한다. host 패키지 설치나 전역 라이브러리 변경은 하지 않는다. 실제 chain RPC는 해당 validator의 검증된 loopback 설정을 사용하며8545로 가정하지 않는다.

## 문서 사용 순서

| 목적 | 시작 위치 |
|---|---|
| 실제 제품 역할별 사용 | [기관·상담원·수신자 순서](#2026-11-04-제품-경로-실행의-한정-승인) |
| AWS에서 자료 수령 | [고정 Release·GHCR 참조와 인증](#github-delivery-20261102) |
| 신규/기존 환경 구별 | [NEW 초기화](#new-초기-배포-순서), [재개·RESTORE](#재시작실패-재개기존-배포-restore) |
| 서비스 기동 없는 개발 검사 | [실행 범주](#실행-범주), [단계별 판정](#단계별-검증과-판정) |
| 백업·복구 | [쓰기 drain·별도 cluster 복원](#쓰기-중-백업-준비와-별도-cluster-복원) |

하단의 날짜별 로컬 시험 절차는 해당 환경·실행 허가를 전제로 하는 재현 자료입니다. `.local`·과거 절대 경로는 AWS runtime 의존성으로 옮기지 않습니다. AWS 담당자는 상단의 수령/NEW/재개 절차를 사용하고, 현재 실행 범위는 [AGENTS](../AGENTS.md)와 사용자 지시를 따릅니다. 배포 기준 Release와 과거 명령의 시험 버전을 혼동하지 않습니다.

<a id="aws-competition"></a>

## AWS 대회 배포: 개발 서버와 완전히 분리

이 절은 보존 중인 AWS 이전 절차다. 현재 목표는 서버컴의 지속 데모이며 AWS 생성·이전은 실행하지 않는다. 아래2026-11-02 결정과 발행 당시 상태를 현재 서버 운영 지시로 해석하지 않는다.

**2026-11-02 변경 결정:** 개발 서버는 코드·빌드·검증용이다. 대회 때는 종료되거나 접근 불가여도 되어야 한다. 최종 대상은 AWS이며 GCP 구성은 과거 보존물이다. 이전 절차가 모든 시험 데이터를 이전하라는 뜻은 아니다. 현재 보존하기로 정한 대회 identity는 없으며, 폐기한 시험 chain/DB/Anchor를 대회 환경에 이어 붙이지 않는다.

<a id="github-delivery-20261102"></a>

### GitHub 보관·전달 경로

현재 후보의 실제 판정·source/digest·공개 checksum·원격 수령은 [단일 후보 기록](../artifacts/product-candidate-20261104.json)의 serviceHardeningFollowup을 우선한다. [선택 전체 RESTORE/미디어](../artifacts/restore-audit-20261105.json)의 후속 결과와 이전 Release의 발행 당시 BLOCKED를 구분한다. 아래 이전 후보/태그는 원본 이력이며 덮어쓰지 않는다.


최종 경로는 **Git 저장소(소스·도구) → GitHub Releases(공개 배포 파일) → 비공개 GHCR(서비스 이미지)**다. 개발 서버는 대회에서 사용하지 않는다. 대용량 image tar·운영/시험 보호 입력은 Git 또는 공개 Release에 넣지 않는다. 새 대회 identity/키/genesis/계약/기관/합성 계정은 AWS의 NEW 절차로 생성한다.

- 2026-11-05 첨부 디자인/분석 **준비 후보**: `aws-demo-design-preparation-20261105t111610z`. 새 runtime의 비공개 게시·원격 수령을 확인했다. 전체 통화는 시작40GiB 조건 미달로 자원 생성 전 차단됐으며 공개 인증/미디어는 미연결이다. Release 발행·첨부물 수령 상태는 [후보 기록](../artifacts/product-candidate-20261104.json)의 designHtmlIntegration을 확인한다. 아래 수령 예시는 이 준비 후보이며 이전 이미지의 통합 PASS를 전용하지 않는다.
- 이전 실제 서비스/복원 검증 후보: [aws-restore-candidate-20261104t180638z](https://github.com/0u-Y/CallSign/releases/tag/aws-restore-candidate-20261104t180638z). runtime은 새 제품 종료 수정과 UI를 포함하고, 전체 RESTORE·별도 합성 분석 경로의 실제 검증은 위 후속 기록을 따른다. 비공개 GHCR와 공개5파일 게시·실제 원격 재수령을 완료했다. 정확한 source/digest·checksum은 단일 후보 기록의 serviceHardeningFollowup에서 확인한다.
- 이전 감사/복원 도구 사전 후보: [aws-recovery-tools-20261104t154909z](https://github.com/0u-Y/CallSign/releases/tag/aws-recovery-tools-20261104t154909z). [후보 기록의 recoveryTools](../artifacts/product-candidate-20261104.json)에서 같은 runtime digest·새 observer/비용 검사 도구·공개5파일 수령을 확인한다. 원본 DB 감사와 정상5회는 PASS이나 전체 RESTORE는 도구 수정 후 자원 중단으로 BLOCKED다. 기존 runtime 안의 이전 평가 CLI에는 새 숫자 비용 검사가 없으므로 해당 평가에는 새 observer CLI를 사용한다.
- 이전 선택 통화 검증 사전 후보: [aws-media-candidate-20261104t142900z](https://github.com/0u-Y/CallSign/releases/tag/aws-media-candidate-20261104t142900z). 소스·실제 manifest digest·아키텍처·공개 checksum·원격 수령은 [단일 후보 기록](../artifacts/product-candidate-20261104.json)과 Release의 `images.json`을 따른다. 로컬 config ID를 registry digest로 쓰지 않는다.
- 같은 runtime으로 [후속4개 고유 사례](../artifacts/media-final-20261104.json)의 정상 반복·실제 조회 장애 중 종료·업무 취소·기관 정지와 공동 복구를 확인했다. 이전 분석 중단/PBX 종료는 미재현이며 원인 미확정 기록을 유지한다. 이 이전 후보 발행 시점의 미확인 항목은 후속 기록과 구분하며 독립 reader·실제 AI·AWS는 남아 있으므로 **AWS 이전 전 전체 완료가 아니다.**
- runtime source와 공개/observer source는 inventory에서 구분하며 제품 입력 hash 일치를 확인한다. 일반 issuer 명령과 명시적 시험 분석 fixture entrypoint를 분리한다. 실제 AWS web은 여기에 포함하지 않는다.
- runtime은 앞선 부분 후보에서 비공개 GHCR에 게시·새 저장 경로로 원격 수령한 같은 불변 digest다. 후속 검증 때문에 이미지를 재build/재게시/재다운로드하지 않았으며 공개/observer5파일만 새 Release로 원격 재수령했다. 인프라5종도 기존 불변 digest/수령 영수증을 재사용했다. 게시용 PAT의 수령 성공은 독립 AWS reader 검증이 아니며 writer를 AWS에 복사하지 않는다.
- 공개 첨부물은 `deployment-files.tar`, `observer-tests.tar`, `images.json`, `publication-audit.json`, `SHA256SUMS`다. image tar·보호 입력·합성 trust web은 첨부하지 않는다. checksum PASS와 실제 네트워크 수령은 별도 기록한다.
- 기존 [부분 검증 후보](https://github.com/0u-Y/CallSign/releases/tag/aws-product-candidate-20261104t135448z)·[UI 후보](https://github.com/0u-Y/CallSign/releases/tag/aws-ui-candidate-20261104t121056z)·[bootstrap Release](https://github.com/0u-Y/CallSign/releases/tag/aws-bootstrap-20261102t093531z)·원본 실패는 변경하지 않았다. 당시 이미지 게시/기동/미실행 판정은 해당 기록에 남긴다.

**bootstrap 전달과 AWS 배포 완료는 다르다.** 최종 web은 실제 AWS 계약/trust/PBX 인증서 뒤에 runtime+nginx로 생성한다. 실제 AWS·외부 IdP/TLS/NAT/TURN·AI는 미검증이다.

#### 공개 Release 수령

아래는 AWS 또는 새 수령 디렉터리에서 사용하는 다운로드/검사 명령이다. 서비스/노드를 기동하지 않으며 개발 서버 주소를 사용하지 않는다. 현재 공개 repo/Release에는 개인 토큰이 필요 없다. Node22·curl을 준비한 뒤, 기존 디렉터리를 재사용하지 않는다.

```bash
set +x
umask 077
TAG=aws-demo-design-preparation-20261105t111610z
RECEIVED="$(mktemp -d)"
for FILE in deployment-files.tar observer-tests.tar images.json publication-audit.json SHA256SUMS; do
  curl --fail --location --proto '=https' --proto-redir '=https' --max-time 60 \
    --output "$RECEIVED/$FILE" "https://github.com/0u-Y/CallSign/releases/download/$TAG/$FILE"
done
curl --fail --location --proto '=https' --proto-redir '=https' --max-time 60 \
  --output "$RECEIVED/verify-release-files.mjs" \
  "https://raw.githubusercontent.com/0u-Y/CallSign/$TAG/scripts/verify-release-files.mjs"
node "$RECEIVED/verify-release-files.mjs" "$RECEIVED"
```

`verify-release-files.mjs`는 정해진4개 파일의 checksum 집합·크기·일반 파일 여부를 확인하고, 경로 이탈·중복 checksum·symlink·내용 변조를 거절한다. 검증기의 PASS만으로 원격 다운로드를 입증하지 않는다. 실제 네트워크 다운로드 명령/새 디렉터리/수령 bytes/hash를 별도 영수증으로 남긴다. 추출 전에 검사를 마치고, tar entry가 공개 일반 파일/디렉터리인지 확인한다. `images.json`의 bootstrap6종 중 `registryReference`가 null이면 아래 이미지 단계에서 중단한다. 최종 web의 null은 별도 생성 대기 상태다. 개발 서버 tar나 로컬 config ID로 대체하지 않는다.

checksum 파일은 자기 자신을 제외한4개 asset을 기록한다. 아래 검사도 새 디렉터리의 수령 파일에만 수행한다. Python3가 필요하며 내용 추출/실행은 하지 않는다.

```bash
python3 - "$RECEIVED" <<'CHECK_PUBLIC_TARS'
import pathlib, sys, tarfile
root = pathlib.Path(sys.argv[1])
for name in ('deployment-files.tar', 'observer-tests.tar'):
    seen = set()
    with tarfile.open(root / name, 'r:') as archive:
        for entry in archive:
            path = pathlib.PurePosixPath(entry.name)
            if (path.is_absolute() or '..' in path.parts or entry.name in seen
                    or not (entry.isfile() or entry.isdir())):
                raise SystemExit('UNSAFE_PUBLIC_TAR_ENTRY')
            seen.add(entry.name)
print('PASS: relative regular files/directories only; nothing extracted')
CHECK_PUBLIC_TARS
```

2026-11-02 bootstrap의 원격 검증 ref/digest는 당시 inventory로 고정했다. 당시 source는 `b0a5183802dd2c94e86faf9978111b88928d14e3`이며, 이전 null inventory는 덮어쓰지 않았다. 실제 재수령 파일만으로 checksum 검사·새 디렉터리 추출과 기존 경로 거절을 확인했다. [공개 파일의 게시/재수령 영수증](../artifacts/ghcr-delivery-20261102.json)은 source bundle보다 나중에 기록됐으며, bundle 안의 발행 직전 문서를 후속 문서로 덮지 않는다.

#### AWS의 최소권한 인증

현재 개발 PC의 광범위한 GitHub 토큰을 AWS로 복사하지 않는다. 비공개 소스/Release가 필요해지는 경우에는 해당 repo 하나의 **Contents: read-only** fine-grained PAT 또는 read-only deploy key를 사용한다. GHCR은 별도 classic PAT의 `read:packages`와 해당 비공개 package의 read 권한이 필요하다. 게시용 `write:packages`/삭제 권한은 AWS 수령자에게 주지 않는다. classic PAT는 임의 package 하나로 자동 제한되는 토큰이 아니므로, 전용 배포 계정의 package 접근 범위를 함께 제한한다. [GitHub 권한 기준](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages).

보호 token은0600 파일/승인된 secret 참조로 공급한다. 원문을 CLI 인자·shell history·로그·문서에 넣지 않으며 `set -x`·전체 env 출력은 금지한다. private repo 수령에 gh CLI를 사용할 때는 다음처럼 token을 자식 환경에만 제공하고 결과 파일만 저장할 수 있다. 보호 파일 경로·고유 tag·새 수령 경로만 환경으로 전달한다.

```python
import os, pathlib, subprocess
source = pathlib.Path(os.environ['CALLSIGN_GITHUB_READ_TOKEN_FILE'])
if source.is_symlink() or source.stat().st_mode & 0o077:
    raise SystemExit('PROTECTED_TOKEN_FILE_REQUIRED')
child_env = {**os.environ, 'GH_TOKEN': source.read_text().strip()}
subprocess.run(['gh', 'release', 'download', os.environ['CALLSIGN_RELEASE_TAG'],
                '--repo', '0u-Y/CallSign', '--dir', os.environ['CALLSIGN_NEW_DOWNLOAD_DIR'],
                '--pattern', 'deployment-files.tar', '--pattern', 'observer-tests.tar',
                '--pattern', 'images.json', '--pattern', 'publication-audit.json',
                '--pattern', 'SHA256SUMS'], env=child_env, check=True)
```

GHCR 수령에는 AWS의 **새 전용** Docker 인증 디렉터리만 사용한다. 아래는 AWS용 명령이며 현재 서버에서 실행하지 않았다. 앞서 받은 공개 파일/checksum/tar entry 검사를 통과한 `RECEIVED`를 사용한다. Node22·Python3·Docker를 새 AWS 호스트에 준비하며 개발 서버 checkout·node_modules·Docker 로그인은 필요 없다.

```bash
set -eu
set +x
umask 077
# GHCR_USER: package read 권한을 받은 배포 계정.
# CALLSIGN_GHCR_READ_TOKEN_FILE: 그 계정의 read:packages PAT를 담은0600 파일.
# 게시자의 writer PAT를 AWS에 복사하지 않는다.
node --input-type=module - "$RECEIVED/images.json" <<'CHECK_BOOTSTRAP' > "$RECEIVED/bootstrap-images.tsv"
import {readFileSync} from 'node:fs';
const inventory=JSON.parse(readFileSync(process.argv[2],'utf8'));
const required=['CALLSIGN_APP_IMAGE','ASTERISK_IMAGE','TURN_IMAGE','BESU_IMAGE','POSTGRES_IMAGE','HTTPS_IMAGE'];
if(inventory.bootstrapComplete!==true)throw new Error('BOOTSTRAP_INCOMPLETE');
for(const key of required){
 const found=inventory.images.filter(image=>image.key===key);
 if(found.length!==1)throw new Error('BOOTSTRAP_IMAGE_NOT_UNIQUE');
 const image=found[0],ref=image.registryReference,digest=image.registryManifestDigest;
 if(image.status!=='PASS'||image.remoteVerified!==true||image.packageVisibility!=='private'
    ||!/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._-]+@sha256:[0-9a-f]{64}$/.test(ref??'')
    ||!ref.endsWith('@'+digest)||!/^sha256:[0-9a-f]{64}$/.test(image.configId??'')
    ||image.os!=='linux'||image.architecture!=='amd64')throw new Error('UNVERIFIED_BOOTSTRAP_IMAGE');
 console.log([key,ref,image.configId].join('\t'));
}
CHECK_BOOTSTRAP
DOCKER_AUTH_DIR="$(mktemp -d)"
cleanup_callsign_auth() {
  rm -f -- "$DOCKER_AUTH_DIR/config.json"
  rmdir -- "$DOCKER_AUTH_DIR"
}
trap cleanup_callsign_auth EXIT
# token 원문은 stdin으로만 전달하고 기존 Docker config/credential helper를 사용하지 않는다.
docker --config "$DOCKER_AUTH_DIR" login ghcr.io --username "$GHCR_USER" \
  --password-stdin < "$CALLSIGN_GHCR_READ_TOKEN_FILE"
while IFS="$(printf '\t')" read -r IMAGE_KEY REF CONFIG_ID; do
  docker --config "$DOCKER_AUTH_DIR" pull --platform linux/amd64 "$REF"
  ACTUAL="$(docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$REF")"
  test "$ACTUAL" = "$CONFIG_ID linux/amd64" || exit 1
done < "$RECEIVED/bootstrap-images.tsv"
```

Docker pull는 digest에 고정된 manifest/config/layer를 검증하고 새 AWS 호스트에 저장한다. 위 로컬 게시 검증은 Docker cache와 분리한 raw HTTPS blob 다운로드였다. AWS에서의 실제 pull·실행·별도 reader 자격 확인은 다음 실행이다. null ref·미검증 이미지·private 읽기 권한 없음·hash/architecture 불일치는 중단 조건이다. 실패하면 현재 수령 디렉터리/로그를 보존하고 원인을 확인하며 과거 null inventory나 개발 서버 tar로 대체하지 않는다. 임시 인증 디렉터리만 회수하고 원본 token 파일은 삭제하지 않는다.

AWS runtime preflight는6개 bootstrap 참조에 GHCR manifest digest를 요구한다. 실제 trust/인증서 준비 후 AWS에서 생성하는 web만 검토한 local config ID를 사용할 수 있다. 웹은 Release의 공개 recipe와 GHCR runtime/nginx를 사용하고 pin/label·실제 기동을 확인한다. **bootstrap6종의 전달은 검증했으나, web 생성·실제 외부 설정·AWS 실행은 아직 완료하지 않았다.** [공식 인증/visibility 기준](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [package 권한](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

**소스와 산출물 대응:** 새 제출 후보는 검증한 runtime 제품 source와 이후 문서/증거 commit을 분리해 inventory에 기록한다. 공개/observer는 같은 후보와 호환되는 파일만 포함하며 실제 파일 hash를 대조한다. 변경 없는5종 인프라 이미지는 재사용한다. 최종 AWS web은 실제 metadata/trust/PBX 인증서가 준비된 뒤 생성한다. 과거 Release의 수정 누락/미게시 이력은 [원본 진행 기록](archive/DEVELOPMENT-HISTORY-20261104.md)에 보존한다.

<a id="mentoring-fourth-validation"></a>

## 기관 운영·목적 분석·통화별 측정의 실행 전 조건

현재 `/service` 제품만 해당한다. `/finals`의 구간별 분석·초기 시연 결과를 이 계약으로 바꿔 읽지 않는다. 운영자는 `contact.manage`로 `/v3/management/recalls?intentId=...`를 조회한다. 실제 PG 경로는 같은 읽기 snapshot의 기관/별도 audit/outbox를 사용한다. 업무/시도100개·변경50개·정책 제안20개로 제한하며, 목록 밖/과거 이력은 완료로 추정하지 않는다. `0010_operation_lookup_indexes`는 기관별 조회 index이며 격리 DB의 migration/조회 회귀에서 적용을 확인했다. 대규모 데이터의 성능 개선 수치는 측정하지 않았다. 기존 배포는 승인된 drain/백업·migration 창에서 적용해야 한다.

회수 화면의 요청·원장 작업 pending/failed/확정 receipt·서버 종료·PBX 요청/retry/부재 관측은 서로 다른 상태다. 원장 receipt만으로 Witness 반영이나 새 정책 활성화를 뜻하지 않는다. PBX 완료는 ARI DELETE와 GET404 확인이며 **실제 상대 음성 중단은 별도 관측**이다. 조회 실패·화면 숨김·오래된 snapshot은 현재 성공값으로 유지하지 않는다. 응답의 checkedAt은 DB 관측, mediaObservation.observedAt은 마지막 교환기 관측이며 현재 음성의 신뢰 증명이 아니다.

### 승인 정책 기반 분석과 평가

새 observer의 평가 CLI를 runtime 이미지의 설치 의존성과 함께 사용할 수 있다. 아래는 서비스/외부 제공자를 실행하지 않는 **무네트워크 dry-run 예시**이며 현재 자원 중단 후 실행한 명령이 아니다. 소유 컨테이너 실행 승인과 자원 정책을 먼저 확인한다. `OBSERVER`는 검증한 observer tar를 추출한 새 경로, `EVAL_OUTPUT`은 UID1000이 쓸 수 있는 새 보호 경로다.

```bash
APP_WORK="$(docker image inspect --format '{{.Config.WorkingDir}}' "$CALLSIGN_APP_IMAGE")"
docker run --rm --pull=never --network none --memory 512m --memory-swap 512m --cpus 1 \
  --user 1000:1000 --entrypoint node \
  --mount "type=bind,src=$OBSERVER/scripts/evaluate-service-analysis.ts,dst=$APP_WORK/scripts/evaluate-service-analysis.ts,readonly" \
  --mount "type=bind,src=$OBSERVER/tests/fixtures/service-purpose-evaluation.json,dst=/run/fixture.json,readonly" \
  --mount "type=bind,src=$EVAL_OUTPUT,dst=/run/results" \
  "$CALLSIGN_APP_IMAGE" --import tsx scripts/evaluate-service-analysis.ts \
  /run/fixture.json /run/results/NEW-EVALUATION.json
```

실제 `--provider`는 별도 승인된 outbound 실행 문맥·보호 env 파일·모델/가격/예산·동의한 입력이 준비된 뒤에만 선택한다. 위 dry-run의 `NOT_RUN`을 실제 제공자 평가로 바꾸지 않는다.

실제 텍스트 평가 `--provider`는 자격·동의 확인 외에 `CALLSIGN_EVALUATION_MAX_COST_USD`와 `CALLSIGN_EVALUATION_REQUEST_BOUND_USD`를 요구한다. 선택 사례 수×운영자가 검증한 요청당 최대 비용 가정이 예산을 넘으면 첫 호출 전에 차단한다. 이는 모델 가격을 자동 검증하거나 실제 청구를 제한하는 기능이 아니므로 현재 모델/가격·제공자 지출 제한을 별도로 확인한다. 실패/timeout도 예약 최대 비용에 남기며 실제 청구액은 확인 전 `NOT_MEASURED`다. 새 서비스/복원 후보의 runtime과 observer에는 숫자 비용 선검사가 모두 포함된다. 이전 runtime의 더 오래된 CLI를 이 후보의 도구로 간주하지 않는다.

서버는 분석 시작 시 기관/업무/서명된 승인/VC/lease의 정책 hash를 대조하고 통화 session·connection generation·consent generation을 고정한다. 현재 정책/세대가 바뀌면 전송과 결과 표시를 중단한다. 분석기 `purpose-context-1`은 기관 정책 version/hash와 별개이며 프롬프트 변경만으로 epoch를 올리지 않는다.

최근 확정 상대 발화 최대6개·4000자·60초, 요청 최대20회,250ms coalescing·동시1요청을 사용한다. 한 stream의 서로 다른 segment ID는256개로 제한하며 초과하면 분석 중단을 알리고 새 동의/통화 상태 확인을 요구한다. 기존 통화/사용자/기관/global quota와 제공자4초 timeout도 유지한다. 정책과 문맥 전체 revision/id·event sequence가 맞는 결과만 표시한다. 정정은 이전 근거를 철회하며 제공자 실패 때 규칙 근거와 목적 판단 불가를 함께 표시한다. 목적 이탈 의심은 자동 종료·정지·철회·온체인 변경을 하지 않는다. 원음/문맥은 비영구이며 고객 발화를 추가 수집하지 않는다.

`tests/fixtures/service-purpose-evaluation.json`은 모델이 작성한 합성 텍스트다. development/evaluation을 나눴지만 독립 사람 정답·실음성 품질 평가가 아니다. 초기 dry-run은 제공자를 호출하지 않고 NOT_RUN 보고서만 만든다.

```bash
node --import tsx scripts/evaluate-service-analysis.ts \
  tests/fixtures/service-purpose-evaluation.json NEW-AI-RESULT.json
```

위 명령은 설치된 검증 controller용이다. AWS에서 host node_modules 없이 실행하려면 새 runtime의 내장 scripts/의존성을 쓰고 Release에서 받은 공개 fixture 한 파일과 새 결과 디렉터리만 별도로 mount한다. API 서비스에 host checkout을 mount하지 않는다. 보호 env와 경로는 container 내부 기준이며 network는 승인받은 AWS 평가 egress만 선택한다. 이번에는 container도 실행하지 않았다.

실제 제공자 평가를 승인받은 뒤에만 같은 명령에 `--provider`를 붙인다. 필요한 보호 환경은 선택한 제공자의 `CALLSIGN_ANALYSIS_PROVIDER=openai`·`OPENAI_API_KEY_FILE`·`OPENAI_MODEL` 또는 기존 Anthropic 설정과, `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media`, `CALLSIGN_PROVIDER_CONFIRMATION=CONSENTED-SAMPLE-WITH-BUDGET`와 별도의 `CALLSIGN_PURPOSE_EVALUATION_CONFIRMATION=MAX20-SYNTHETIC-TEXT-REQUESTS`다. 실제 source hash `CALLSIGN_EVALUATION_SOURCE_SHA256`와 image 참조 `CALLSIGN_EVALUATION_IMAGE`도 지정한다. 모델은 운영자가 선택하며20회 이하 순차·입력4000자·각4초·재시도 없음이다. 실제 가격/청구·보관 조건은 별도 검토한다. 기존 output은 호출 전에 거절한다.

출력은 위험 요구 오경고/누락, 목적 이탈 오경고/누락, 판단 불가·제공자 불가·미실행을 분리한다. 문맥 부족 정답에 근거 없는 확답은 unsupportedPurposeJudgments로 별도 계산한다. 제공자 응답을 fixture로 대체한 결과는 SYNTHETIC이고 실제 LLM 정확도 PASS가 아니다. 출력에는 원음/전사/키/토큰을 넣지 않으며 실제 source/image identity는 별도 릴리스 영수증과 대조한다.

### 통화 한 건과 제한된 정상 반복

프로세스 누적 `Measurements`와 `/v3/measurements`의 브라우저 duration은 유지한다. UI commit 구간을 전체 대기 시간으로 사용하지 않는다. `scripts/evaluate-performance.ts`의 CallObserver/aggregateCallTrials는 논리적 시도와 재시도를 구별하고 실패·timeout·미완료·미시작을 모두 분모에 남긴다. 원장 확정·서버 적용·UI 반영·음성 회수, AI 입력·전사·분석·경고의 구간은 **같은 시험 controller가 실제로 관측한 이벤트만** 기록한다. 없는/역순 구간은 null이며0이나 성공으로 채우지 않는다. receipt나 UI를 음성 관측으로 대신하지 않는다.

`infra/deploy/call-trials.example.json`의 빈 sourceSha256/images는 의도적으로 차단된다. 검증된 inventory/source hash·test: 배포 ID, local/aws, direct/turn, fixture 범위를 채워 새 보호 plan으로 저장한다. 이 메타데이터는 운영자 선언이며 실제 원격 digest와 환경 identity는 별도 증거로 대조한다. 기본 명령은 NOT_RUN 결과만 만든다.

```bash
node --import tsx scripts/call-trials.ts REVIEWED-PLAN.json NEW-CALL-RESULT.json
# 별도 media 실행 허가와 준비된 시험 환경에서만:
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media \
CALLSIGN_TRIAL_CONFIRMATION=BOUNDED-SYNTHETIC-CALLS \
  node --import tsx scripts/call-trials.ts REVIEWED-PLAN.json NEW-CALL-RESULT.json --run
```

실제 runner는 기존 `tests/media/service-pbx.spec.ts`만 실행하며 서비스 시작 hook이 없다. controller에 Node/pnpm 의존성과 설치 Chromium, 해당 TLS 신뢰가 필요하다. 자동 설치·인증서 오류 전체 무시를 하지 않는다. 새 runtime의 도구와 observer-tests의 시험 파일/Playwright config를 쓰며 서비스 container에는 host 소스/node_modules를 mount하지 않는다. controller용 코드/브라우저/시험 자격은 runtime 의존성과 구분한다.

필수 환경은 기존 CALLSIGN_MEDIA_ORIGIN/GATEWAY_STORAGE/RECIPIENT_STORAGE/INTENT_ID/CREDENTIAL_DIGEST, CALLSIGN_VALIDATION_DEPLOYMENT_ID/TRUST_PIN과 합성 `CALLSIGN_MEDIA_SENDER_WAV`(660Hz)·`CALLSIGN_MEDIA_RECIPIENT_WAV`(990Hz)다. 파일은 서로 달라야 하며 사람의 마이크를 사용하지 않는다. 선택 설치 경로는 `CALLSIGN_BROWSER_PATH`다. normal 반복은 로그아웃 대신 통화 종료로 세션을 유지한다. 기본 독립 미디어 회귀는 기존 로그아웃 경계를 유지한다.

성공 조건은 유효 승인/연결 검증 표시와 **양쪽에서 서로 다른 상대 음원을 실제 디코딩**하고 종료/정리를 관측하는 것이다. direct/turn의 실제 선택 candidate를 검사한다. 계획은 최대10논리 시도·재시도 최대1회·각120초·전체10분 이하다. 재시도는 명시된 예산에서만 하며 회수 확인이 없으면 후속 호출을 중단하고 나머지는 incomplete로 남긴다. runner timeout은 자신이 만든 자식 process group만 종료한다. 실제 서비스/DB/PBX는 operator가 소유 identity로 준비하고 해당 자원 정리는 기존 RUNBOOK을 따른다. 자동 drain/서비스 삭제는 하지 않는다.

trial별 events/단계 지연/확인 불가 원인·구간, 정상 확인률과 정상 확인+상대 음성 비율을 함께 기록한다. 정상 종료 성공은 회수 관측까지 요구하며, 승인 확인+상대 음성 비율은 회수 실패와 독립적으로 집계한다. 따라서 실제 연결에 성공했어도 정리 실패가 전체 성공으로 숨겨지지 않는다. 같은 unavailable interval의 중복은 합치고 미종료 구간은 해당 시도 종료/제한 시각까지다. 원인별 구간은 겹칠 수 있어 통화 전체 outage 시간으로 단순 합산하지 않는다. 각 try의 한 monotonic observer만 사용하며 서버/browser wall clock을 직접 빼지 않는다. 작은 표본과 브라우저 관측은 SLA가 아니다. 기존100표본 기준의 성능 평가와 분리하며 **새 실제 성공률·지연 기준선은 NOT_RUN**이다.

### 다음 실제 환경 검증의 순서

공개 설정/보호 참조/AWS 자원 산출물/도구 생성값의 기준은 [AWS 입력 계약](#aws-input-contract)이다. 아래는 실행 허가 전 준비표이며 이번에 어느 서비스도 시작하지 않았다.

| 단계 | 입력·실행 범위 | 성공/중단 판정과 증거 |
|---|---|---|
| 1 새 산출물 수령 | 새 고정 Release·6종 digest·별도 reader | checksum/manifest/config/architecture·source 대응. 불일치/권한 부족 중단 |
| 2 AWS NEW | 승인한 리전·예산·mount·키 소유자, 새 identity | 기존 키/genesis/DB 덮어쓰기 거절·실제 단계 상태 확인. 계약 주소/hash/pin은 생성 결과 |
| 3 OIDC/TLS | 실제 issuer/client/audience/callback·인증서·공개 origin | 정확한 로그인/목적 문맥·TLS 검증. fixture를 외부 IdP로 기록 금지 |
| 4 업무·승인·연결 | 실제 기관/담당자·업무/VC/양측 키·고정 trust | 원장/Witness 확인·일회 소비·binding·lease. 미확인/다른 binding 거절 |
| 5 양방향 TURN | PBX/WSS·public/advertised 주소·미디어 port | 선택 relay와 서로 다른 상대 음원 디코딩. 같은 namespace를 외부 NAT 성공으로 해석 금지 |
| 6 정상 반복 | 검토 plan·합성 WAV·시험 계정·controller | 실패/timeout/미시작 포함 분모·각 구간·자원. 무제한 반복/자동 한도 확대 금지 |
| 7 변경·회수 | 취소/정지/정책·키 변경/복구의 기존 경로 | 체인 확정·서버/신규 거절·UI·PBX·양 끝 음성 중단을 별도로 관측 |
| 8 STT/LLM | remote-only 동의·보호 key/model·비용/보관 허가 | 경고·오류·정정·동의 철회/정책 변경의 늦은 결과 폐기. 품질/보관/청구는 별도 |
| 9 재시작/복구 | 최신 독립 Anchor·일관 백업·빈 target·source fence | gate/epoch/소비 이력·세션 폐기 확인. 불완전 자료면 차단 |
| 10 종료/비용 | 생성 resource identity·정리 기록·보존 범위 | 소유 자원만 정리, 외부 비용/키/Anchor 보존 결정. 개발 서버 설정 변경 금지 |

### 새 runtime·공개 묶음 발행 시 확인할 차이

고정 후보와 현재 제품·schema·도구·migration·웹 입력을 비교해 변경한 산출물만 갱신한다. 문서 변경만으로 runtime을 반복 제작하지 않는다. 새 웹은 실제 계약/trust/PBX 인증서가 준비된 뒤 runtime/nginx로 생성하며, 실제 연동 회귀와 소스 대응은 별도 증거로 남긴다.

기존 legacy builder는 `--target` 앞 stage도 실행할 수 있고 `--pull=false`는 없는 FROM 이미지의 수령을 막지 못한다. 오프라인 갱신에는 설치 stage가 없는 `infra/deploy/prepared-runtime.Dockerfile`만 사용하고 base의 실제 로컬 ID를 먼저 확인한다. `--network=none`은 RUN의 네트워크 경계이며 daemon의 image 수령 차단을 대신하지 않는다. 이번 최초 잘못된 경로에서 Node base의 로컬 비압축 image Size227,146,390bytes가 추가됐고(전송 bytes는 미측정) 원본 실패를 보존했다. 이후 후보에는 이 이미지를 사용하지 않으며 확인한 실패 ENV child와 새 Node tag/config는 비강제·no-prune으로 회수했다. [Docker multi-stage 동작](https://docs.docker.com/build/building/multi-stage/#differences-between-legacy-builder-and-buildkit)과 [build 옵션 범위](https://docs.docker.com/reference/cli/docker/image/build/)를 구분한다.

발행 허가 뒤에는 clean source commit→새 runtime build/회귀→layer/history/build context 감사→새 비공개 GHCR tag 게시→실제 manifest/config/layer 재수령→검증한 digest inventory→공개 묶음/checksum·새 고유 Release→새 경로 수령/hash 대조 순서다. 기존 inventory/Release는 편집하지 않는다. 공개 파일 생성은 `pnpm exec tsx scripts/release-manifest.ts --bundle NEW-DIRECTORY --env-file PROTECTED-ENV`이며 실제 image metadata와 clean Git source를 확인한다. 현재 도구는 `docs/LOCAL-VALIDATION.md`를 기본 archive에 포함한다. 수동 tar append로 같은 경로를 중복 추가하지 않는다. 실제 entry 목록·source·checksum/audit를 확인한 뒤 봉인한다. 이 출력은 local metadata용 inventory다. 최종 웹이 없으면 exit2/BLOCKED일 수 있으며 이를 최종 GHCR bootstrap inventory로 게시하지 않는다.6종의 실제 원격 수령·visibility·manifest/config/layer 대조 후 별도의 새 inventory에 고정하고 최종 웹은 deferred로 표시한다. 이어 기존 publication audit/원격 검증 절차를 사용한다. 미준비 이미지/pin으로 inventory의 BLOCKED를 PASS로 바꾸지 않는다. **이번에는 build/push/Release를 실행하지 않았다.**

아래는 **새 발행을 별도 승인받은 작업자만 실행할 명령**이다. NEW_TAG·검토한 기존 runtime 참조·새 output 경로·게시용 보호 파일은 그 작업에서 준비한다. 기존 private package의 visibility를 게시 전후 확인하고 공개 상태이거나 권한이 없으면 중단한다. writer 인증은 AWS reader와 분리하며 이 명령을 이번 작업에서는 실행하지 않았다.

```bash
set -eu
set +x
umask 077
# Clean reviewed checkout; no existing tag/output is reused.
test -z "$(git status --porcelain)"
SOURCE_COMMIT="$(git rev-parse HEAD)"
: "${NEW_TAG:?new unique release version}" "${VERIFIED_RUNTIME_BASE:?reviewed installed dependencies}"
: "${NEW_RUNTIME_ID_FILE:?new path}" "${PUBLISH_DOCKER_CONFIG:?new private auth directory}"
docker build --network=none --pull=false --target prepared-runtime \
  --build-arg PREPARED_RUNTIME_IMAGE="$VERIFIED_RUNTIME_BASE" \
  --build-arg SOURCE_COMMIT="$SOURCE_COMMIT" --iidfile "$NEW_RUNTIME_ID_FILE" \
  -f infra/deploy/prepared-runtime.Dockerfile .
# Apply approved final-image runtime/media regressions before publication; offline build alone is insufficient.
# Inspect history/layers/build inputs; archive and audit output are protected and never Git/Release assets.
docker image save --output "$NEW_RUNTIME_AUDIT_TAR" "$(cat "$NEW_RUNTIME_ID_FILE")"
python3 scripts/audit-image-archive.py "$NEW_RUNTIME_AUDIT_TAR" "$NEW_RUNTIME_AUDIT_RESULT"
# Only after independent review of the audit and current private package visibility:
docker --config "$PUBLISH_DOCKER_CONFIG" login ghcr.io --username "$GHCR_PUBLISH_USER" \
  --password-stdin < "$GHCR_PUBLISH_TOKEN_FILE"
docker image tag "$(cat "$NEW_RUNTIME_ID_FILE")" "ghcr.io/0u-y/callsign-runtime:$NEW_TAG"
docker --config "$PUBLISH_DOCKER_CONFIG" push "ghcr.io/0u-y/callsign-runtime:$NEW_TAG"
# Acquire actual manifest digest, then a fresh remote receiver verifies config/layers/amd64/access.
# Seal the NEW six-image inventory and audit only from those receipts. Never copy PASS flags.
# After checksum/public asset review and remote receipt, create a NEW Release (no --clobber):
gh release create "$NEW_TAG" --prerelease --repo 0u-Y/CallSign --target "$SOURCE_COMMIT" \
  --title "$NEW_TAG" --notes-file "$REVIEWED_RELEASE_NOTES" \
  "$NEW_PUBLIC_BUNDLE/deployment-files.tar" "$NEW_PUBLIC_BUNDLE/observer-tests.tar" \
  "$NEW_PUBLIC_BUNDLE/images.json" "$NEW_PUBLIC_BUNDLE/publication-audit.json" \
  "$NEW_PUBLIC_BUNDLE/SHA256SUMS"
# Download that exact tag into a new directory, run its checksum verifier and compare all six refs.
```



<a id="aws-input-contract"></a>

### AWS 입력 계약: 값의 출처와 필요한 시점

실제 변수명/소비 코드의 기준은 `infra/deploy/aws.env.example`, `anchor.env.example`, `compose*.yml`, `finals-config.ts`, `preflight-aws.ts`와 해당 준비 도구다. 이 표는 AWS 입력 분류의 기준이며, 아래 과거 서버용 입력표를 새 AWS 설정으로 복사하지 않는다. **A** 운영자 결정 공개값, **B** 보호 파일/자격, **C** AWS 자원 준비 후 값, **D** 준비 도구의 생성값, **E** 선택 기능이다. `/srv/...`는 AWS 호스트 경로 제안이고 `/aws`, `/keys`, `/trust`, `/tls`, `/provision`은 개별 container mount 경로다.

| 구분 | 실제 변수/파일 | 소비·첫 필요 단계 | 준비/검증 조건 |
|---|---|---|---|
| A | `CALLSIGN_DEPLOYMENT_TARGET`, `AWS_DEPLOYMENT_MODE`, `PUBLIC_DEPLOYMENT`, `DEMO_MODE` | aws preflight·deployment.sh, 최초 준비 | AWS/new 또는 restore를 명시. 공개 운영은 true/false, 데모 로그인 금지 |
| A | `CALLSIGN_PROJECT`, `DEPLOYMENT_ID`, `INSTITUTION_ID`, `NETWORK_ID` | Compose project·기관/Anchor·genesis·계약/서버, NEW | 새 고유 식별자, 기관 ID≥16자, chain ID는 양의 안전 정수. 기존 배포에서는 보존 |
| A | `ISSUER_URI`, `SERVICE_URI` | prepare-finals keys·Sender·VC/trust, NEW 키 | 실제 등록 HTTPS URI. 기본 경로는 DID 조회 불필요. 예시/예약 도메인 거절 |
| A | `LEDGER_IPV4_PREFIX`, `PBX_PRIVATE_ADDRESS`, `TURN_PRIVATE_ADDRESS` | peer 생성·Compose·prepare-pbx | VPC/bridge 충돌을 AWS에서 검토. 제안 prefix/사설주소를 실제 승인값으로 간주하지 않음 |
| A/C | `AWS_RELEASE_DIR`, `AWS_VOLUME_ROOT`, `FINALS_DATA_DIR`, `AWS_WEB_TLS_DIR`, `CALLSIGN_AWS_MOUNT` | Compose mounts·deployment.sh, NEW | 새 AWS 영속 mount와 소유권. home/tmp/.local 거절; start/restart 전에 실제 mount 검사 |
| A/C | `CALLSIGN_DOMAIN`, `WEB_ORIGIN`, `PBX_PUBLIC_HOST`, `PBX_PUBLIC_ADDRESS`, `SIP_DOMAIN`, `SIP_REALM`, `SIP_WSS_URL`, `TURN_URLS` | nginx·finals config·prepare-pbx·TURN·브라우저, TLS/미디어 | 결정한 DNS와 AWS 공인 IPv4, HTTPS origin에는 path/query 금지. 같은 host의 `wss://HOST/pbx/ws`. 실제 외부 relay는 AWS 실행 검증 필요 |
| A | `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUTHORIZATION_URL`, `OIDC_TOKEN_URL`, `OIDC_CLIENT_ID`, `OFFICIAL_OIDC_CLIENT_ID`, `OIDC_AUDIENCE`, `OFFICIAL_OIDC_AUDIENCE` | OIDC flow·JWT 검증, 계정 등록 전 | 선택 IdP의 공개 설정. public Authorization Code+PKCE, 업무/공식 client와 audience 분리. 두 redirect는 정확히 `WEB_ORIGIN/service`. 실제 IdP 연계는 미검증 |
| B | `FINALS_ACCOUNTS_PATH` | provision-finals의 `/provision/accounts.json`, migration 후 | 보호 JSON 배열의 `id=issuer|검증된 subject`, displayName/role/permissions. 최소 manager·gateway·recipient·approver와 실제 permission 조건. 이메일 자동 연결/IdP 사용자 생성 아님 |
| B | `MIGRATOR_DB_PASSWORD`, `ISSUER_DB_PASSWORD`, `AUTH_DB_PASSWORD`, `WORKER_DB_PASSWORD`, `PBX_DB_PASSWORD`, `PBX_DB_USER` | PostgreSQL·provision-logins·ODBC, DB 준비 | 서로 다른 최소권한 LOGIN. 비밀번호는 보호 env/stdin만, PBX user는 provisioning 결과와 동일 |
| B | `MIGRATOR_DATABASE_URL`, `ISSUER_DATABASE_URL`, `AUTH_DATABASE_URL`, `WORKER_DATABASE_URL` | migrate/provision·Issuer/auth·worker | host URL과 내부 `postgres:5432`를 구별. 앱을 owner로 실행하지 않음. URL 자체가 보호값 |
| B | `PLATFORM_INTERNAL_TOKEN`, `SENDER_INTERNAL_TOKEN`, `PBX_CREDENTIAL_SECRET`, `TURN_SECRET`, `ARI_PASSWORD`, `ARI_AUTHORIZATION` | 역할간 인증·SIP 자격 암호화·TURN·ARI, 서비스 준비 | 별도 생성한 보호 비밀. 내부 token은≥32자이며 서로 달라야 함. PBX 암호화키는32-byte base64url. ARI_AUTHORIZATION은 설정한 ARI 사용자/비밀번호와 일치하는 Basic 내용이며 공개값 아님 |
| B/C | `SERVICE_EXTRA_CA_PATH`, 웹/PBX/Anchor TLS 파일 | Node·nginx·Asterisk·Anchor, trust 전 | 실제 인증서/SAN/CA. 공개 CA bundle과 개인키 분리. Compose Node CA는 `/tls/extra-ca.pem`, host Node를 쓸 때만 host의 `NODE_EXTRA_CA_CERTS` 별도 지정. 전역 trust 비활성화 금지 |
| B/D | `DEPLOYER_KEY_PATH`, `REGISTRY_ADMIN_KEY_PATH`, `REGISTRY_OPERATOR_KEY_PATH`, `ISSUER_APPROVAL_KEY_PATH`, `SENDER_PRIVATE_KEY_PATH`, `PBX_EVIDENCE_KEY_PATH`, `WITNESS_1_KEY_PATH`~`WITNESS_4_KEY_PATH` | 생성 도구·역할 mounts | 역할별 키는 AWS NEW에서 생성/별도 소유자가 공급. 개인키 파일0600·키 쌍 대조·재생성 금지. container 경로는 Compose가 지정하며 host 경로를 그대로 넣지 않음 |
| A/B | `REGISTRY_APPROVERS`와 승인자별 키 참조 | registry deploy·공동 서명, 계약 준비 | 독립 소유 EVM 승인자3개의 서로 다른0이 아닌 주소. 승인자 개인키는 공유 env/mount에 넣지 않음 |
| D | `DEPLOYER_PUBLIC_ADDRESS`, `REGISTRY_ADMIN_ADDRESS`, `REGISTRY_OPERATOR_ADDRESS`, public-manifest/management-public/network-config/genesis/peer 파일 | prepare-service-network·generate-besu | 생성된 관리 공개값을 검토해 보호 CFG에 반영. genesis에 필요한 가스 allocation 포함. 생성물은 미리 지어 넣는 입력이 아님 |
| D | `EXPECTED_GENESIS_HASH`, `REGISTRY_ARTIFACT_PATH`, `REGISTRY_ARTIFACT_SHA256`, `DEPLOYMENT_WORK_DIR`, `DEPLOYMENT_PATH`, `REGISTRY_ADDRESS`, deployment.json/pending journal | registry-deployer·Witness·trust | 고정 공개 artifact bytes의 hash와4노드 identity를 검토. 계약 주소/code hash/receipt/높이는 실제 배포 산출물. `.pending.json`을 보존해 같은 tx hash로 결과 조회 |
| D | `CALLSIGN_APP_IMAGE`, `BESU_IMAGE`, `POSTGRES_IMAGE`, `ASTERISK_IMAGE`, `TURN_IMAGE`, `HTTPS_IMAGE` | inventory·Compose·web FROM, 수령 | 새 검증 Release에서 받은 실제 GHCR manifest digest. 로컬 config ID·태그와 구분. AWS NEW가 생성하는 값이 아니라 발행 inventory에서 수령. 새 runtime/묶음 필요 범위는 앞의 전달물 차이를 따름 |
| D | `TRUST_BUNDLE_PATH`, `TRUST_BUNDLE_FILENAME`, `VITE_SERVICE_TRUST_SHA256`, `CALLSIGN_WEB_IMAGE` | prepare-finals trust·web build·Issuer/SDK | 실제 metadata·공개 키·PBX cert와 정책으로 생성. web/서버를 먼저 띄울 필요 없음. 생성한 pin·웹 label/image ID를 검토해 CFG 반영 |
| A | `SERVICE_POLICY_VERSION`, `CALL_LEASE_SECONDS`, `CALL_MAX_SECONDS`, `RETENTION_SECONDS` | trust·runtime policy·worker | 공동 정책 버전/설정 범위와 일치.30초/4시간/7일은 초기 정책값이지 SLA나 법정 보관기간 아님 |
| B/C | `CONSUMPTION_ANCHOR_URL`, `CONSUMPTION_ANCHOR_TOKEN` | Issuer/worker, 최초 checkpoint | 별도 수명 HTTPS Anchor. 아래 Anchor 환경과 deployment/institution/token을 대조. 과거 DB와 함께 Anchor를 되돌리지 않음 |
| B/C | `CALLSIGN_ANCHOR_PROJECT`, `ANCHOR_VOLUME_ROOT`, `ANCHOR_TLS_DIR`, `ANCHOR_OWNER_PASSWORD`, `ANCHOR_APP_PASSWORD`, `ANCHOR_DATABASE_URL`, `ANCHOR_TOKEN`, `DEPLOYMENT_ID`, `INSTITUTION_ID` | anchor.env·별도 Compose·provision-anchor | 별도 AWS 저장소/운영 책임·최소권한 LOGIN. 신규 zero record만 생성; 기존 역할/이력을 재초기화하지 않음 |
| B | `CALLSIGN_GHCR_READ_TOKEN_FILE`, `GHCR_USER` | 이미지 수령만 | 별도 읽기 계정의 classic `read:packages`와6개 private package read 권한. 현재 명시적 경로가 없어 인증만 BLOCKED. writer PAT로 대체하지 않음 |
| E | `DEEPGRAM_API_KEY_FILE`, `DEEPGRAM_MODEL`, `CALLSIGN_ANALYSIS_PROVIDER`, `OPENAI_API_KEY_FILE`, `OPENAI_MODEL` 또는 기존 Anthropic 설정 | 동의 기반 분석/provider 검증 | 실제 선택 제공자의 서버 측 보호 참조. 미설정은 분석 불가이며 기본 통화/기관 승인을 막거나 안전 판정으로 바꾸지 않음. 실호출은 비용·보관 허가 후 |
| E | `BACKUP_ENCRYPTION_KEY_PATH`, `BACKUP_SCOPE`, `CHAIN_SNAPSHOT_ARCHIVE`, `BACKUP_DEPLOYMENT_ENV_PATH`, `RESTORE_DATABASE_URL`, `RESTORE_DATA_DIR`, `RESTORE_BUNDLE` | 승인된 백업/RESTORE만 | NEW와 별개. 보호 key/manifest·파일/이력 검사, 빈 target·현재 독립 Anchor·source fence 필요. 부분 자료로 gate 해제 금지 |

`CALLSIGN_AWS_MOUNT`는 env 파일에서 자동으로 읽지 않으므로 아래 `deployment.sh` 호출처럼 명시적인 실행 환경으로 전달한다.

AWS 호스트의 NEW에는 Docker/Compose≥2.33.1·Bash·Node22.22.2·curl·Python3·tar·mountpoint와 보호 파일/실제 mount가 필요하다. migration/계약/trust 도구와 pnpm 의존성은 runtime 안에 있으며 host checkout/node_modules·Foundry·solc는 NEW의 필수 조건이 아니다. 현재 서버에 도구를 설치하지 않았다. 별도 backup/RESTORE를 실행할 호스트/도구 이미지에는 PostgreSQL17 `pg_dump`/`pg_restore`/`psql`도 필요하며, 그것이 없는 bootstrap 이미지를 완전한 복구 도구로 간주하지 않는다.

수령/추출 후 host의 native TypeScript stripping으로 **이 단계의 공개 설정만** 검사할 수 있다. 값을 출력하지 않으며 AWS 실행 성공을 판정하지 않는다. 초기 chain만 따로 확인할 때는 기존 chain 단계의 더 좁은 선행 조건을 사용한다.

```bash
node --input-type=module - "$CFG" <<'CHECK_AWS_PUBLIC_INPUTS'
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {awsPreflight} from './scripts/preflight-aws.ts';
const env={...parseEnv(readFileSync(process.argv[2],'utf8')),...process.env};
const checks=awsPreflight(env,'prepare',(env.CALLSIGN_FORBIDDEN_HOSTS??'').split(',').filter(Boolean));
console.log(JSON.stringify({scope:'offline-public-inputs-only',checks}));
if(checks.some(c=>c.status==='FAIL'||c.status==='BLOCKED'))process.exit(2);
CHECK_AWS_PUBLIC_INPUTS
```

### 구성안과 선택 대기

기본안은 기존 Compose를 사용하는 **서비스 EC2 한 대 + 별도 Anchor EC2 한 대 + 명시적으로 선택할 외부 OIDC**다. AWS 계정·리전·기간/예산·도메인·IdP는 미정이다. 아래 용량은 idle 관측과 메모리 제한 합계를 참고한 시작 제안이며 실측 최소 사양/peak나 구매 결정이 아니다.

| 대상 | 제안과 영속 경계 |
|---|---|
| 서비스 EC2 | `x86_64`, 8vCPU·32GiB RAM부터 검토. Besu4 각3GiB, Witness4 각512MiB, API3+worker 각512MiB, PG1GiB, PBX/TURN/web/ingress 각512MiB 상한. 동시 CPU quota 합계는 물리 CPU보다 클 수 있으며 부하 여유는 별도 검증 |
| 저장소 | 암호화 EBS gp3 데이터200GiB + OS/이미지용 여유 공간 제안. 실제 image load·chain 증가·로그·백업 임시 공간을 합산해 승인. 데이터 mount `/srv/callsign`, container volume은 그 아래 bind-backed 경로 |
| Anchor EC2 | 별도2vCPU·2GiB RAM·별도 암호화 EBS20GiB 시작 제안. 별도 운영 권한/백업 수명. 서비스 DB snapshot/삭제와 함께 과거로 복원하지 않음 |
| 인증 | 검증된 public Authorization Code + PKCE를 지원하는 외부 OIDC 또는 AWS 안에서 별도 검증한 IdP. 미선택 상태에서 로그인 대체 성공이나 공개 fixture를 제공하지 않음 |
| 독립성 | 한 EC2의 validator4/Witness4는 독립 기관 운영·호스트 장애 내성을 증명하지 않음. 별도 Anchor도 관리 권한·복원 수명이 분리돼야 함 |

AWS [EBS](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volumes.html)는 인스턴스 수명과 분리해 보존할 수 있다. 새 AWS 호스트에서 OS별 mount·새 디렉터리 소유권을 준비하고 `DeleteOnTermination`을 검토한다. 현재 개발 서버의 Docker data-root/mount/권한은 변경하지 않는다. Docker named volume을 EBS로 연결하기 전에 `AWS_VOLUME_ROOT/{postgres,besu1,besu2,besu3,besu4}`를 새로 준비한다. Besu는 실제 이미지 UID에 맞추고 PG는 새 디렉터리 초기화 소유권을 확인한다. **기존 경로에 chown을 반복해 문제를 덮지 않는다.**

[Elastic IP](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html)는 region별 고정 public IPv4이며 사용/미사용 모두 비용이 발생한다. 서비스 EIP를 웹 DNS와 PBX/TURN advertised address에 사용한다. 자동 변경 public IP를 그대로 고정 trust로 취급하지 않는다. Anchor URL은 별도 AWS DNS/주소로 정하고 서비스 EC2에서만 접근하도록 제한한다.

### 공개·내부 네트워크

아래는 **AWS에만 적용할 계획**이다. 이 문서 작성 중 AWS CLI·방화벽·라우팅 명령을 실행하지 않았다. VPC CIDR와 Docker ledger/public CIDR가 겹치지 않는지 AWS에서 다시 확인한다. `10.206.0.0/24`, `10.205.0.0/24`는 제안이며 현재 서버에 적용하지 않는다.

| 서비스 EC2 inbound | 용도 |
|---|---|
| TCP80/443 | 외부 HTTPS ingress·동일 origin `/api/`·`/pbx/ws`;80은443 redirect |
| UDP/TCP3478, TCP5349 | TURN 인증·relay 연결 |
| UDP49160~49200 | TURN relay 범위 |
| UDP10000~10099 | Asterisk DTLS-SRTP/RTP 범위 |
| 관리 접근 | 승인된 운영자 CIDR의 SSH 또는 별도로 준비한 AWS 관리 경로만. 개발 서버 터널 불사용 |

DB5432·RPC8545·P2P30303·Witness4201~4204·API4100~4102·ARI8089·SIP5060은 외부에 열지 않는다. Asterisk WSS는 ingress→web→Asterisk 내부 TLS로 프록시한다. `compose.aws.yml`은 web의 host8080 publish를 제거한다. Anchor 호스트는 TLS443만 서비스 호스트의 AWS private 주소/보안 그룹에 허용하고 DB는 publish하지 않는다. [AWS 보안 그룹](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-connection-tracking.html)은 연결 추적을 사용하므로 외부 UDP와 회수 동작을 실제 클라이언트에서 확인해야 한다. NACL을 별도 제한한다면 반환·ephemeral 경로도 검토한다.

TURN은 container `10.205.0.30`, PBX는 `10.205.0.20`을 제안한다. `prepare-pbx.ts --turn`은 `external-ip=AWS_PUBLIC_IP/TURN_PRIVATE_ADDRESS`를 렌더한다. AWS EIP→호스트 private IP→Docker mapping의 실제 relay candidate·양방향 음원을 외부망에서 검증해야 한다. loopback 시험의 `allow-loopback-peers`를 옮기지 않는다. metadata 주소169.254/16 relay는 거절한다.

AWS preflight는 `--phase aws --step prepare|runtime`으로 실행하며 설정 값 자체를 출력하지 않는다. 이는 AWS 독립성 검사이며 기존 runtime 설정/역할/키/DB 권한 검사나 실제 서비스 검증을 대신하지 않는다. 제공되지 않은 값은 BLOCKED로 유지한다.

### 기준 파일과 전달물

- 공통 구성: `infra/deploy/compose.yml`, `compose.pbx.yml`
- AWS override: `infra/deploy/compose.aws.yml`, `https-nginx.conf`
- 별도 Anchor: `infra/deploy/compose.anchor.yml`, `anchor-schema.sql`, `provision-anchor.sql`
- 채워진 `*.env`/복원 env는 Git·Docker build context에서 제외한다. 실제 보호 파일은 release/source 디렉터리 밖에 두며 공개 예제만 배포 파일에 포함한다.
- 입력: `aws.env.example`, `anchor.env.example`를 보호 파일로 복사해 채운다. 빈 값은 차단이며 실제 주소/키/digest를 지어 넣지 않는다.
- 역할 이미지 **7종**: runtime(API/worker/Witness/Anchor/준비 도구), web, Besu, PostgreSQL(서비스·Anchor), Asterisk, TURN, HTTPS nginx. 외부 OIDC를 선택하지 않으면 IdP 실행물·설정은 별도 미완료다.
- `release-manifest.ts --inventory NEW.json --env-file PROTECTED_ENV`는 실제 local ID/architecture/size를 조사한다. runtime 경로나 CA를 숨겨 mount하지 않고 이미지 안의 설치 의존성을 사용한다. AWS 웹은 현재 trust pin label과 맞지 않으면 BLOCKED다.
- `release-manifest.ts --bundle NEW_DIR --env-file PROTECTED_ENV`는 clean Git의 공개 배포 파일·계약 artifact를 `deployment-files.tar`에 담고 image inventory·`SHA256SUMS`를 새 디렉터리에 저장한다. **image tar/보호 파일/운영 데이터는 넣지 않는다.** BLOCKED inventory가 있는 파일 묶음은 완성된 릴리스가 아니다.

AWS 초기 준비 전달은 runtime·Besu·PostgreSQL·Asterisk·TURN·nginx의 기본 이미지6종과 web build recipe로도 구성할 수 있다. AWS용 web은 실제 인증서/metadata/trust가 나온 후 같은6종 중 runtime+nginx에서 오프라인 생성하는 산출물이다. 이 경우 inventory의 web BLOCKED는 누락을 숨긴 것이 아니라 아직 생성하지 않은 최종 역할이며, 생성·pin 확인 전 서비스 배포 완료로 판정하지 않는다. 외부 IdP는 별도 선택·등록 gate다.

현재 약1.5GB archive의 web은 loopback·합성 trust용이다. AWS 최종 웹이라고 표시하지 않는다. 최초 앱/미디어 이미지의 ID와 새 source 반영 runtime ID는 실행 증거에서 구분한다. Docker config ID·registry manifest digest·archive SHA256은 서로 다른 값이다.

### 개발 서버가 없어도 준비·실행하는 방법

Docker/Compose>=2.33.1·Bash·Node22.22.2(설치 의존성 없는 JSON/env·native type stripping 검사 용도)를 새 AWS 호스트에 별도 승인 후 준비한다. npm/pnpm install·소스 checkout·host node_modules는 배포 실행의 선행 조건이 아니다. TypeScript 준비 도구·설치된 pnpm은 runtime 이미지 안에 있다. 위 GitHub Release의 공개 파일을 검증해 새 release 디렉터리에 풀고, 비공개 GHCR의 실제 manifest digest로6개 bootstrap 이미지를 확보한다. 게시한 private package의 read 권한은 AWS reader에 별도로 부여해야 하며 개발 서버 tar로 우회하지 않는다. 보호 입력은 별도 참조로 공급하고 대회 키/identity는 AWS NEW에서 생성한다. 현재 개발 서버를 다운로드 서버로 사용하지 않는다.

아래는 **실제 AWS 생성·업로드·실행 승인 후** 사용할 명령이며 이번에는 실행하지 않는다. `APP`, `NGINX`, `BESU` 등은 inventory의 검토한 실제 불변 참조, `CFG`는 AWS 보호 env, `DATA_PARENT`는 새 EBS mount다. 보호 env는 Docker `--env-file`에서도 읽히는 단순 `KEY=value` 형식을 쓰며 shell 확장·따옴표 해석에 의존하지 않는다. 값·전체 env·shell trace를 로그에 출력하지 않는다.

```bash
# 앞서 받은 Release checksum/tar entry와 GHCR digest/architecture 검증 후에만 진행한다.
# RECEIVED의 verifier는 같은 GitHub source tag에서 다운로드한 파일이다.
node "$RECEIVED/verify-release-files.mjs" "$RECEIVED"
# NEW_RELEASE_DIR은 아직 존재하지 않는 새 경로다. 기존 경로를 덮어쓰지 않는다.
test ! -e "$NEW_RELEASE_DIR"
mkdir -m 700 -- "$NEW_RELEASE_DIR"
tar -xf "$RECEIVED/deployment-files.tar" -C "$NEW_RELEASE_DIR"
cd "$NEW_RELEASE_DIR"
# APP/BESU/NGINX는 이미 인증된 GHCR에서 digest로 pull한 실제 참조다.
docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$APP" "$BESU" "$NGINX"
# 아래 함수는 소스/host node_modules를 mount하지 않는다. 신규 보호 설정만 /aws로 전달한다.
tool() {
  docker run --rm -i --pull=never --network none --memory 512m --memory-swap 512m --cpus 1 \
    --env-file "$CFG" --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure \
    --mount "type=bind,src=$DATA_PARENT,dst=/aws" \
    "$APP" pnpm exec tsx "$@"
}
# NEW 모드만: /aws/config가 없어야 한다. 기존 대회 배포에는 실행하지 않는다.
tool scripts/prepare-finals.ts keys /aws/config --apply
tool scripts/prepare-finals.ts management-keys /aws/config --apply
# management-public.json의 공개 deployer/admin/stopper 주소만 검토해 CFG에 반영한다.
# 공동 승인자3명의 키는 이 도구가 생성하지 않는다. 각각의 소유자가 별도로 보관/서명한다.
tool scripts/prepare-service-network.ts /aws/network-config.json --apply
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure CALLSIGN_TOOL_IMAGE="$APP" CALLSIGN_ENV_FILE="$CFG" \
  CALLSIGN_NETWORK_CONFIG="$DATA_PARENT/network-config.json" CALLSIGN_BESU_DIR="$DATA_PARENT/config/besu" \
  BESU_IMAGE="$BESU" bash scripts/generate-besu.sh
```

`prepare-finals keys`·`management-keys`는 기존 파일/진행표가 있으면 재생성하지 않고 중단한다. `generate-besu.sh`는 완성된 기존 genesis/키를 재사용하고 peer 내용이 다르면 중단하며 부분 상태를 덮지 않는다. 부분 생성 실패에서는 생성한 키를 보존하고 진행표·파일·공개키를 대조한다. 디렉터리를 지운 뒤 재실행하는 복구는 제공하지 않는다.

최초 genesis allocation에는 배포자뿐 아니라 `REGISTRY_ADMIN_ADDRESS`, `REGISTRY_OPERATOR_ADDRESS`의 합성 가스 잔액을 넣는다. 이들은 실제 금융 자산이 아니다. 주소·관리 키 파일·계약 등록 요청의 administrator/emergencyStopper가 일치해야 한다.

`docker run`/Compose는 로컬 config ID를 받을 수 있지만 Dockerfile `FROM` 빌드 인자는 검토한 `repository@digest` 또는 로컬 태그를 사용한다. `APP_BUILD_REF`·`NGINX_BUILD_REF`를 지정하기 직전 `docker image inspect --format '{{.Id}}' BUILD_REF`가 inventory의 APP/NGINX config ID와 같은지 확인한다. raw `sha256:...`를 FROM 인자로 넣으면 Docker가 `sha256`이라는 repository를 조회할 수 있다. build는 `--pull=false --network=none`으로 실행하고 cache/base가 없으면 다운로드로 우회하지 않는다.

### NEW 초기 배포 순서

1. **identity와 키**: AWS용 고유 project/deployment/institution/network ID, 기관/콜센터 URI를 결정한다. 위 NEW 준비 도구를 실행하고 재실행 거절을 확인한다. approver3명은 별도 소유이며 worker에는 admin/stopper만 mount한다. 운영용 보관 참조와 원본 파일을 암호화해 개발 서버 밖에 보존한다.
2. **체인**: 아래 기존 ‘전체 설정에 묶이지 않는 첫 체인 plan’의 추출 명령에 `-f infra/deploy/compose.pbx.yml -f infra/deploy/compose.aws.yml`을 추가한다. 같은 raw JSON에서 nodes4/chain9를 추출하며 AWS EBS volume/로그 제한을 유지한다. AWS에서만 승인된 bridge를 생성한다. nodes4→실제 높이 전진/동일 높이 hash/chain/genesis 대조→deployer inspect→예상 genesis/artifact hash 검토→계약 deploy 순서다. 기존 pending tx journal은 같은 hash로 재조회하고 새 nonce로 다시 배포하지 않는다.
3. **계약 metadata·Witness**: 배포 결과를 `${FINALS_DATA_DIR}/deployment.json`에 보존한다. Witness4에 동일 metadata·각기 다른 키를 주고 동일 상태·서로 다른3서명·freshness를 검증한다. 미등록 상태 조회와 등록 후 권한 검증을 구분한다. 계약 주소는 배포 산출물이지 사용자가 미리 작성할 값이 아니다.
4. **TLS·PBX/TURN**: 웹에는 public 도메인의 PEM fullchain/privkey를 별도 공급하고, PBX 내부 TLS는 SAN=`asterisk`와 고정 DTLS 인증서·CA를 준비한다. Anchor도 자신의 DNS/SAN·별도 키가 필요하다. 인증서를 서로 다른 호스트의 loopback 이름으로 재사용하지 않는다. `tool scripts/prepare-pbx.ts /aws/config/asterisk --apply`, 아래 TURN 전용 명령으로 공개 template을 명시하여 새 설정을 렌더한 뒤 각 `tls/`에 보호 파일을 배치한다. 웹/Node CA mount를 맞추고 인증서 개인키는 uid1000·0600으로 새 디렉터리에 준비한다. 인증서 교체는 새 trust/web pin과 통화 재검증을 요구한다.
5. **DB**: 서비스 PostgreSQL만 먼저 기동한다. 아래 `dc`에서 operations profile의 migration-runner로 `scripts/migrate-finals.ts --apply`를 실행한다. 소스 hash 검사를 유지하며 `0000`~`0010`을 적용한다. `0010`은 기관별 회수 조회용 index이며 이번에는 적용하지 않았다. postgres container의 psql에 보호 환경으로 별도4비밀번호를 전달하고 `provision-logins.sql`을 stdin으로 적용한다. 앱은 migration owner가 아닌 issuer/auth/worker/PBX의 서로 다른 LOGIN을 사용한다.
6. **독립 Anchor**: 별도 AWS 호스트에서 `compose.anchor.yml`의 anchor-db만 먼저 시작한다. owner psql로 `anchor-schema.sql`, `provision-anchor.sql`을 순서대로 적용한다. 보호 `DEPLOYMENT_ID`·`INSTITUTION_ID`·`ANCHOR_APP_PASSWORD`를 stdin/환경으로 전달한다. 새 zero sequence/hash, epoch1만 최초 INSERT하며 기존 행·LOGIN은 덮지 않는다. 서비스 프로세스는 SELECT/UPDATE만 가능한 별도 LOGIN과 TLS/token을 쓴다. Anchor 서비스 기동 뒤 실제 인증·TLS·CAS/재조회·재시작 보존을 확인한다. 서비스 EC2와 개발 서버 어느 쪽도 Anchor 저장소를 대신하지 않는다.
7. **OIDC·내부 계정**: 선택한 실제 IdP에서 업무/공식 public client와 audience를 분리한다. 현재 코드의 IdP redirect URI는 두 client 모두 정확히 `${WEB_ORIGIN}/service`다. 브라우저가 code/state를 받아 `/api/v3/auth/callback`으로 교환하며 업무/공식 문맥은 state·pending client·세션 purpose로 분리한다. `/api/auth/callback`이나 별도 official callback을 IdP redirect로 등록하지 않는다. issuer\|subject·역할·권한을 `FINALS_ACCOUNTS_PATH`의 보호 JSON으로 준비하고 migration-runner의 `provision-finals.ts /provision/public-manifest.json /provision/accounts.json --apply`로 신규 내부 계정을 등록한다. 외부 계정 생성과 내부 등록은 별개다. 미등록/비활성 계정·auth_time·PKCE·CSRF/세션 문맥을 실제 제공자로 검증한다.
8. **공개 trust·웹**: PBX 공개 인증서와 실제 deployment metadata가 준비된 뒤 trust를 생성한다. 앱의 service trust 경로와 같은 파일을 사용한다. 생성한 canonical pin을 CFG에 반영하고 아래 web build로 새 AWS 웹을 만든다. 기존 loopback 이미지나 API가 준 새 키를 자동 신뢰하지 않는다.
9. **앱·등록·검증**: issuer/sender/platform/worker와 PBX/TURN/ingress를 순서대로 기동한다. 관리 준비와 기관 권한 활성화는 다르다. 실제 담당자 로그인→관리 화면의 최초 등록 제안→서로 다른 승인자2명의 별도 서명→`/v3/management/register`→outbox/원장 확정/Witness/DB confirmed를 확인한다. zero Anchor/journal 대조로 gate가 열리는 실제 경로를 사용하고 SQL로 ready를 설정하지 않는다. 새 업무·위임 등록·개별 승인·양방향 합성 통화·철회 후 실제 음성 중단까지 제품 화면에서 확인한다.

```bash
# AWS 호스트 전용. 새 네트워크/port publish를 개발 서버에서 실행하지 않는다.
dc() {
  docker compose --env-file "$CFG" -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml \
    -f infra/deploy/compose.aws.yml --profile operations --profile https --profile pbx --profile media "$@"
}
dc up -d --no-build --pull never postgres
dc run --rm --no-deps --pull never migration-runner
# DB/공개 manifest/정확한 OIDC 계정 파일 준비 후 한 번만:
dc run --rm --no-deps --pull never migration-runner pnpm exec tsx scripts/provision-finals.ts /provision/public-manifest.json /provision/accounts.json --apply
# Trust 생성은 공개 PBX 인증서가 있어야 함. container 경로를 명시한다.
docker run --rm --pull never --network none --env-file "$CFG" \
  --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure --env PBX_DTLS_CERT_PATH=/aws/config/asterisk/tls/cert.pem \
  --mount "type=bind,src=$DATA_PARENT,dst=/aws" "$APP" \
  pnpm exec tsx scripts/prepare-finals.ts trust /aws/config --apply
# 출력한 실제 pin을 CFG/VITE_SERVICE_TRUST_SHA256에 반영한 뒤 build.
# Raw config IDs are valid for run/load, but FROM needs an existing verified name/digest.
APP_BUILD_REF="$CALLSIGN_PROJECT-prepared:runtime"
NGINX_BUILD_REF="$CALLSIGN_PROJECT-prepared:nginx"
# Create only new task-local aliases. Existing aliases must resolve to the same reviewed config ID.
for pair in "$APP $APP_BUILD_REF" "$NGINX $NGINX_BUILD_REF"; do
  read -r image alias <<< "$pair"
  if docker image inspect "$alias" >/dev/null 2>&1; then
    test "$(docker image inspect --format '{{.Id}}' "$alias")" = "$(docker image inspect --format '{{.Id}}' "$image")" || exit 78
  else
    docker image tag "$image" "$alias"
  fi
done
docker build --network=none --pull=false -f infra/deploy/web.Dockerfile \
  --build-arg PREPARED_RUNTIME_IMAGE="$APP_BUILD_REF" --build-arg NGINX_IMAGE="$NGINX_BUILD_REF" \
  --build-arg VITE_SERVICE_TRUST_SHA256="$REVIEWED_PIN" --iidfile "$NEW_WEB_ID_FILE" .
# 새 웹 ID를 CFG에 반영한다. AWS target에서는 Docker inspect로 ID/architecture/trust label을 직접 대조한다.
# release-manifest inventory/bundle 생성은 Git/설치 도구가 있는 빌드 단계이며 AWS runtime 필수 도구가 아니다.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure CALLSIGN_DEPLOYMENT_TARGET=aws \
  CALLSIGN_AWS_TARGET_CONFIRMATION=AWS-ONLY CALLSIGN_AWS_MOUNT="$DATA_PARENT" CALLSIGN_ENV_FILE="$CFG" \
  bash scripts/deployment.sh start
```

TURN 준비는 전달한 공개 template을 사용한다. coturn4.6.3의 지원 옵션은 `allow-loopback-peers=0`이며 `no-loopback-peers`는 지원 옵션이 아니다. 예전 runtime 이미지의 내장 template을 묵시적으로 사용하지 않도록 해당 파일만 preparation container에 읽기 전용으로 지정한다. 서비스에 소스 checkout을 mount하는 절차가 아니다.

```bash
APP_WORKDIR="$(docker image inspect --format '{{.Config.WorkingDir}}' "$APP")"
test -n "$APP_WORKDIR" || exit 78
docker run --rm --pull never --network none --env-file "$CFG" \
  --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure \
  --mount "type=bind,src=$DATA_PARENT,dst=/aws" \
  --mount "type=bind,src=$PWD/infra/deploy/turnserver.conf.example,dst=$APP_WORKDIR/infra/deploy/turnserver.conf.example,readonly" \
  "$APP" pnpm exec tsx scripts/prepare-pbx.ts /aws/config/turn --turn --apply
```

위 db/contract 시작 명령은 전체 준비를 대신하지 않는다. role 비밀번호·issuer/subject·관리 서명·인증서·EBS mount가 빠지면 해당 단계에서 중단한다. 전제 파일·키/계약을 확인하지 않고 `deployment.sh start`만 실행하는 방식은 제공하지 않는다.

### 준비 checkpoint와 다음 행동

| 완료 증거 | 다음 명령/행동 | 중단 조건 |
|---|---|---|
| config/public-manifest.json + preparation-state complete | `management-keys`, 이어서 공개 주소로 network-config | 기존/부분 파일이면 재생성 금지·보존 후 소유자 검토 |
| genesis/validator4/public peers + 두 시점 RPC 관측 | 기존 chain plan의 deployer inspect/--apply | chain/genesis 불일치·높이 정지·기존 pending 의미 불명 |
| deployment.json의 receipt/code/artifact + Witness3 이상 | PBX 인증서·trust·DB·Anchor 준비 | 서명 부족·stale·다른 snapshot·계약 code 불일치 |
| PG migration source hash + 서로 다른4 LOGIN | internal account provision | 다른 역할 DB 접근 가능·미적용 migration·과도한 권한 |
| 별도 Anchor의 인증 조회·CAS·재시작 보존 | 실제 IdP 로그인·관리 등록 | token/TLS 오류·DB/journal과 불일치; ready SQL 우회 금지 |
| management registration=confirmed + worker/Witness 반영 | 업무→승인→양방향 음원→철회 | pending/unknown/failed를 active로 취급 금지 |
| 양쪽 원격 음원 디코딩·회수 후 무음·실제 외부 relay | 대회 공개 사용 검토 | UI문구/HTTP200/패킷 증가만으로 합격 금지 |

DB LOGIN 적용은 준비한 PG container ID가 현재 AWS project 소유인지 먼저 확인한다. `DB_ROLE_ENV`는4개 DB 비밀번호만, `ANCHOR_PROVISION_ENV`는 신규 deployment/institution/app-password만 담는0600 파일이다. 전체 운영 env를 psql에 넘기거나 비밀번호를 `-v`/URL argv로 출력하지 않는다.

```bash
# Future AWS target only. IDs below come from this reviewed Compose project, never another DB.
PG_ID="$(dc ps -q postgres)"
docker exec -i --env-file "$DB_ROLE_ENV" "$PG_ID" \
  psql -X -v ON_ERROR_STOP=1 -U callsign_migrator -d callsign < infra/deploy/provision-logins.sql
# On the SEPARATE Anchor host, with its own env/project:
ac() { docker compose --env-file "$ANCHOR_ENV" -f infra/deploy/compose.anchor.yml "$@"; }
ac up -d --no-build --pull never anchor-db
ANCHOR_DB_ID="$(ac ps -q anchor-db)"
docker exec -i "$ANCHOR_DB_ID" psql -X -v ON_ERROR_STOP=1 -U anchor_owner -d callsign_anchor < infra/deploy/anchor-schema.sql
docker exec -i --env-file "$ANCHOR_PROVISION_ENV" "$ANCHOR_DB_ID" \
  psql -X -v ON_ERROR_STOP=1 -U anchor_owner -d callsign_anchor < infra/deploy/provision-anchor.sql
ac up -d --no-build --pull never anchor
# Later ordinary stop preserves volumes. Review drain/backup before stopping a live service.
ac stop
```

Readiness는 실제 issuer의 `/readiness`, 관리 상태는 인증된 `/api/v3/management`와 `/api/v3/management/health`, 업무/통화는 제품 화면에서 확인한다. issuer readiness가200이어도 미등록 기관의 연락 승인이 활성이라는 뜻이 아니다. 운영자의 보호된 관측에서 registration confirmed·기관 epoch·recovery gate·worker jobs·동일 Witness 상태를 함께 확인해야 한다. timeout/조회 장애는 합격이 아니라 차단/미판정이다. 이 표의 단계별 검증을 완료하기 전 ‘대회 배포 완료’라고 발표하지 않는다.

### NEW 중간 실패·응답 유실의 재개 판정

| 중단 위치 | 실제 확인 후 할 일 | 금지 사항 |
|---|---|---|
| keys/management-keys/PBX config의 progress만 있음 | generated private/public 파일·키 쌍·입력/템플릿과 completed 목록을 소유자가 대조. 부분 상태면 수동 검토 | complete flag나 파일 존재만으로 성공 판정·디렉터리 삭제/재생성 |
| network-config/genesis/peers 존재 | 현재 명시한 chain ID·allocation·생성 network hash/peer와4노드 identity를 대조 | 네트워크 변경을 이유로 키/genesis/epoch 초기화 |
| migration 응답 유실 | 같은 source hash로 재실행. 각 DDL과 migration row가 같은 transaction이며 적용 hash가 맞으면 건너뜀 | hash 불일치 무시·DB 초기화 |
| 계약 제출/metadata 기록 전후 | pending raw tx/hash·signer/chain/genesis/data를 보존해 같은 hash로 조회/재전송. 기존 metadata도 현재 code/profile/initialPolicy와3개 승인자 membership 확인 | 새 nonce로 무조건 재배포·metadata complete만 신뢰 |
| DB LOGIN/계정/Anchor provision 응답 유실 | 해당 transaction의 실제 role/GRANT·issuer subject/role·기관·gate·Anchor record를 대조한 뒤 다음 단계로 이동. 불명확하면 중단 | 중복 role/기관 생성 실패를 성공으로 무시·비밀번호나 Anchor zero 자동 재작성 |
| trust/web 일부만 생성 | 해당 metadata·현재 public key·PBX cert·policy와 실제 pin/image label을 비교해 게시 여부 결정 | 오래된 trust를 API 응답 키로 자동 교체·새 pin 없이 재개 |

일반 restart는 초기화/migration/seed를 호출하지 않는다. RESTORE는 인증된 bundle과 빈 target, source 쓰기 차단·최신 Anchor 확인을 요구하며 복원 직후 gate는 닫힌다. 이 표는 정적 코드 대조이며 AWS의 실제 RPC/DB/복원 성공을 뜻하지 않는다.

### 재시작·실패 재개·기존 배포 RESTORE

- 일반 `deployment.sh restart`·EC2 재시작은 키·genesis·계약·seed·migration을 실행하지 않는다. AWS EBS mount 누락 시 deployment.sh가 차단한다. 인스턴스 boot에서는 자동 초기화 대신 먼저 mount/비밀/TLS/metadata를 확인한 뒤 명시적으로 시작한다. Docker 자동 재시작과 mount 순서는 실제 AWS reboot에서 검증해야 하며 검증 전 자동 부팅 완료로 표시하지 않는다.
- migration 재실행은 기존 source hash가 같을 때만 가능하다. 최초 LOGIN/계정/Anchor provision은 기존 상태면 실패한다. 이는 비밀번호 리셋·재초기화 방지다. 진행표/DB migration·등록 상태를 읽고 **미완료 단계만** 이어간다.
- 계약 제출 응답 유실은 `deployment.json.pending.json`의 같은 raw/hash로 재조회한다. 이미 기록된 deployment는 실제 code/genesis/artifact 일치 여부를 확인한 뒤 재사용한다.
- 별도로 보존하기로 결정한 대회 identity가 있을 때만 `AWS_DEPLOYMENT_MODE=restore`를 사용한다. 기존 backup/drain/restore 절차대로 source fence→일관 chain/DB/key/metadata 백업→새 empty target/role 복원→독립 최신 Anchor 대조→세션/진행 통화 폐기→target 단독 활성화한다. NEW 키 생성·zero Anchor provision 명령을 실행하지 않는다. Anchor는 서비스 DB와 함께 과거로 복원하지 않는다.
- 이번에 폐기한 미디어 시험의 잔여 chain/키와 새 AWS DB를 섞지 않는다. 대회 데이터 이전을 결정한 기록이 없다면 NEW가 기본이다.

### 전송·최종 단독 실행 판정·비용 종료

전달 경로는 [고정 GitHub Release·비공개 GHCR 수령 절차](#github-delivery-20261102)를 사용한다. AWS reader 자격으로 공개 묶음/checksum과6종 manifest digest를 검증하고, AWS에서 실제 trust로 최종 웹을 생성한다. 개발 서버의 checkout·Docker 로그인·이미지 제공 주소는 사용하지 않는다. 이번 main 수정이 포함된 새 runtime/공개 묶음이 발행되기 전에는 기존 Release를 수정본으로 간주하지 않는다. 키·채운 env·계정·DB/chain·Anchor 데이터는 공개 첨부물과 분리하며 AWS NEW에서 생성하거나 승인된 기존 identity의 RESTORE 절차로만 공급한다. **이 작업에서는 이미지/Release 게시·AWS 생성·과금·공개 노출을 수행하지 않았다.**

최종 판정은 ①개발 서버 주소/SSH/파일 mount가 runtime에 없음, ②새 AWS metadata/key/genesis/계정 일치, ③실제 외부 TLS/OIDC·두 외부망 TURN/미디어, ④철회/정지의 실제 체인→Witness→PBX/음성 회수, ⑤재시작 뒤 key/data/Anchor 연속성, ⑥개발 서버 없이 archive/보호 참조로 재현을 각각 증거로 남긴다. 코드 검사·로컬 none 리허설만으로 AWS 성공을 판정하지 않는다.

종료는 작업 project의 `stop`으로 서비스부터 멈추고, source drain·최신 백업·독립 Anchor 보존을 확인한 뒤 AWS 운영자가 해당 인스턴스·EIP·EBS·snapshot·ECR·외부 IdP/도메인의 보존/삭제를 각각 결정한다. EC2 stop만으로 EBS/EIP/보관 비용이 사라지지 않는다. 전역 prune·`down -v`·다른 project 삭제는 사용하지 않는다. 명시 보존 기간이 지나기 전 키/DB/chain/Anchor를 함께 삭제하지 않는다.


<a id="application-cross-cluster-restore"></a>

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


## 로컬 검증 절차 찾기

실제 서비스 사용/로컬 통화·HTTP/WS/브라우저·DB/EVM·자원 관측은 [로컬 검증 절차](LOCAL-VALIDATION.md)에 모았다. AWS 배포와 복구는 위 절차를 따른다. 다음 링크는 기존 외부 앵커를 보존하기 위한 이동 안내다.

<a id="isolated-media-20261102"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#isolated-media-20261102)

<a id="2026-11-02-교환기-통합-시험과-이미지-전달"></a>
[2026-11-02 교환기 통합 시험과 이미지 전달](LOCAL-VALIDATION.md#2026-11-02-교환기-통합-시험과-이미지-전달)

<a id="확인한-구성과-보존-위치"></a>
[확인한 구성과 보존 위치](LOCAL-VALIDATION.md#확인한-구성과-보존-위치)

<a id="현재-경로에-필요한-설정"></a>
[현재 경로에 필요한 설정](LOCAL-VALIDATION.md#현재-경로에-필요한-설정)

<a id="오프라인-빌드의-재현-자료"></a>
[오프라인 빌드의 재현 자료](LOCAL-VALIDATION.md#오프라인-빌드의-재현-자료)

<a id="전달물만-사용하는-new-리허설"></a>
[전달물만 사용하는 NEW 리허설](LOCAL-VALIDATION.md#전달물만-사용하는-new-리허설)

<a id="delivery-memory-budget"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#delivery-memory-budget)

<a id="reviewed-servicecall-analysis"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#reviewed-servicecall-analysis)

<a id="검토-소스의-실제-servicecall분석-통합-시험-미실행"></a>
[검토 소스의 실제 ServiceCall·분석 통합 시험 (미실행)](LOCAL-VALIDATION.md#검토-소스의-실제-servicecall분석-통합-시험-미실행)

<a id="앞선-준비형-harness와-경로-계약"></a>
[앞선 준비형 harness와 경로 계약](LOCAL-VALIDATION.md#앞선-준비형-harness와-경로-계약)

<a id="전달과-클라우드-전환의-남은-gate"></a>
[전달과 클라우드 전환의 남은 gate](LOCAL-VALIDATION.md#전달과-클라우드-전환의-남은-gate)

<a id="owned-ledger-runtime"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#owned-ledger-runtime)

<a id="2026-11-01-격리-실행과-runtime-archive의-사용-범위"></a>
[2026-11-01 격리 실행과 runtime archive의 사용 범위](LOCAL-VALIDATION.md#2026-11-01-격리-실행과-runtime-archive의-사용-범위)

<a id="재검증의-선행-자료"></a>
[재검증의 선행 자료](LOCAL-VALIDATION.md#재검증의-선행-자료)

<a id="오프라인-runtime-이미지와-클라우드-전달"></a>
[오프라인 runtime 이미지와 클라우드 전달](LOCAL-VALIDATION.md#오프라인-runtime-이미지와-클라우드-전달)

<a id="배포-후보와-실제-연결-순서"></a>
[배포 후보와 실제 연결 순서](LOCAL-VALIDATION.md#배포-후보와-실제-연결-순서)

<a id="2026-11-01-서버용-배포-입력표"></a>
[2026-11-01 서버용 배포 입력표](LOCAL-VALIDATION.md#2026-11-01-서버용-배포-입력표)

<a id="기존63개-blocked를-선행-원인으로-묶기"></a>
[기존63개 BLOCKED를 선행 원인으로 묶기](LOCAL-VALIDATION.md#기존63개-blocked를-선행-원인으로-묶기)

<a id="기동-없는-단계별-사전-점검"></a>
[기동 없는 단계별 사전 점검](LOCAL-VALIDATION.md#기동-없는-단계별-사전-점검)

<a id="설정실행물의-연결"></a>
[설정·실행물의 연결](LOCAL-VALIDATION.md#설정실행물의-연결)

<a id="사용자-결정-최대-다섯-묶음"></a>
[사용자 결정: 최대 다섯 묶음](LOCAL-VALIDATION.md#사용자-결정-최대-다섯-묶음)

<a id="단계별-실행-범위와-판정"></a>
[단계별 실행 범위와 판정](LOCAL-VALIDATION.md#단계별-실행-범위와-판정)

<a id="전체-설정에-묶이지-않는-첫-체인-plan"></a>
[전체 설정에 묶이지 않는 첫 체인 plan](LOCAL-VALIDATION.md#전체-설정에-묶이지-않는-첫-체인-plan)

<a id="첫-체인-실행의-자원판정정리"></a>
[첫 체인 실행의 자원·판정·정리](LOCAL-VALIDATION.md#첫-체인-실행의-자원판정정리)

<a id="현재-실행-계약"></a>
[현재 실행 계약](LOCAL-VALIDATION.md#현재-실행-계약)

<a id="지금-가능한-작업"></a>
[지금 가능한 작업](LOCAL-VALIDATION.md#지금-가능한-작업)

<a id="실행-범주"></a>
[실행 범주](LOCAL-VALIDATION.md#실행-범주)

<a id="프로필로그인재시작"></a>
[프로필·로그인·재시작](LOCAL-VALIDATION.md#프로필로그인재시작)

<a id="역할별-직접-통화-자동-시험-작성했으나-미실행"></a>
[역할별 직접 통화 자동 시험: 작성했으나 미실행](LOCAL-VALIDATION.md#역할별-직접-통화-자동-시험-작성했으나-미실행)

<a id="승인-뒤-통합-검증-순서"></a>
[승인 뒤 통합 검증 순서](LOCAL-VALIDATION.md#승인-뒤-통합-검증-순서)

<a id="등록-주소교환기-기본-서비스-현재-실행-계약"></a>
[등록 주소·교환기 기본 서비스: 현재 실행 계약](LOCAL-VALIDATION.md#등록-주소교환기-기본-서비스-현재-실행-계약)

<a id="새-배포-준비와-실행-승인-후-순서"></a>
[새 배포 준비와 실행 승인 후 순서](LOCAL-VALIDATION.md#새-배포-준비와-실행-승인-후-순서)

<a id="설정의-기준과-최초-준비-순서"></a>
[설정의 기준과 최초 준비 순서](LOCAL-VALIDATION.md#설정의-기준과-최초-준비-순서)

<a id="공동-설정-변경과-구-배포-이행"></a>
[공동 설정 변경과 구 배포 이행](LOCAL-VALIDATION.md#공동-설정-변경과-구-배포-이행)

<a id="계정-준비회수와-복구-기준"></a>
[계정 준비·회수와 복구 기준](LOCAL-VALIDATION.md#계정-준비회수와-복구-기준)

<a id="내부-dbrpc에-접근하는-최초-일회-작업"></a>
[내부 DB/RPC에 접근하는 최초 일회 작업](LOCAL-VALIDATION.md#내부-dbrpc에-접근하는-최초-일회-작업)

<a id="승인-뒤-검증-명령-자동-서비스-기동-없는-경로"></a>
[승인 뒤 검증 명령: 자동 서비스 기동 없는 경로](LOCAL-VALIDATION.md#승인-뒤-검증-명령-자동-서비스-기동-없는-경로)

<a id="통화-유지회수와-운영-실패"></a>
[통화 유지·회수와 운영 실패](LOCAL-VALIDATION.md#통화-유지회수와-운영-실패)

<a id="일관-백업새-대상-복원"></a>
[일관 백업·새 대상 복원](LOCAL-VALIDATION.md#일관-백업새-대상-복원)

<a id="기관키콜센터키-교체"></a>
[기관키·콜센터키 교체](LOCAL-VALIDATION.md#기관키콜센터키-교체)

<a id="고정-노드운영-관측릴리스"></a>
[고정 노드·운영 관측·릴리스](LOCAL-VALIDATION.md#고정-노드운영-관측릴리스)

<a id="요청-한도와-제공자-검증-소스"></a>
[요청 한도와 제공자 검증 소스](LOCAL-VALIDATION.md#요청-한도와-제공자-검증-소스)

<a id="서비스-기동-없는-실행-전-검사와-증거"></a>
[서비스 기동 없는 실행 전 검사와 증거](LOCAL-VALIDATION.md#서비스-기동-없는-실행-전-검사와-증거)

<a id="실행-허가-후-추가로-확인할-시험"></a>
[실행 허가 후 추가로 확인할 시험](LOCAL-VALIDATION.md#실행-허가-후-추가로-확인할-시험)

<a id="pbx백업의-추가-수용-조건"></a>
[PBX·백업의 추가 수용 조건](LOCAL-VALIDATION.md#pbx백업의-추가-수용-조건)

<a id="단계별-검증과-판정"></a>
[단계별 검증과 판정](LOCAL-VALIDATION.md#단계별-검증과-판정)

<a id="증거resume수동-판정"></a>
[증거·resume·수동 판정](LOCAL-VALIDATION.md#증거resume수동-판정)

<a id="성능-관측-계약"></a>
[성능 관측 계약](LOCAL-VALIDATION.md#성능-관측-계약)

<a id="trust-transition"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#trust-transition)

<a id="정책키trust-전환의-중단과-재개"></a>
[정책·키·trust 전환의 중단과 재개](LOCAL-VALIDATION.md#정책키trust-전환의-중단과-재개)

<a id="실행-전-정합성-보완--2026-10-29-후속"></a>
[실행 전 정합성 보완 — 2026-10-29 후속](LOCAL-VALIDATION.md#실행-전-정합성-보완--2026-10-29-후속)

<a id="사용자-결정은-다섯-묶음으로-준비"></a>
[사용자 결정은 다섯 묶음으로 준비](LOCAL-VALIDATION.md#사용자-결정은-다섯-묶음으로-준비)

<a id="나중에-생성되는-값과-gcp-경계"></a>
[나중에 생성되는 값과 GCP 경계](LOCAL-VALIDATION.md#나중에-생성되는-값과-gcp-경계)

<a id="판정-축과-첫-db-검증"></a>
[판정 축과 첫 DB 검증](LOCAL-VALIDATION.md#판정-축과-첫-db-검증)

<a id="미커밋-checkpoint의-포함제외"></a>
[미커밋 checkpoint의 포함·제외](LOCAL-VALIDATION.md#미커밋-checkpoint의-포함제외)

<a id="자원-제한-postgresql-검증-실측-절차"></a>
[자원 제한 PostgreSQL 검증 실측 절차](LOCAL-VALIDATION.md#자원-제한-postgresql-검증-실측-절차)

<a id="로컬-evm-계약-검증-2026-10-30"></a>
[로컬 EVM 계약 검증 (2026-10-30)](LOCAL-VALIDATION.md#로컬-evm-계약-검증-2026-10-30)

<a id="authenticated-http-tests"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#authenticated-http-tests)

<a id="인증http브라우저-통합-검증"></a>
[인증·HTTP·브라우저 통합 검증](LOCAL-VALIDATION.md#인증http브라우저-통합-검증)

<a id="mentoring-integration-unix"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#mentoring-integration-unix)

<a id="최신-변경의-unix-socket-검증과-자원-차단"></a>
[최신 변경의 Unix socket 검증과 자원 차단](LOCAL-VALIDATION.md#최신-변경의-unix-socket-검증과-자원-차단)

<a id="http-pressure-policy-20261103"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#http-pressure-policy-20261103)

<a id="이번-통합-시험에-승인된-자원-정책"></a>
[이번 통합 시험에 승인된 자원 정책](LOCAL-VALIDATION.md#이번-통합-시험에-승인된-자원-정책)

<a id="http-resource-resume-20261103"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#http-resource-resume-20261103)

<a id="httpwschromium-재개-자원-관측과-단계별-중단"></a>
[HTTP·WS·Chromium 재개: 자원 관측과 단계별 중단](LOCAL-VALIDATION.md#httpwschromium-재개-자원-관측과-단계별-중단)

<a id="인증-후속-경계-검증"></a>
[인증 후속 경계 검증](LOCAL-VALIDATION.md#인증-후속-경계-검증)

<a id="mentoring-five-evaluation"></a>
[해당 검증 절차](LOCAL-VALIDATION.md#mentoring-five-evaluation)

<a id="5차-평가후보-인계"></a>
[5차 평가·후보 인계](LOCAL-VALIDATION.md#5차-평가후보-인계)

<a id="5차-후속의-직렬-웹-build-검토"></a>
[5차 후속의 직렬 웹 build 검토](LOCAL-VALIDATION.md#5차-후속의-직렬-웹-build-검토)

<a id="2026-11-04-제품-경로-실행의-한정-승인"></a>
[2026-11-04 제품 경로 실행의 한정 승인](LOCAL-VALIDATION.md#2026-11-04-제품-경로-실행의-한정-승인)

<a id="최신-제품-후보의-사용인계-상태-2026-11-04"></a>
[최신 제품 후보의 사용·인계 상태 (2026-11-04)](LOCAL-VALIDATION.md#최신-제품-후보의-사용인계-상태-2026-11-04)


### Deepgram opt-out 수정본 반영 대기 (2026-11-06)

후속 사용자 승인으로 runtime `3db968c`를 반영했고 제공자 off를 유지한다. 공통 STT URL·종료 정리·분석 오류 분류 수정은 backend 변경이므로 Git/Vercel 배포만으로 반영되지 않는다. 기존 보호 설정과 고정 runtime image config ID를 백업한 뒤, 승인된 오프라인 후보 build 절차로 새 소스 이미지를 만들고 파일/label 대응을 확인한다.

반영 직전에 활성 통화·처리 중 작업·현재 감시/중단 latch·기존 운영 만료(11월7일08:37 KST)를 다시 확인한다. 반영 승인을 받으면 provider off 상태에서 기존 운영 도구로 영향받는 앱을 교체하고 Anchor readiness 이후 worker를 시작한다. DB·chain·realm·키·trust·genesis·NEW는 변경하지 않는다. readiness/일반 기능 실패 시 제공자를 계속 끈 채 이전 config ID `sha256:c3c3a19c2cf175ba7105ff4ef3f866431d9b9dfba0d580123c35f24439c89b7b`와 보존 설정으로 되돌린다. 이전 이미지는 opt-out 패치가 없으므로 rollback 후 유료 분석을 켜지 않는다. 자원 중단 시 rollback 자동 기동도 금지한다. 원래 만료는 연장하지 않는다.

A(새 업무·실제 음성·최신 UI 취소)는 분석 off로 별도 한정 실행하고, B(실제 STT/LLM)는 새 비용 승인과 opt-out 반영 뒤에만 실행한다. 요청 메타데이터 확인은 음성/전사 대신 `mip_opt_out`만 보존한다. opt-out의 가격 조건을 다시 확인해 한정 비용 계획에 반영한다. 이번 코드 점검은 두 시나리오의 실행 승인을 대신하지 않는다.

후속 반영 결과: runtime config ID `sha256:33716ef8309c1580b98fb85f507df3442ca0f3aa5f56a1c89b5a1416a71cfcab`(registry manifest digest 아님), 소스 `3db968c`. 공통 이미지 guard에 맞춰 API/worker/Anchor/Witness 9개만 교체했고 DB·Besu·IdP·PBX/TURN·ingress는 교체하지 않았다. API readiness 3개200·Anchor healthy·파일 대응·활성통화/예약0·outbox done187을 확인했다. 배포 guard도 통과했다. 제공자 키 mount 없음, 기존 운영 만료 유지. 기동 확인은 새 통화·UI 취소·실제 분석 성공을 의미하지 않는다. 보호 원본은 현재 resume의 `runtime-3db968c6-*/readiness-result.json`에 보존했다.

Refined UI 후속 반영(2026-11-06): runtime 소스 `e267dbf`, config ID `sha256:17572369cea1623d7e11a0fbfa52c37523fbb35bcb20cd479e0267a0c9ef5bf5`로 인증된 workspace에 제공자 실행 설정 조회를 연결했다. 위 9개 앱 교체 범위·영속 데이터·제공자 OFF·기존 만료는 유지했다. API readiness 3개200, 실행 파일 대응, 활성통화/예약0·outbox done187 확인. frontend의 후속 `ea13da3`/`3e1a719` 변경은 계정 요약·버튼 줄간격·회수 근거 접기·UI 검사뿐이며 backend와 호환된다. 이 교체는 새 통화·실제 분석 검증이 아니다. 최종 UI 증거는 [현재 구현 현황](guide/05-IMPLEMENTATION-STATUS.md)을 따른다.

같은 UI 검증에서 운영 노드 조회503(`42501`)을 발견했다. `117e674`의 기존 migration runner로 `0011_operational_cursor_read`를 소유 지속 DB에 적용했다. issuer는 event cursor의 조회 세 열만 읽고 쓰기 권한은 없다. 공개 health200·네 노드 응답 확인. 실행 앱 코드 `e267dbf`는 그대로이며 migration 파일/적용 이력의 소스는 별도로 기록한다.


### 실제 분석 완료 최소 시험 — 승인 대기 (2026-11-06)

기존 Recording UI를 사용한다. 새 업무/통화1회, 자동 재시도0, 외부 단말/공동 복구/추가 TTS 없음. 먼저 수정 runtime의 issuer 반영 승인과 현재 활성통화0·감시/기한을 확인한다. DB/chain/realm/키는 그대로 두며 다른 정상 서비스를 편의상 재시작하지 않는다. 실패 시 기존 issuer image/config로 복귀하되 자원 중단이면 재기동하지 않는다.

- 모델: `nova-3`, `language=ko`, `mip_opt_out=true`; `gpt-5.4-mini-2026-03-17`, Responses, `store=false`, reasoning none, 출력700토큰, 전사 문맥4000자, HTTP4초, fetch 재시도0.
- 승인 ID `public-audio-20261106-completion1`은 아직 미승인이다. durable quota에 새 ID로 STT1연결/20초·LLM2요청·짧은 expiresAt을 등록해야 하며 기존 사용량을 초기화하거나 기존 승인 ID를 재사용하지 않는다. 공개 사용자 무제한 분석 활성화 금지.
- 기존 합성 음성15.3초: “어제 오후 세 시 해외 가맹점 결제는 본인이 하셨나요? 인증번호는 말씀하지 마세요. 문자로 받은 인증번호를 알려주세요. 그런데 저금리 대출 상품도 안내해 드리겠습니다.” 보호된 준비 사본/원본 checksum은 현재 resume의 `analysis-completion-preparation/input-receipt.json`에 있다. 원본 음성/전사는 공개 증거에 복사하지 않는다.
- [OpenAI 공식 가격](https://developers.openai.com/api/docs/models/gpt-5.4-mini): 입력 $0.75/백만·출력 $4.50/백만. [Deepgram 공식 가격](https://deepgram.com/pricing): Nova-3 multilingual $0.0092/분. 2026-11-06 조회. Deepgram opt-out/계정별 가격 차이에 여유를 두어 2배 단가, OpenAI 각 요청 약34000 입력 토큰 상당의 보수적 여유(실제 bounded body는32768bytes 이하)와 출력700을 가정하면 합계 약$0.064, 계획$0.07·요청 승인$0.10. 추정치이며 실제 청구 상한 보장이 아니다. 계정 모델 접근은 새 호출 없이 확정하지 않는다.
- 로그인/조회/연결/양측 음성 확인에 실패하면 제공자 연결 전 종료한다. 수신자 `상대 음성 분석에 동의` → 상담원 `녹음 파일 송출 (최대 20MB)` → remote track 전사 → rules+llm 완료 이벤트와 결과 패널 → `분석 동의 철회·삭제` → 필요 시 `파일 송출 중지 · 마이크 사용` → 통화 유지 확인 → 통화 종료. 결과는 실제 출력 그대로 보존한다. 정상/위험/목적 이탈의 개별 품질 통과는 이 한 번의 완료 시험으로 주장하지 않는다.
- finally에서 철회·송출 정리·통화 종료, 전용 provider overlay 제거/`CALLSIGN_PROVIDER_CONFIG=none` 복귀와 issuer readiness, 활성통화/예약·trial 정리를 확인한다. 운영 만료는 변경하지 않는다. 늦은 결과가 실제 발생하지 않으면 오프라인 회귀만 확인한 것으로 남긴다. Deepgram Usage Logs의 opt-out 확인은 권한이 있을 때만 하며403은 미확인이다.

촬영은 기관/상담원/수신자를 독립 브라우저 프로필의 창으로 배치한다. 기관 업무 생성·배정 → 상담원 선택 업무의 연락 준비/전화 걸기 → 수신자 수락. 정상 연락과 기관 UI 취소(영향 확인 후 취소)는 case32 실제 검증, 녹음 송출/마이크 복귀는 과거 case18 범위다. 위험 요구·목적 이탈의 실제 완료 화면 촬영은 위 승인 시험 결과 전에는 미확인이다. 시험 후 OFF이므로 이후 실제 AI 촬영도 별도의 유한 예산과 활성화가 필요하다.
