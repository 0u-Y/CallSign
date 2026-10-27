# 개발·배포·복구 runbook

**현재 단계에서는 아래 실환경 명령을 실행하지 않는다.** 사용자 요청으로 해당 범주 실행이 명시적으로 승인된 뒤 운영자가 수행한다. 자동 차단은 보안 sandbox가 아니라 실수 방지 장치다. 기존 프로세스·키·볼륨·증거를 정리하거나 초기화하지 않는다.

## v3 이행의 현재 차단점

새 `0003_service_runtime.sql`도 versioned runner 대상이지만 적용하지 않았다. 새 기관 provisioning만 empty-deployment gate를 ready로 만든다. 기존 기관은 복원/소비 이력 검토 전 blocked이며 임의 UPDATE로 해제하면 안 된다. 독립 anchor 검토·복구 해제 도구는 아직 없다. 새 v3 기본 화면·URI key/trust 준비·PBX 실제 설정/이미지·ARI 사건/회수·outbox worker도 미완성이다. 아래 명령은 보존한 v2 절차이며 새 Asterisk/lease 서비스 전체 배포의 완성 절차가 아니다. [현재 차이](FINALS-IMPLEMENTATION-PLAN.md#service-20261027).

## 지금 가능한 작업

`pnpm install --frozen-lockfile --ignore-scripts`, `pnpm light`, `pnpm --filter @callsign/web build`. Compose 정적 검사: `docker compose -f infra/deploy/compose.yml config --no-interpolate --no-env-resolution --format json`. 서비스 기동·이미지 접근은 하지 않는다. `lint`는 소스 위생/문법 검사이며 전체 ESLint 검사가 아니다.

## 실행 범주

| 범주 | 이후 명시적 실행값 | 경로 |
|---|---|---|
| 인프라 기동/정지/이전 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure` | `scripts/deployment.sh`, 역할별 서비스 실행 파일 |
| DB 통합 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration` | `pnpm test:integration` |
| 계약·원장 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=chain` | 계약/장애 시험, 개별 승인자 서명 도구 |
| 미디어 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=media` | `pnpm test:media`(v2), `pnpm test:e2e`(v1), `demo:record` |
| 성능 | `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=performance` | `pnpm test:benchmark` |

범주값을 `.env.example`에 미리 설정하지 않는다. 직접 스크립트 실행과 Playwright/Vitest 통합 설정도 기본 거절한다. `media` E2E는 하위 dev 실행에 infrastructure 범주를 전달하므로, 스택 기동까지 승인된 뒤에만 실행한다. 체인/미디어/성능 CI 자동 실행은 없다. 수동 integration workflow는 GitHub `infrastructure-validation` environment의 required reviewers도 설정해야 한다.

## 새 배포 준비

후속 인증 코드에는 `0002_session_scopes.sql`이 필요하다. **이번 작업에서는 적용하지 않았다.** 명시적 DB 실행 승인 뒤 versioned `scripts/migrate-finals.ts`를 사용한다. 기존 `scripts/migrate.ts`도 같은 runner로 연결해 v1과 v2가 공유하는 sessions schema를 맞춘다. 기존 세션은 `legacy`로 남으며 v2 서비스에서는 새로 로그인해야 한다. migration ledger가 없는 기존 v1 테이블은0000의 IF NOT EXISTS로 보존한다. 이미 수동으로 적용한 issuer_v2 구조가 있는데 ledger가 없다면 자동 stamp/삭제하지 말고 실제 DDL을 대조해 baseline을 검토한다.

일반/공식 로그인은 별도 purpose·issuer/client/audience로 검사하고, 각 화면의 로그아웃은 해당 scope만 회수한다. 다른 scope는 유지한다. `GET /v2/auth/me?purpose=work|official`로 해당 CSRF를 얻고 `POST /v2/auth/logout`에 purpose와 그 CSRF를 보낸다. replay ledger는 별도라 logout 뒤 같은 ID token을 다시 쓸 수 없다. 실제 PG 시험에는 `tests/integration/finals-session-scopes.test.ts`가 추가됐고, `TEST_AUTH_DATABASE_URL`을 주지 않은 최소권한 항목은 NOT-RUN skip이다. 이 자격 증명은 이미 준비한 비관리자 auth LOGIN 계정이어야 하며 시험이 자동 생성하지 않는다.

1. 새 소스 revision과 이미지 tag/digest를 고정한다. Dockerfile의 `runtime`/`web` target을 같은 revision에서 빌드한다. 현재 단계에서는 빌드·pull하지 않는다. Registry에 올린 실제 digest를 `.env`에 기록한다.
2. GCP 프로젝트·zone·64GB급 VM 종류·정확한 OS image·전용 service account·VPC·운영자 CIDR을 결정한다. Terraform init/plan/apply는 별도 승인 뒤 수행한다. `infra/gcp/main.tf`는 미실행이며 provider 검증도 아직 하지 않았다.
3. `/srv/callsign`에 별도 persistent disk를 연결·mount한다. 기존 데이터가 있으면 포맷하지 않는다. OS login/IAM, SSH 범위, HTTPS DNS, TURN DNS/공인 IP/인증서와 relay 방화벽을 준비한다.
4. **새 배포만** `scripts/prepare-finals.ts keys NEW_DIRECTORY`로 기관/서비스/witness 키를 준비한다. ISSUER_DID와 SERVICE_DID는 자신이 소유한 도메인이다. 기존 디렉터리는 거절한다. 계약 승인자 3명, 관리자, emergency stopper의 키는 각 소유자가 별도 환경에서 생성·관리한다. 과거 공개 demo 키는 재사용하지 않는다.
5. 명시적 체인 초기화·새 계약 배포·2-of-3 기관 등록은 별도 관리 작업이다. 기존 v1 `demo:up`은 로컬 fixture bootstrap이므로 GCP/서비스 기동에 사용하지 않는다. 기관 등록은 `keccak256(UTF8 institutionId)`, 새 기관 승인 public key, epoch 1, 목적 mask 4의 금융 프로파일을 사용한다. genesis·계약 주소·network ID와 배포 트랜잭션을 기록한다.
6. genesis/node 키는 `besu/`, 배포 metadata는 `deployment.json`, 기관키는 `issuer/approval-v1.json`, 서비스키는 `sender/key.json`, witness키는 `witness-keys/witness-N.json`이다. 기관 관리자키는 `admin/administrator.txt`, emergency/broadcast키는 `operator/emergency.txt`에 개별 mount한다. 파일 0600/디렉터리0700과 컨테이너 UID 읽기 권한을 설정한다. 승인자 개인키를 Issuer/Platform에 mount하지 않는다.
7. `prepare-finals.ts trust DIRECTORY`는 공개 manifest와 deployment.json에서 새 trust bundle을 만들며 기존 파일을 덮어쓰지 않는다. 출력된 `VITE_FINALS_TRUST_SHA256`으로 웹 이미지를 빌드한다. 서비스 Dockerfile은 `VITE_PROTOCOL_PROFILE=finals`를 고정해 역할 화면과 `/official`을 v2 API에 연결한다. 호스트에서 웹만 빌드할 때도 이 환경값을 지정한다. 기관/서비스 did.json을 HTTPS에 게시하고 키 controller와 assertion/authentication을 확인한다.
8. migrator 계정으로 `scripts/migrate-finals.ts`를 한 번 적용한다. role group은 NOLOGIN이다. 각각 별도 LOGIN 계정을 만들고 `callsign_issuer`, `callsign_auth`만 부여한다. Platform/Sender에는 DB 계정을 주지 않는다. 실제 GRANT/REVOKE 검증은 필수다.
9. OIDC issuer/JWKS/authorization/token URL, 일반/공식 업무의 서로 다른 client ID와 audience와 사전 등록 subject를 준비한다. 계정 ID는 `issuer|sub`다. accounts JSON은 id/displayName/role 배열이며 institution/gateway/recipient와 선택 approver를 가진다. `scripts/provision-finals.ts public-manifest.json accounts.json`은 새 기관/계정만 만들며 기존 객체를 덮어쓰지 않는다.
10. 보호된 env 파일을 `.env.example` 기준으로 채운다. Platform/Sender 간 token, Sender/Issuer token은 서로 다르고 32자 이상이어야 한다. 실제 비밀값은 채팅·Git에 넣지 않는다. DB/trust/키를 준비하지 않은 상태를 readiness 성공으로 취급하지 않는다.

## 준비 도구의 호출 위치와 인자

아래 예시는 **실행 승인이 난 뒤 저장소 루트에서만** 사용한다. 값을 export해 상시 해제하지 말고 승인된 명령에만 붙인다. 여러 범주가 필요한 경우 해당 명령을 순서대로 각 범주로 실행하며 범주값을 쉼표로 합치지 않는다.

```bash
# 새 배포 키 준비: 기존 디렉터리에는 실행하지 않음
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure ISSUER_DID=did:web:OWNED_DOMAIN:issuer SERVICE_DID=did:web:OWNED_DOMAIN:sender pnpm tsx scripts/prepare-finals.ts keys /srv/callsign-NEW
# 운영자가 배포한 실제 networkId/genesisHash/registryAddress를 /srv/callsign-NEW/deployment.json에 기록한 다음
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure pnpm tsx scripts/prepare-finals.ts trust /srv/callsign-NEW
# protected env의 MIGRATOR_DATABASE_URL을 사용: 첫 적용 전 대상 DB를 확인
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure pnpm tsx scripts/migrate-finals.ts
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure pnpm tsx scripts/provision-finals.ts /srv/callsign-NEW/public-manifest.json /secure/accounts.json
```

공개 manifest는 키 준비 디렉터리의 `public-manifest.json`, 결과 bundle은 `trust/trust-bundle.json`이다. 계정 JSON의 예시는 `[{"id":"https://IDENTITY_ISSUER|SUBJECT","displayName":"담당자","role":"institution"}, ...]`이며 실제 institution/gateway/recipient 계정을 별개로 준비한다. `deployment.json`의 네 필드(networkId/genesisHash/registryAddress/institutionId)는 문자열이다. institutionId는 `keccak256(UTF8 INSTITUTION_ID)`의 0x+64 hex다. chain ID는 10진 문자열, genesisHash는 `0x`+64 hex, registryAddress는 `0x`+40 hex다.

일반 audience는 통화 업무 역할 세션용이고 공식 업무 audience는 별도 `official_session` 발급용이다. 두 값은 신뢰하는 OIDC 관리자가 서로 다른 client/audience로 등록한다. 현재 adapter는 token endpoint의 client authentication method `none`인 S256 PKCE public client를 사용한다. 임의로 같은 값을 복사하면 서버가 거절한다. `/finals`의 수신 앱은 기관/서비스/소비/상태 서명을 직접 검증하며, 수신자 자신의 키는 별도 소유 증명에 사용된다.

## 기동·정지·재시작

승인된 환경에서 `CALLSIGN_ENV_FILE=/etc/callsign/deployment.env bash scripts/deployment.sh start|stop|restart`를 사용한다. 기본 명령은 `--no-build --pull never`다. DB와 Besu를 준비한 후 witness, Issuer/Sender, Platform, web/HTTPS의 readiness를 순서대로 확인한다. health는 프로세스 생존만 의미한다. `infra/gcp/callsign.service`는 기존 배포의 재시작만 하며 초기화·migration·seed를 하지 않는다.

`/finals`에서 기관 계정으로 모의 FDS 업무 생성과 VC 발급, **VC마다 한 번** 원장 등록을 한다. 상담원은 할당 업무에서 시도·허가·승인을 만들고, 수신자는 같은 시도의 연결 대기 후 서명·원장·현재 DTLS/datachannel을 검증한다. 양쪽이 연결 대기한 뒤 발신한다. 수락 전 음성은 미부착이다. 자동 재접속·ICE restart는 하지 않는다. 새 연결은 새 통화 시도부터 시작한다. 오디오 자동 재생이 차단되면 브라우저 오디오 컨트롤에서 재생한다.

실시간 STT/LLM은 제공자 계정·선택 모델·데이터 처리 동의를 별도로 준비한다. 기본 서버 음성 영구 저장은 없다. STT 비용 한도는 연결당 5분/12MB, LLM은 analyzer당 20회/응답 최대700token이다. **현재 전체 계정 월간 과금 한도는 제공자 콘솔에서 별도로 설정해야 한다.** 규칙 분석은 정확도 보장이 아니고 provider 실패/미설정은 분석 불가로 표시한다.

## 백업·복원·롤백

- `scripts/backup.sh`는 새 보호 디렉터리에 DB dump와 checksum만 만든다. **체인/키까지 포함한 일관된 전체 백업이 아니다.** 운영자는 승인된 정지 시간에 전체 스택을 정상 정지한 후 Besu 각 볼륨, DB, deployment.json, trust manifest, 역할별 키와 env의 암호화 backup을 같은 checkpoint로 보관한다. 실행 중인 chain volume을 tar로 복사하지 않는다.
- 복원은 새 VM/새 빈 DB/새 디스크에서 checksum, deployment ID, chain genesis, registry, epoch, issuer/witness 공개키를 대조한 뒤 수행한다. `scripts/restore.sh`는 새 빈 DB만 대상으로 하고 `--clean` 없이 실패 시 transaction을 되돌린다. 원본은 삭제하지 않는다. 같은 배포 복원은 키를 재발급하지 않는다.
- 이미지 rollback은 이전 digest와 호환 DB schema에만 한다. 이 migration은 자동 down을 제공하지 않는다. DB 변경이 호환되지 않으면 검증한 backup을 새 DB에 복원하고 URL을 교체한다. 오래된 chain/취소 상태를 정상 상태로 되돌려 공개하면 안 된다. 최신 epoch/revocation과 재동기화하기 전 인증 표시를 열지 않는다.
- domain 변경은 새 DID와 발급 VC·issuer/서비스 문서·trust hash·OIDC redirect/audience·Origin/TURN realm·HTTPS 인증서를 함께 재설정해야 한다. DNS 별칭만 바꾸고 기존 VC를 새 기관으로 취급하지 않는다.

## 키 회전

새 기관 approval-vN 파일을 별도 준비한다. 새 공개키를 포함한 recovery 요청을 승인자들이 읽고 각각 `scripts/sign-recovery.ts request.json ONE_KEY_PATH EXPECTED_TYPED_DATA_HASH`로 서명한다. 각 실행 환경에는 자기 승인키 하나만 둔다. UI는 digest와 수집한 서명을 보여주고 2-of-3 검증 후 제출한다. 새 epoch/키가 witness quorum에 나타난 뒤 `/v2/governance/activate-key`를 호출한다. 구 VC/승인/시도를 무효화한다. 새 공개키를 public-manifest.json의 `issuer/approval-vN` 항목에 기록한다. `APPROVAL_KEY_VERSION=N`으로 `prepare-finals.ts trust DIRECTORY NEW_TRUST_OUTPUT_PATH`를 호출해 기존 파일을 보존한 새 bundle을 만든다. `TRUST_BUNDLE_FILENAME`을 새 파일명으로 바꾸고, 새 DID 문서와 hash로 수신 앱을 배포·재시작한 후 새 VC를 발급한다. 구키·백업을 바로 삭제하지 않는다.

## v2 미디어 자동 시험 (미실행)

`playwright.finals.config.ts`는 서버를 자동 기동하지 않는다. 실제 v2 스택과 browser/microphone을 별도로 준비한 뒤 `pnpm test:media`를 사용한다. `CALLSIGN_MEDIA_ORIGIN`, 사전 로그인한 상담원/수신자의 Playwright storage 파일 경로(`CALLSIGN_MEDIA_GATEWAY_STORAGE`, `CALLSIGN_MEDIA_RECIPIENT_STORAGE`), 할당 업무 ID와 원장 등록 VC digest(`CALLSIGN_MEDIA_INTENT_ID`, `CALLSIGN_MEDIA_CREDENTIAL_DIGEST`)가 필요하다. 값이 없으면 NOT-RUN skip이며 PASS가 아니다. 이 시험은 실제 마이크 권한을 사용하고 STT 동의 버튼을 누르지 않아 유료 제공자는 호출하지 않는다. 해당 시험 코드는 native getStats에서 수락 전0/후 증가와 remote track 종료를 확인하지만 아직 실행하지 않았다. TURN relay·PBX·제공자 동의철회 측정은 아래 후속 검증에서 별도 추가한다.

## 승인 뒤 통합 검증 순서

1. PostgreSQL migration·별도 계정 권한, 취소/소비 경합, crash 후 동일 영수증, 다른 binding 거절.
2. Issuer/Sender/OIDC의 인증·할당·키 mount·공식 업무 별도 audience와 객체 권한.
3. Besu4·witness4의 같은 chain/genesis/block/payload, VC digest 등록·철회, stale/정지/rollback, 실제 새키 복구.
4. 별도 기기의 HTTPS/WebRTC 마이크, 수락 전0 audio, 양방향 수락/음소거/거절/종료/장치오류, TURN relay/만료, 재연결 재검증.
5. STT/provider 소량 시험, partial/final/수정/동의철회/요청상한, 실제 지출/민감 로그 검사.
6. PBX는 선정한 bridge의 실제 signaling/RTP 종단부터 검토한다. adapter만으로 전체 경로 완료로 판단하지 않는다.
7. 허용된 소규모 장애/부하, GCP 재시작·backup/restore·rollback을 별도 실행하고 새 커밋·환경·raw 결과를 기록한다.
