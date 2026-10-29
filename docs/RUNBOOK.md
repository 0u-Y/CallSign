# 개발·배포·복구 운영 절차

**현재 단계에서는 아래 실환경 명령을 실행하지 않는다.** 사용자 요청으로 해당 범주 실행이 명시적으로 승인된 뒤 운영자가 수행한다. 자동 차단은 보안 sandbox가 아니라 실수 방지 장치다. 기존 프로세스·키·볼륨·증거를 정리하거나 초기화하지 않는다.

## 현재 실행 계약

기본 서비스는 등록 URI·갱신형 통화 유지·Asterisk 경로다. 화면·worker·키/trust 준비·독립 복원 anchor·회수·배포 설정은 코드로 연결했다. 실제 migration·기동·DB/체인/교환기/브라우저/AI/복원 검증은 하지 않았다. 신규 schema는 `0000`~`0005`이며 적용 이력과 실제 DDL이 충돌하면 자동 stamp/초기화하지 않는다. [구현·남은 작업](FINALS-IMPLEMENTATION-PLAN.md#execution-readiness-20261029).

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
# DB/체인만: 기존 데이터는 재초기화하지 않는다. 필요한 이미지와 network 파일은 사전에 준비한다.
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

백업 manifest는 암호화 키에서 HKDF로 분리한 MAC 키로 인증하고 파일 hash·크기·대상 배포를 검사한다. tar의 링크/특수 파일/경로 이탈을 거절한다. 인증 없는 구 manifest는 자동 신뢰하지 않는다. 복원은 새 빈 대상만 허용하고 로그인 세션을 모두 폐기하며 gate는 닫힌다. DB·체인·키/trust의 일관 snapshot과 독립 anchor 대조 전 공개하지 않는다. 실제 백업/복원은 아직 실행하지 않았다.

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

필수 조건: test: 배포 ID와 DEPLOYMENT_ID 일치, 운영 DB와 다른 `callsign_test_*` DB에0000~0005 적용 및 역할 GRANT 완료, TEST_DATABASE_URL=시험 owner, TEST_AUTH_DATABASE_URL=같은 시험 DB의 별도 auth LOGIN. 미래 준비 명령은 기존 migration/provision-logins 절차를 사용한다. AI/OIDC/PBX/기관 등록/실제 trust를 DB 경계 시험 선행 조건으로 추가하지 않는다. 결과는 NEW-DATABASE JSON/고정 sidecar·진행 파일이다. assertion 미실행/skip·권한 과다·hash 불일치·guard/identity 불일치·실패·timeout이면 중단한다.

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
