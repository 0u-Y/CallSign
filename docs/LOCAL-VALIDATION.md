# 로컬 검증 절차와 과거 준비 환경

2026-11-05 메모리 실측 한정 예외: 사용자 승인 batch는 launcher의 `--start-policy staged-memory-v1`과 같은 값의 plan `startPolicy`를 함께 지정한다. 시작40GiB 검사만 가용16GiB 검사로 바꾸며, 60초 사전 관측·5초 실행 표본·소유 전체24GiB/host1GiB·가용16GiB·PSI/swap-out/OOM·90분 deadline은 유지한다. 내부 bootstrap에도 명시적으로 전달하고 root identity와 plan을 검사한다. 옵션을 생략한 일반 실행은 여전히 시작40GiB다. 부분 기동이나 fixture IdP 결과를 공개 지속 환경 전체의 RAM 요구량으로 보고하지 않는다.

현재 DB 감사/복원 시험은 `scripts/validation-runtime-media.py`의 명시적 plan `databaseAudit`/`fullRestore`에서 선택한다. 시작 snapshot→정해진 통화→앱/worker 정리→DB가 살아 있는 최종 감사→기반 자원 정리 순서를 유지한다. 정상 반복은 최대5회·자동 재시도0으로 제한한다. `fullRestore`는 기존 암호화 bundle CLI와 현재 이미지에서 복사한 Node/코드, 기존 PostgreSQL 이미지의 native client를 사용하며 원본 fence·새 DB volume·정지한4개 Besu snapshot·독립 Anchor 보존을 요구한다. **이전 service-hardening 소스의 전체 RESTORE·복원 후 통화·양쪽 DB 감사는 PASS다. 새 지속 데모/provider 후보의 전체 RESTORE는 NOT_RUN이며 이전 PASS를 전용하지 않는다.** [실행 근거](../artifacts/restore-audit-20261105.json)를 확인한다. 별도 사용자의 실행 승인과 기존40GiB/24GiB/16GiB·압박/OOM/deadline 조건 없이 기동하지 않는다.


현재 후보의 실제 준비·일반 entrypoint·자원 중단은 [후속 실행 기록](../artifacts/candidate-media-followup-20261104.json)을 따른다. 통화 완료 전 중단됐고 기존 실행 정책을 바꾸지 않았다. 새로운 허가 없이 자동 재기동하지 않는다.

정리 전에 원본 로그와 최초 자원 중단 표본, 소유 ID, host baseline/after snapshot을 **보호된 로컬 경로에 먼저 보존**한다. env·키·세션·DB/chain 데이터는 공개 증거에서 제외한다. Docker ID를 비교할 때 전후 모두 `--no-trunc`를 쓰거나 명시적으로 prefix를 정규화한다. 전체 interface snapshot의 차이는 수명/외부 작업 등의 원인을 확인하기 전 설정 변경으로 단정하지 않는다. baseline을 잃었거나 비교 형식이 잘못됐으면 보존 PASS 대신 미확인으로 기록한다. 원본 보존을 확인한 뒤 소유 label/ID를 대조해 앱/브라우저→기반 서비스→보호 trial root 순서로 정리한다.

[운영 진입점](RUNBOOK.md) · [현재 구현/검증](guide/05-IMPLEMENTATION-STATUS.md)

아래는 환경별 실행 절차다. 날짜별 “이번”·미승인·NOT_RUN 문구는 당시 작업 범위이며 현재 완료 판정은 진행 기록을 따른다. 과거 서버 경로/자원 표본을 AWS 설정으로 복사하지 않는다. 실행 guard와 새 사용자 허가가 필요하고 이미 소모한 일회성 batch를 재사용하지 않는다.

## 목적별 시작점

| 목적 | 절차 |
|---|---|
| 현재 제품·실제 통화 분석 | [ServiceCall 분석 경로](#reviewed-servicecall-analysis), [역할별 사용](#2026-11-04-제품-경로-실행의-한정-승인) |
| 격리 전달물 NEW·자원 예산 | [전달 리허설](#isolated-media-20261102), [예산](#delivery-memory-budget) |
| HTTP·WS·브라우저 | [인증 통합](#authenticated-http-tests), [Unix socket](#mentoring-integration-unix), [압박 정책](#http-pressure-policy-20261103) |
| 무기동 검사·DB·EVM | [실행 범주](#실행-범주), [DB](#자원-제한-postgresql-검증-실측-절차), [EVM](#로컬-evm-계약-검증-2026-10-30) |
| 실제 AWS·백업/복원 | [운영 RUNBOOK](RUNBOOK.md) |

<a id="ui-only-validation"></a>

실제 데모 경로의 media 회귀는 기존 전체 plan의 `demoUi:true`로 선택한다. `generalEntrypointFirst:true`는 첫 normal-smoke만 일반 서비스 entrypoint로 실행하고 나머지의 명시적 분석 fixture와 구분한다. 같은 실제 통화에서 관리 화면으로 이동·뒤로 간 뒤 remote track identity와 디코딩 음성을 각각 검사한다. 오디오 DOM 보존만으로 PASS하지 않는다. 선택 env와 경로 증거는 논리적 시도 사이에 보관한다. 최신 새 이미지의 이 경로는 시작 가용 RAM 미달로 아직 NOT_RUN이다.

## UI 전용 검증과 실제 통화 검증의 분리

실제 `/service`·`/official` 화면 검토는 기존 HTTP fixture·격리 PostgreSQL·loopback API/OIDC/웹·설치 Chromium을 사용한다. 원장/ARI/Anchor/분석 제공자는 명시적 adapter이며 전체 통화 성공으로 세지 않는다. 별도 사용자 승인이 있는 새 batch에서만 `--profile ui-only-v1 --policy integration-pressure-v1`을 선택한다. 환경변수만으로 선택하지 않으며 identity의 `executionProfile`도 일치해야 한다.

이 UI profile의 승인 조건은 시작24GiB·실행 여유16GiB, host 관측3GiB·DB 포함4GiB·임시5GiB, DB 강제512MiB/CPU1, worker1·브라우저1, 정리 포함45분/마지막10분 확보다. 조건·최초 표본을 판정 전에 보존한다. 기존 압박/swap-out/OOM/관측 오류 중단은 유지한다. 강제 DB 제한과 관측 예산은 다르며 AWS 최소 사양이 아니다. 전체 통화의40GiB/24GiB/host1GiB 조건은 바꾸지 않는다.

기존 [Unix socket 준비](#mentoring-integration-unix)로 새 소유 DB·최소권한 LOGIN·migration을 준비하고, 같은 identity의 controller에 profile을 명시한다. 보호 env·CA는 소유 경로만 사용한다. 예를 들어 다음 명령은 이미 준비한 controller/실시간 watchdog 아래의 한 단계이며 독립적인 전체 준비 명령이 아니다.

```bash
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration python3 scripts/validation-resource-control.py   --profile ui-only-v1 --policy integration-pressure-v1 run "$CONTROL" product-ui 300   node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts tests/integration/service-http.test.ts
```

실제 API 성공은 대체하지 않는다. 장애 응답/보류 응답·component host를 쓴 사례는 결과에 표시하고, 캡처는 직접 열어 판단한다. 683 CSS px·DPR2 확대 동등 viewport 검토는 네이티브 브라우저 메뉴 확대·스크린리더 검증과 구분한다. 실패 원본과 선택 재시험을 보존하고 고유 사례를 중복 집계하지 않는다. 자원 중단 시 새 batch를 자동 생성하지 않는다. [현재 실행 결과](../artifacts/service-ui-validation-20261104.json)를 따른다.

<a id="isolated-media-20261102"></a>

## 2026-11-02 교환기 통합 시험과 이미지 전달

[실행 범위·실패·결과](FINALS-IMPLEMENTATION-PLAN.md#isolated-media-20261102)와 [이미지/소스 증거](../artifacts/isolated-media-20261102.json)를 먼저 확인한다. 아래 명령 중 **이후 실행**으로 표시한 것은 이 작업에서 실행한 명령이 아니다. 현재 호스트에 bridge·publish·방화벽·DNS 설정을 적용하지 않는다.

### 확인한 구성과 보존 위치

작업 디렉터리는 `.local/media-20261102-43880954`이며 Git에서 제외한다. 보호 파일·실패 로그·합성 WAV·시험 키와 source snapshot은 공개하지 않는다. `runtime-web-media-final.tar`는 runtime/web/Asterisk/TURN의 linux/amd64 이미지다. Docker config ID와 archive SHA256은 증거에 따로 기록한다. registry manifest digest가 아니다. 이 환경은 합성 일회성 시험이며 이전할 기관 identity가 아니다.

실제 통화에 사용한 candidate runtime과 이후 최종 runtime 재build를 구분한다. 최종 이미지에서도 API/Witness entrypoint·실제 서명·worker cursor를 확인했으나 새 통화를 반복한 것으로 표시하지 않는다. 이미지에는 앱의 설치 의존성이 들어 있고 서비스에 host 소스/node_modules를 mount하지 않았다. controller만 기존 Node/의존성/Chromium을 읽기 전용으로 사용하는 시험 도구다.

### 현재 경로에 필요한 설정

- SQL은0000~0010을 순서대로 적용한다. 기존0000~0006 hash를 바꾸거나 삭제하지 않는다. PBX 잠금에는 issuer/worker의 `UPDATE(id)`가 필요하고 expires_at 등 다른 열의 UPDATE는 허용하지 않는다. `qualify_2xx_only`, `authenticate_qualify`, `prune_on_boot`의 실제 PJSIP true/false 직렬화 폭을 확인한다.
- `prepare-pbx.ts`가 생성하는 `asterisk.conf`/`logger.conf`를 포함한다. `/var/lib/asterisk`의 image XML 문서를 가리지 않는다. root가 아닌 실행에서 AstDB·socket은 `/var/run/asterisk`, 로그/스풀은 별도 writable 경로다. CallSign 권한·자격의 영속 기준은 PostgreSQL이며 이 임시 AstDB로 진행 통화를 복원하지 않는다. `compose.pbx.yml`은 이 쓰기 경계를 반영한 템플릿이며 현재 호스트에서는 기동하지 않았다.
- 양쪽 PJSIP digest 기본 알고리즘을 SHA-256으로 맞춘다. 내장 `ulaw`를 사용하며 Opus transcoder는 포함하지 않는다. PBX credential secret은 base64url 해제 후 정확히32byte여야 한다.
- host Node에는 host CA 경로를 `NODE_EXTRA_CA_CERTS`로 전달하고, 서비스에는 container CA 경로를 전달한다. Nginx는 `/etc/nginx/pbx-ca.pem`으로 upstream 검증을 유지한다. 브라우저 CA는 시험 NSS profile에만 등록한다. 전역 인증서 오류 무시를 사용하지 않는다.
- Asterisk22.11은 loopback host ICE 후보를 제외한다. 이 시험은 내부 TURN REST 자격을 발급하고 Asterisk에도 실제 TURN을 설정했다. 브라우저의 시험 observer는 relay-only를 강제했고 실제 선택 후보를 확인했다. `allow-loopback-peers`는 이 loopback 시험용 설정에만 한정하며 운영/public TURN에 복사하지 않는다. 외부 NAT 통과 검증은 별도다.

Asterisk의 [공식 WebRTC 설정](https://docs.asterisk.org/Configuration/WebRTC/Configuring-Asterisk-for-WebRTC-Clients/)과 [22.11.0 소스](https://downloads.asterisk.org/pub/telephony/asterisk/), [coturn4.6.3](https://github.com/coturn/coturn/releases/tag/4.6.3)을 사용했다. 받은 소스·PJProject·Ubuntu 서명 검증 dependency/metadata의 합계는 약453MiB로 승인된500MiB 이하다. 실제 SHA256·버전은 실행 증거에 있다. 추가 다운로드를 자동으로 하지 않는다.

### 오프라인 빌드의 재현 자료

`reproduce-media-inputs/`에는 기존에 받은 source·PJ cache·서명 검증 APT 자료/deb와 hash 목록을 보존한다. 원래 성공한2GiB·CPU2·900초 compile 로그와 원본 recipe는 별도 보존했다. 저장소의 `infra/deploy/build-media.sh`는 같은 compile 본문에 host 실행 방지/입력 hash 검사를 붙인 recipe이며 이 guard wrapper 자체의 전체 재compile은 반복하지 않았다. guard·셸 문법은 검사했다. 운영 키/인증서는 build input이 아니다.

**이후 별도 승인된 작업 전용 none build에서만 실행할 예:** 아래 변수는 작업자가 실제 보호 경로와 이미 존재하는 pinned base로 채운다. 기존 container/image를 덮어쓰지 않는다.

```bash
# No host network, no host package install. The timeout runs INSIDE the owned build container.
docker run --name "$NEW_MEDIA_BUILD" --label "org.callsign.run-id=$NEW_RUN_ID"   --network none --memory 2g --memory-swap 2g --cpus 2 --pids-limit 512   --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure --env CALLSIGN_OWNED_MEDIA_BUILD=yes   --mount "type=bind,src=$REVIEWED_MEDIA_INPUTS,dst=/sources,readonly"   "$REVIEWED_LOCAL_BUILD_BASE" timeout 900 bash /sources/build-media.sh
# ExitCode=0, OOMKilled=false, expected modules/ODBC driver/version required before committing this owned build image.
docker commit "$NEW_MEDIA_BUILD" "$NEW_MEDIA_BUILD_TAG"
docker build --network=none --pull=false --target asterisk   --build-arg "MEDIA_BUILD_IMAGE=$REVIEWED_MEDIA_BUILD_ID" -f infra/deploy/media.Dockerfile .
docker build --network=none --pull=false --target turn   --build-arg "MEDIA_BUILD_IMAGE=$REVIEWED_MEDIA_BUILD_ID" -f infra/deploy/media.Dockerfile .
```

Asterisk/PJSIP/WSS/ARI/SRTP/ODBC와 PostgreSQL Unicode driver를 실제 image에서 확인한다. immutable XML을 숨기거나 권한 검사를 제거해 기동을 통과시키지 않는다. 다운로드 없는 archive load와 container 기동은 서로 다른 실행 단계다.

### 전달물만 사용하는 NEW 리허설

이 절차는 **폐기할 합성 배포** 전용이다. AWS override나 host bridge/port publish를 실행하지 않는다. 운영 NEW/RESTORE는 위 AWS 절차를 따른다. 서비스는 전달한 이미지·공개 파일·이번에 생성한 보호 입력만 사용한다. 설치 Chromium·공유 라이브러리·폰트와 assertion 코드는 시험 controller의 입력이다. `observer-tests.tar`의 로컬 OIDC fixture는 controller에서 HTTPS 인증 endpoint를 제공하는 **명시적인 시험 인증 의존성**이며 실제 IdP를 대신 검증한 것은 아니다.

필요한 입력은 checksum에 포함된 `aws-bootstrap-images.tar`, `deployment-files.tar`, `images.json`, `observer-tests.tar`다. 이미지6종은 linux/amd64이며 웹은 새 PBX 인증서·trust에 맞춰 전달 runtime/nginx에서 만든다. 원래 전달물에는 웹이 참조하는 `artifacts/test-results.json`이 빠져 있었으므로 수정된 공개 묶음을 사용한다. 이 JSON은 날짜가 있는 과거 증거이며 현재 배포 결과로 갱신하지 않는다.

준비 PC에는 Docker, Python3.12 이상, UID1000, 기존 Chromium1243와 `/usr/lib/x86_64-linux-gnu`, `/usr/share/fonts`, `/etc/fonts`가 필요하다. 누락돼도 설치하거나 host 권한을 바꾸지 않는다. 시작 available RAM **40GiB guard는 유지**한다. 이는 기술적 최소 RAM이나 실측 peak가 아니라, 아래 약23GiB 컨테이너 예산과 기존 작업용16GiB 여유를 올림한 보수적 운영 정책이다. 더 낮은 시작 조건을 입증한 비교 시험은 없다.

<a id="delivery-memory-budget"></a>

현재 `runtime-delivery-bootstrap.py`·`runtime-media-driver.py`의 강제 한도를 GiB로 환산하면 다음과 같다. AWS Compose의 한도와 폐기 시험 launcher의 한도를 혼용하지 않는다.

| 구성 | 개수 × 컨테이너 한도 | 합계 GiB | 포함 시점/별도 조건 |
|---|---:|---:|---|
| Besu | 4 × 3GiB | 12 | JVM 각각 `-Xmx2g`; heap과 컨테이너 한도를 중복 합산하지 않음 |
| Witness | 4 × 512MiB | 2 | 고정 4개 유지 |
| 서비스/Anchor PostgreSQL | 2 × 512MiB | 1 | 서로 다른 volume; shared memory도 해당 프로세스 관측에 포함 |
| HTTPS Anchor | 1 × 256MiB | 0.25 | DB와 별도 프로세스 |
| Asterisk | 1 × 512MiB | 0.5 | 합성 음원 |
| TURN | 1 × 512MiB | 0.5 | 현재 launcher 기본값; 과거256MiB 표본과 구별 |
| none namespace keeper | 1 × 32MiB | 0.03125 | bridge/port publish 없음 |
| 시험 controller | 1 × 2GiB | 2 | Chromium·로컬 OIDC·assertion 포함, host RSS로 다시 더하지 않음 |
| Issuer/Sender/Platform/worker | 4 × 512MiB | 2 | worker1개; 별도 Node heap 고정은 없음 |
| **웹 생성 전 기반/앱 소계** | | **20.28125** | 현재 driver는 이 상태에서 웹 build 시작 |
| 웹 builder | 1 × 2GiB | 2 | build 단계 최대 **22.28125GiB**;90초·CPU1 |
| web/HTTPS ingress | 2 × 512MiB | 1 | builder 종료 후 기동; 서비스 단계 합 **21.28125GiB** |
| 직렬 준비 tool | 기본512MiB, Besu generator1GiB | 동시 가산 안 함 | controller/전체 앱 준비 전 종료·제거, 위 최대보다 작음 |
| 호스트 launcher/감시·Docker daemon 추가 비용 | 미지정 | **기존23GiB에 명시적 포함 근거 없음** | 컨테이너 PID의 host RSS와 중복 합산 금지 |

한도 합은 실제 사용량/메모리 예약/최소 사양이 아니다. 각 `/tmp` tmpfs 한도(bootstrap256MiB, 앱64MiB)는 사용한 만큼 컨테이너 메모리에 반영되므로 별도 전량을 한도 합에 더하지 않는다. PostgreSQL shmem·page cache 역시 실제 cgroup 사용을 관측해야 한다. Docker daemon과 호스트 측 추가 비용이 모두 위 수치 안에서 제한된다고 주장하지 않는다. 과거 전달 리허설의 최소 available37.53GiB, Besu의 약433~445MiB 종료 시점 표본은 다른 소스/이미지의 역사 관측이며 현재 peak·필수 RAM 근거가 아니다. [원본](../artifacts/delivery-only-rehearsal-20261102.json)은 보존한다.

**현재 실행 정책:** 사용자는 이번 소유 batch에 한해 trust 준비/API 기동 후 최종 웹 생성만 서비스와 동시 실행하도록 승인했다. 웹 builder는2GiB·CPU1·90초, 전체 관측24GiB(호스트 시험 프로세스1GiB 포함), 시작 available40GiB·실행 여유16GiB, 정리 포함90분/마지막10분 신규 장기 단계 금지를 유지한다. 이는 다음 실행의 상시 허가나 검증된 최소 사양이 아니다. Docker daemon 등 공유 비용은 host available/PSI/OOM으로 별도 관측하며 소유 작업 사용량으로 직접 귀속하지 않는다. 압박·swap-out·OOM·관측 오류 중단 후 자동 재기동하지 않는다.

동일 구성을 별도 장비에서 시험한다면 linux/amd64, Docker/Python3.12+/UID1000, 위 설치 Chromium/라이브러리, 시작 available40GiB와 충분한 CPU 여유가 필요하다. 관측한 호스트는24논리 CPU이며 전용 장비에24 vCPU·64GiB RAM·빈 디스크30GiB 이상을 **준비 제안**으로 삼을 수 있으나 실측 최소 사양은 아니다. 전달 archive2.32GB와 unpacked image·새 chain/DB·로그/웹 build 공간을 확보하고 증가량을 제한한다. 새 identity/키를 만들고 기존 체인·DB·Anchor를 섞지 않는다. 내부 none namespace·loopback와 설치 controller만 사용하므로 개발 서버 IP/인증/키는 필요 없다. 실제 AWS 외부 TLS/NAT 검증은 별도다.

모든 실행은 명령별 timeout과 정리를 포함한 전체 deadline을 고정한다. 기존16GiB 여유 중단, `integration-pressure-v1`의 PSI/swap-out/OOM/관측 오류 조건과 소유 컨테이너 OOM·기존 작업 영향 중단을 유지한다. CPU idle/iowait·runnable/blocked·load 추세도 기록한다. 소량 swap-in만으로 원인을 단정하거나 과거 load138을 현재 부하 원인으로 사용하지 않는다.

전달 driver는 Docker build 전에 **두 FROM의 실제 로컬 config ID와 linux/amd64**를 확인하고, 추가 FROM/외부 COPY·ADD·Dockerfile frontend가 있으면 재검토를 요구한다. `--pull=false`만으로 다운로드 차단을 보장하지 않는다. bootstrap create/run은 `--pull=never`, 배포 start는 `--no-build --pull never`다. 일반 `app.Dockerfile`은 의존성 설치/온라인 base를 사용하는 별도 경로이므로 다운로드 없는 후보 검증에 쓰지 않는다. 기존 observer archive에는 새 사전 검사가 없으므로, 다음 실행은 검토한 새 driver의 source hash를 명시해야 한다. 제품 코드·runtime image는 변경하지 않았고 기존 후보/묶음/checksum은 덮어쓰지 않았다.


```bash
# All paths are reviewed local delivery/observer paths. No cloud or host configuration command.
umask 077
DELIVERY=/absolute/path/to/reviewed-delivery
OBSERVER=/absolute/path/to/NEW-observer-directory
mkdir "$OBSERVER"
(cd "$DELIVERY" && sha256sum -c SHA256SUMS)
tar -xf "$DELIVERY/observer-tests.tar" -C "$OBSERVER"
cd "$OBSERVER"
ROOT="$PWD/.local/media-delivery-$(date +%Y%m%d)-$(python3 -c 'import secrets; print(secrets.token_hex(4))')"
BROWSER_CACHE=/absolute/path/to/already-installed/ms-playwright
# Default is a non-executing plan. --apply is an explicitly authorized local integration operation.
python3 tests/integration/runtime-delivery-bootstrap.py --delivery "$DELIVERY" --root "$ROOT" --browser-cache "$BROWSER_CACHE"
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration timeout 600s python3 tests/integration/runtime-delivery-bootstrap.py \
  --delivery "$DELIVERY" --root "$ROOT" --browser-cache "$BROWSER_CACHE" --apply
APP="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["CALLSIGN_APP_IMAGE"])' "$ROOT/images-loaded.json")"
proof() {
  CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration CALLSIGN_RUNTIME_TEST_ROOT="$ROOT" \
    CALLSIGN_EXPECTED_RUNTIME_IMAGE="$APP" python3 tests/integration/runtime-media-driver.py "$@"
}
# Actual UI work/delegation/approval/consumption/audio/revocation. No external IdP or real microphone.
proof --delivery-files "$ROOT/public" --case delegation-revoke
```

bootstrap는 archive를 실제 load하고 ID/architecture를 대조한 뒤 새 key/network-config/genesis, Besu4/계약/Witness4, migration0000~0009·최소권한 LOGIN, 별도 PostgreSQL Anchor·TLS, 합성 내부 계정, PBX/TURN, controller를 준비한다. 기관 등록은 아직 pending 전 단계다. 제품 시험이 실제 로그인·공동 등록 API→worker→원장/Witness→DB confirmed를 확인한다. bootstrap의 `PREPARED_NOT_PRODUCT_PASS`를 제품 PASS로 합산하지 않는다. 일반 계정·서명은 합성 시험용이며 독립 승인자의 실제 키 보관을 검증한 것은 아니다.

같은 초기화 명령의 재실행은 기존 디렉터리/파일을 거절한다. foundation 이후 실패는 원본 output·ownership·키/genesis hash·이미지·namespace·volume을 확인한 뒤에만 위 bootstrap에 `--resume --apply`를 붙인다. 다른 소유 DB/volume, 다른 이미지/port/mount, 다른 checksum이면 SQL 전에 차단한다. foundation가 끝나기 전의 부분 키 생성은 자동 복구하지 않는다. 남은 파일을 검토해 같은 산출물을 보존하거나 새 시험 identity로 별도 시작한다. 일반 서비스 재시작은 이미지 entrypoint만 실행하며 준비·migration·provision을 호출하지 않는다. 시험 keeper/controller·TURN 자격은4시간, 시험 TLS는2일이며3시간이 지난 bootstrap resume은 거절한다. 기존 identity의 키나 이력을 갱신해 시험 시간을 연장하지 않는다.

후속 경계는 `--case session-expiry`, `--case pbx-outage device-denied device-absent`, `--case policy-change`, `--case key-change`로 선택한다. 자연 만료는 실제1시간 세션을 기다리며3900초 controller 제한을 사용한다. PBX 장애는 소유 Asterisk의 pause/unpause만 사용하며 host firewall을 조작하지 않는다. 장치 없음은 음성 장치가 없는 controller, 권한 거절은 해당 browser context의 실제 permission 거절로 확인한다. ARI cleanup의503을 성공으로 바꾸지 않으며 영속 상태의 정리 재시도와 실제 ARI 자원 부재를 확인한다.

다음 phase 전에 원본 로그·결과·controller 소스를 보호된 phase에 보존한다. 이 명령은 소유 앱/worker/web/ingress를 종료·제거하고 controller만 재시작한다. 체인·DB·Anchor·키를 초기화하지 않는다.

```bash
proof --archive-phase previous-phase-name
# Then run the selected next case(s), retaining the same protected runtime-test.env and identity.
proof --delivery-files "$ROOT/public" --case pbx-outage device-denied device-absent
```

정책 변경 후에는 API의 공동 확정·명시 활성화, 새 policy version의 trust 생성, web pin 재build가 필요하다. 키 변경은 자기 기관 정지→공동 복구→확정된 새 key 활성화→새 trust/web 게시 순서다. `key-change` 전에 기존 `prepare-finals.ts approval-key`로 새 **비활성** 버전2 파일과 별도 public manifest를 생성한다. `runtime-test.env`의 `CALLSIGN_PREPARED_TRUST`는 검토한 새 trust 파일 참조로만 변경한다. 구 키/VC/소비 이력·계정·Anchor를 삭제하거나 API가 보낸 키를 자동 신뢰하지 않는다. [권한·trust 전환](#trust-transition)을 따른다.

이번 합성 version1→2 순서는 아래와 같다. `INSTITUTION_ID`는 `$ROOT/synthetic-public-context.json`의 실제 생성값이며 임의 기관 값을 넣지 않는다. controller의 현재 ID/소유 label을 먼저 대조한다. 운영용 키 회전 명령이 아니며 보호 env는 출력하지 않는다.

```bash
INSTITUTION_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["institutionId"])' "$ROOT/synthetic-public-context.json")"
proof --archive-phase non-destructive-cases
proof --delivery-files "$ROOT/public" --case policy-change
proof --archive-phase policy-change
docker exec --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure \
  --env "INSTITUTION_ID=$INSTITUTION_ID" --env SERVICE_POLICY_VERSION=2 \
  --env PBX_DTLS_CERT_PATH=/run/callsign/tls/cert.pem "$(basename "$ROOT")-controller" \
  pnpm exec tsx scripts/prepare-finals.ts trust /run/callsign/data /run/callsign/prepared-trust-policy2.json --apply
docker exec --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure --env APPROVAL_KEY_VERSION=2 \
  "$(basename "$ROOT")-controller" pnpm exec tsx scripts/prepare-finals.ts \
  approval-key /run/callsign/data /run/callsign/public-manifest-v2.json --apply
# In protected runtime-test.env, select CALLSIGN_PREPARED_TRUST=/run/callsign/prepared-trust-policy2.json.
proof --delivery-files "$ROOT/public" --case key-change
proof --archive-phase key-change
docker exec --env CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure \
  --env "INSTITUTION_ID=$INSTITUTION_ID" --env SERVICE_POLICY_VERSION=2 --env APPROVAL_KEY_VERSION=2 \
  --env PUBLIC_MANIFEST_PATH=/run/callsign/public-manifest-v2.json \
  --env PBX_DTLS_CERT_PATH=/run/callsign/tls/cert.pem "$(basename "$ROOT")-controller" \
  pnpm exec tsx scripts/prepare-finals.ts trust /run/callsign/data /run/callsign/prepared-trust-policy2-key2.json --apply
# Select the new protected trust reference; the driver builds its corresponding web pin.
proof --delivery-files "$ROOT/public" --case session-expiry
```

자연 만료는 `/api/v3/auth/me?purpose=work`로 실제 세션401을 관측한다. `purpose`가 없는400은 인증 만료 판정이 아니다. phase archive는 원본 stderr와 자연 만료 관측 파일도 보존한다. 첫 실패를 삭제하거나 과거 PASS로 대체하지 않고 수정한 observer의 commit/archive hash를 함께 남긴다. 키 복구는 필수 정지에 의한 회수와 새 키 활성화·구 권한 부활 방지를 연결한 시험이며 정지를 생략한 독립 키 교체를 주장하지 않는다.

로컬 차이는 none keeper의 공유 loopback·validator별 RPC/P2P 포트, 합성 URI/OIDC/중앙 시험 승인자, 단기 시험 CA, 같은 호스트의 별도 Anchor 저장소, TURN의 loopback-peer 허용이다. AWS에서는 별도 서비스 주소·실제 origin/TLS/IdP·공개/NAT mapping·loopback 차단을 사용한다. 이미지·서비스 entrypoint·migration·업무/서명 검증 코드는 동일하지만 **AWS Compose override·외부 TLS/NAT/TURN은 이 리허설로 검증되지 않는다**. 웹 builder는 이번 host에서만 자식 환경의 `DOCKER_BUILDKIT=0`와2GiB/CPU1 제한을 사용하며 daemon 설정은 변경하지 않는다. [Docker 공식 build 옵션](https://docs.docker.com/reference/cli/docker/image/build/)을 따른다. 해당 builder가 없는 환경에서 자동 설치/우회하지 않는다.

로컬 nginx는 UID1000·cap-drop과 읽기 전용 root를 위해 pid/cache를 소유 `/tmp`로 옮기는 controller 생성 global config를 사용한다. AWS nginx 기본 실행 설정과 이 차이도 기록한다. 전달된 AWS HTTPS server config를 수정하지 않은 별도 component 시험에서는 명시적 시험 `web` DNS 별칭·합성 인증서로308/HTTPS 제품 파일을 확인했다. 해당 별칭 파일은 그 소유 container에만 mount하며 host/기존 namespace의 hosts/DNS를 변경하지 않는다. 이 component 결과는 AWS override 전체나 외부 인증서 성공이 아니다.

`ownership.json`에 기록한 ID와 현재 label을 대조한 후 이번 container만 stop/rm하고, volume도 같은 소유 label을 재확인한 뒤 제거한다. 증거부터 보존하며 다른 project나 전역 prune/down -v는 사용하지 않는다. 보호 env·signer key·브라우저 profile·합성 WAV·DB/체인 상태는 공개 전달물/Git에 넣지 않는다. 일회성 시험의 잔여 key/chain만으로 서비스 복원이 가능하다고 표시하지 않는다. 공개 전달물과 보호 자료를 분리해 승인된 외부 보관처에서 재수령·checksum 대조하기 전에는 외부 전달 완료로 보고하지 않는다.

<a id="reviewed-servicecall-analysis"></a>

### 검토 소스의 실제 ServiceCall·분석 통합 시험 (미실행)

이 절차는 기존 통합34건의 component host1건이 우회했던 **실제 ServiceCall·상대 음성→분석 패널**을 확인하기 위한 다음 실행이다. 이번 검토에서는 서비스를 기동하지 않았다. 위 NEW 리허설로 준비한 소유 identity·실제 원장/DB/Anchor/PBX/TURN과 **새 runtime/observer 묶음**이 필요하다. 기존 고정 Release에는 아래 추가 observer 파일과 종료 경합 수정이 없다.

```bash
# Separate execution approval and resource preflight required; not executed during source review.
# Use the proof() function and immutable APP from the NEW rehearsal above.
proof --delivery-files "$ROOT/public" --analysis-fixture --case work-cancel
# After preserving the first phase, select other existing revocation cases individually.
proof --archive-phase analysis-work-cancel
proof --delivery-files "$ROOT/public" --analysis-fixture --case emergency-stop
proof --archive-phase analysis-emergency-stop
```

`work-cancel`은 인증한 기관 담당자의 업무 취소 API, `emergency-stop`은 기관 정지 API→outbox→원장/Witness 반영을 사용한다. `proof`·ROOT·APP의 정의와 소유 identity 준비는 바로 앞 NEW 절차를 따른다.

`--analysis-fixture`는 별도 observer entrypoint와 작업 전용 보호 token을 명시적으로 mount한다. 서비스 제품 소스/의존성은 runtime 이미지에서 사용하고 인증·SQL·원장·Anchor·PBX는 실제 경로를 유지한다. 이 모드는 일반 issuer entrypoint 기동 검증과 구분한다. flag가 없으면 기존 일반 entrypoint를 사용하며 환경변수만으로 제공자 fixture를 선택하지 않는다. token·ownership·controller 소스는 보호 자료이며 공개 결과에 넣지 않는다.

검증 순서는 제품 로그인/업무/승인·소비/lease→구별되는660/990Hz 상대 음성 디코딩→실제 제품의 분석 동의→**remote receiver track만 MediaRecorder에 전달**→인증 WS 프레임→합성 전사·모델 응답→실제 ServiceCall의 패널→동의 철회/abort/늦은 응답 폐기→재동의 후 권한 회수→양 끝 상대 음성 중단·ARI404·종료 상태·추가 lease 거절·quota 예약0이다. 합성 응답은 정확도를 시험하지 않으며 원음/전사는 결과에 저장하지 않는다. 세션은 종료와 로그아웃을 구별하고, 업무/소비/정산 이력은 삭제하지 않는다. outbox는 해당 위임 철회/정지 작업 완료를 대조하며 다른 기관의 작업을 지우지 않는다.

`call-trial-CASE.json`은 기존 `CallObserver`의 동일 controller 단조 시계를 사용한다. 승인 요청·수락 동작·검증 표시·양방향 상대 음성·분석 입력/전사/결과/경고·회수 요청·화면 종료·실제 음성 회수·정리 관측을 연결한다. 원장 사례의 서버 적용은 `ledgerObservation`의 일치하는 event를 관측한 시점, chain-confirmed는 그 transaction receipt/block hash를 별도 조회해 확인한 시점이다. **조회 순서가 실제 발생 순서와 같지 않을 수 있어 역순 구간은 null이며 실제 확정→전파 지연이 아니다.** 누락 관측을0이나 과거 실측으로 채우지 않는다. 일반 반복 측정은 기존 `scripts/call-trials.ts`와 `infra/deploy/call-trials.example.json`을 사용하고 `analysis: "fixture"`, fixture 목록의 `analysis-adapter`, loopback control URL/보호 token 파일 참조를 명시한다. 이 경우 `ai-input`→`transcript`→`analysis`→`warning-visible` 관측이 순서대로 없으면 전체 성공으로 집계하지 않는다. 실패·timeout·시작 실패·미완료도 논리적 시도 분모에 남기며 재시도는 별도로 센다. 현재 이 새 경로의 성공률·지연은 **NOT_RUN**이다.

실제 외부 STT/LLM은 별도 단계다. 위 fixture 옵션 없이 승인된 제공자 모델/보호 자격·소량 예산·보관 조건과 동의한 한국어 입력을 준비해 [제공자/평가 절차](RUNBOOK.md#mentoring-fourth-validation)를 사용한다. 실제 사람/독립 평가 라벨로 품질을 판단하고, 제공자 취소·보관·청구를 합성 abort 관측으로 대체하지 않는다. 같은 namespace의 TURN은 AWS 외부 NAT 성공이 아니다. 종료 후 원본 실패/부분 관측을 보존하고 위 identity/label 기반 정리만 수행한다.

### 앞선 준비형 harness와 경로 계약

앞선 미디어 실행의 `tests/integration/runtime-media-driver.py`는 이미 준비한 **고유 disposable none namespace**를 소비했다. 현재 전달물 NEW는 위 bootstrap을 사용한다. 이 파일은 해당 준비를 대신하거나 현재 host의 포트를 공개하지 않는다. `ownership.json`·chain/deployment/public manifest·기관 등록·보호 role URL/secret/TLS·합성 WAV·설치 Node/Chromium이 필요하다. 생성은 기존 준비·migration·LOGIN 도구를 사용하고 새 identity와 기존 배포를 섞지 않는다. 세부 초기 chain/DB 순서는 [소유 원장·API 연결](#owned-ledger-runtime), SQL 준비는 [최소권한/복원 절차](RUNBOOK.md#application-cross-cluster-restore)를 따른다. 전달물 전용 NEW bootstrap은 바로 위 절차를 사용한다. 이 driver만 단독으로 실행해서 준비가 대체된다고 보장하지 않는다.

보호된 입력의 경로 계약은 다음과 같다. host의 `REVIEWED_OWNED_RUN_DIR`는 controller 안에서 `/run/callsign`으로 보인다. `REVIEWED_DOCKER_CONFIG_ID`는 공개 실행 증거의 `runtimeTransfer.images.runtime` 또는 보호 디렉터리 `runtime-final-image-id.txt`에서 읽는다. image archive의 네 ID 대조도 그 실행 증거를 사용한다.

| host 작업 디렉터리 아래 파일 | 필수 내용/생성 근거 |
|---|---|
| `ownership.json` | runId=`media-*`, directory, scope, 이번 container name/id/role 목록과 volume 이름. `directory`의 끝과 Docker label run-id가 같아야 함 |
| `synthetic-public-context.json`, `live-http-context.json` | runId/networkId/institutionId/institutionUri/serviceUri, publicAddresses의 administrator/stopper/approver1~3. live 문맥의 기관/배포 identity는 생성 기록과 일치해야 하며 등록 확정은 실제 원장·DB에서 별도 확인 |
| `data/public-manifest.json`, `data/deployment.json` | 기존 `prepare-finals.ts keys`와 실제 `deploy-service-registry.ts`·공동 등록 결과. genesis/code/artifact hash·chain/registry/institution/profile 일치 필수 |
| `data/issuer/approval-v1.json`, `data/sender/key.json`, `data/pbx/evidence.json`, Witness key | 역할별 보호 파일. 브라우저에 전달하지 않으며 기존 key를 다시 생성하지 않음 |
| `private-app.json` | ariPassword, base64url32byte pbxCredentialSecret, turnSecret, platformToken, senderToken. 모두 합성 시험용이며 `.env.example`의 해당 역할 설정에 대응 |
| `private-database.json` | 별도 시험 database와 anchorToken 및 이번 LOGIN의 보호 자격. DB/Anchor 준비 절차로 생성하며 기존 비밀번호를 복제하지 않음 |
| `runtime-test.env` | integration·OWNED_LOOPBACK_ONLY·OWNED_FINAL_IMAGE guard, container 기준 ROOT 두 개, TEST_DATABASE_URL(owner)와 ISSUER/AUTH/WORKER_DATABASE_URL, TEST_ANCHOR_TOKEN, NODE_EXTRA_CA_CERTS/PBX_DTLS_CERT_PATH, CALLSIGN_EXPECTED_RUNTIME_IMAGE. HOME/XDG_DATA_HOME은 쓰기 가능한 시험 profile |
| `tls/`, `asterisk/`, `sender.wav`, `recipient.wav` | 별도 시험 CA/leaf와 생성된 PBX 설정, 합성660/990Hz WAV. 운영 인증서·사람 음성은 사용하지 않음 |

controller는 Node/기존 workspace 의존성/설치 Chromium을 읽기 전용으로 받는 별도 시험 도구다. `ownership.json`에 등록한 `media-*-controller`여야 하고 `--init`이 없으면 driver가 거절한다. 이 controller 생성과 CA 등록은 승인된 작업자가 위 경로 계약을 확인한 뒤 수행하며 driver가 host를 자동 구성하지 않는다.

controller는 `--init`, RAM2GiB·CPU1·PID512, 작업 NSS profile과 loopback CA를 사용한다. 종료된 Chromium 자식을 회수하지 않으면 PID 상한에 도달할 수 있다. 한도를 자동 확대하지 않는다. 앱 역할과 시험 도구의 source mount를 혼동하지 않는다.

```bash
# AFTER explicit execution approval and owned prerequisite setup, not a bootstrap command.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration CALLSIGN_RUNTIME_TEST_ROOT="$REVIEWED_OWNED_RUN_DIR" CALLSIGN_EXPECTED_RUNTIME_IMAGE="$REVIEWED_DOCKER_CONFIG_ID" python3 tests/integration/runtime-media-driver.py
# Target only a previously failed scenario; other cases remain SKIPPED in that distinct report.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration CALLSIGN_RUNTIME_TEST_ROOT="$REVIEWED_OWNED_RUN_DIR" CALLSIGN_EXPECTED_RUNTIME_IMAGE="$REVIEWED_DOCKER_CONFIG_ID" python3 tests/integration/runtime-media-driver.py --case emergency-stop
```

driver는 이전 결과가 있으면 중단한다. 원본 로그/결과/request 파일을 보호된 별도 phase로 보존하고 소유 역할만 종료한 뒤 재시도한다. `CALLSIGN_RUNTIME_RESUME_OIDC`는 같은 공개 issuer 주소의 새 fixture를 쓰면서 DB/journal/Anchor를 보존하는 시험 전용 입력이다. 정상 로그인은 실제 start/callback을 다시 거친다. 정지·철회/세대 변경 뒤 과거 상태를 초기화해서 이 harness를 재사용하지 않는다. **앞선 미디어 환경은 emergency-stop 뒤 시험 DB/Anchor volume까지 정리했으므로 남은 파일로 위 명령을 재실행할 수 없다.** [정책·키·trust 전환](#trust-transition)의 공동 복구/새 trust 또는 별도의 새 disposable identity가 필요하다. 첫 실행의5 PASS는 공통 이미지와 logout/cancel/lease/revoke 네 통화, 재실행의2 PASS는 같은 공통 이미지와 emergency-stop 한 통화다.

실제 DB 회귀는 owner `TEST_DATABASE_URL`과 서로 다른 auth/issuer/worker/PBX `TEST_*_DATABASE_URL`을 요구한다. 모두 같은 `callsign_test_*` 대상이어야 한다. 이 URL은 보호 환경파일에만 둔다. 기존 validation runner와 Compose validation env는 다섯 URL을 소비한다. 새 migration, GRANT, row lock·접촉 저장·금지 UPDATE를 실제 제한 LOGIN으로 확인한다.

### 전달과 클라우드 전환의 남은 gate

**이후 승인된 target에서** archive hash를 확인하고 load한다. load는 기동이나 복원 성공이 아니다.

```bash
sha256sum "$REVIEWED_IMAGE_ARCHIVE"
docker image load --input "$REVIEWED_IMAGE_ARCHIVE"
# Compare each loaded configuration ID with image-transfer-final.json / public evidence.
```

현재 묶음에는 chain·DB·Anchor·키 전체 일관 snapshot이 없다. 기존 chain 잔여물에 빈 DB를 붙여 사용하거나 Anchor를 DB 백업 시점으로 되돌리지 않는다. 실제 이전은 source drain/fence→일관 chain/DB/key/metadata 준비→독립 Anchor 연속성→target 복구 gate·최소권한 확인→source가 정지한 상태의 target 활성화를 거친다. 기존 백업/복원 절차를 재사용한다. 같은 identity의 source/target 동시 쓰기는 허용하지 않는다.

클라우드에서 바뀔 origin·주소·TLS·OIDC callback·PBX/TURN 접근 정책과 새 공개 trust/web pin을 확인해야 한다. 현재 test web image의 loopback proxy와 합성 trust를 public 운영 값으로 취급하지 않는다. GCP 계정·과금·public exposure를 실행하지 않았다. 관측 RAM 표본/컨테이너 peak는 증거에 있으며 부하 peak·SLA·최소 VM 사양을 뜻하지 않는다. 측정된 idle 표본과 적용한 전체 memory cap의 합계를 참고할 수 있으나 최종 cloud 사양은 실제 외부 연결/부하 확인 전 미정이다.

다음 최소 입력은 외부 origin/TLS·실제 IdP 공개 client/audience/callback과 보호 참조, PBX/TURN의 외부 접근 환경, AI 제공자 보관 조건/보호 자격/소량 예산, 승인된 cloud 대상이다. 공개 DNS·방화벽·host 네트워크 변경과 과금은 별도 명시 승인 전 수행하지 않는다.


**현재 단계에서는 아래 실환경 명령을 실행하지 않는다.** 사용자 요청으로 해당 범주 실행이 명시적으로 승인된 뒤 운영자가 수행한다. 자동 차단은 보안 sandbox가 아니라 실수 방지 장치다. 기존 프로세스·키·볼륨·증거를 정리하거나 초기화하지 않는다.

<a id="owned-ledger-runtime"></a>

## 2026-11-01 격리 실행과 runtime archive의 사용 범위

[실제 결과](FINALS-IMPLEMENTATION-PLAN.md#isolated-runtime-20261101)는 기존 bridge/route/방화벽을 바꾸지 않기 위해 작업 전용 `--network none` keeper와 `--network container:소유_keeper`를 사용했다. 모든 RPC/DB/HTTPS/API는 그 namespace의127.0.0.1이고 Docker host port publish는 없다. 이는 공개 배포 구성이나 GCP 연결 시험이 아니다. Docker `none`/namespace 공유의 기능은 [Docker 문서](https://docs.docker.com/engine/network/drivers/none/), [네트워크 문서](https://docs.docker.com/engine/network/)를 따른다. 실제 host interface/route/network ID도 전후 대조했다.

### 재검증의 선행 자료

기존 `prepare-finals.ts keys`, `prepare-service-network.ts`, `generate-besu.sh`, `deploy-service-registry.ts`로 새 합성 배포를 준비한 뒤에만 실행한다. 생성 키는 보호 파일로 유지한다. 운영/이미 등록된 기관에 시험을 다시 실행하지 않는다. 시험은 노드·DB·Anchor를 자동 기동하지 않는다.

- `CALLSIGN_CHAIN_TEST_ROOT`에는 소유권 `ownership.json`, `synthetic-public-context.json`, 실제 `data/deployment.json`, `data/public-manifest.json`, 현재 `registry.json`, `private-keys` 보호 참조가 필요하다. chain suite는 등록·정책 변경·정지·복구를 실제 적용한다.
- live HTTP suite에는 별도 신규 합성 기관의 `live-http-context.json`과 `data/live-http-deployment.json`이 필요하다. 기존 공동 등록 payload로 실제 등록한 epoch1 상태를 확인하고, 같은 기관에 scope한 Witness4개를 구성한다. 빈 journal을 기존 epoch4 기관에 붙이면 recovery gate가 거절하며 이를 자동 보정하지 않는다.
- 전용 DB에 migration0000~0006과 `provision-logins.sql`을 먼저 적용한다. 보호 env 파일의 `TEST_DATABASE_URL`은 fixture 준비/관측용 owner, `ISSUER_DATABASE_URL`·`AUTH_DATABASE_URL`·`WORKER_DATABASE_URL`은 서로 다른 최소권한 LOGIN이다. Anchor는 별도 DB/로그인·TLS와 같은 institution/deployment의 명시적 zero checkpoint가 필요하다. DB 백업에 Anchor 저장소를 포함하지 않는다.
- 보호 env 파일은 `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration`, `CALLSIGN_LIVE_AUTHORITY_CONFIRMATION=OWNED_LOOPBACK_ONLY`, 위 root/DB 참조, `TEST_ANCHOR_TOKEN`, `NODE_EXTRA_CA_CERTS`를 전달한다. TLS 파일은 fixture root의 `tls.key`/`tls.crt`를 사용하며 key는0600이다. 실제 토큰·URL 비밀번호를 명령 인자나 Git에 넣지 않는다.

다음은 **준비된 소유 namespace 안에서만 쓰는 재검증 명령**이다. host에서 임의 실행하거나 기존 container ID를 대입하지 않는다. keeper/client·키·DB·기관 준비는 먼저 소유권과 상태를 확인한다. OIDC는 로컬 HTTPS fixture이며 실제 IdP 성공 판정이 아니다.

```bash
# 보호 env 파일로 loopback 시험 연결을 전달한다. 이 명령은 인프라를 생성하지 않는다.
timeout 90 docker exec --env-file "$PROTECTED_HTTP_ENV" "$OWNED_CLIENT_ID"   node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts   --configLoader runner --fsModuleCachePath /tmp/callsign-live-http-module-cache   --cache=false --reporter=json --outputFile=/run/callsign/NEW-http-results.json
```

live suite는 `buildFinalsServer`에 adapter를 주입하지 않고 실제 worker 진입점을 자식 프로세스로 실행·종료한다. PBX가 없으면 위임 등록·정지 같은 원장 작업은 가능하지만 PBX cleanup이 필요한 작업은 재시도 상태로 남는다. `ARI_URL`이 있으면 `ARI_AUTHORIZATION`도 필수다. 원장 등록을 완료하려고 fake ARI 성공을 사용하지 않는다. 테스트 fixture·private context·시험 키는 배포 image에 넣지 않는다.

### 오프라인 runtime 이미지와 클라우드 전달

`infra/deploy/app.Dockerfile`의 기존 `runtime`/`web` target을 유지하고, 설치된 Node/의존성을 재사용하는 `local-runtime` target만 추가했다. 별도 local build context의 `/runtime`은 Node·Corepack·필요 공유 library/라이선스, `/app`은 검토한 소스·lockfile·설치 의존성이다. 원래 workspace 경로를 **이미지 내부 경로**로 유지해 `verifyDepsBeforeRun: error`를 통과한다. 클라우드 host에 같은 절대 경로가 있어야 한다는 뜻은 아니다. 이번 이미지는 linux/amd64이며 다른 아키텍처를 지원한다고 가정하지 않는다. 외부 registry 접속·의존성 install 없이 `--network=none --pull=false`로 build했다.

[전달 기록](../artifacts/isolated-runtime-20261101/runtime-transfer.json)의 image ID는 `sha256:...`인 Docker config ID다. registry의 `repository@sha256:...` manifest digest와 다르며 서로 바꿔 쓰지 않는다. archive를 전달할 때는 보호 경로에서 파일 크기와 SHA256을 대조하고 새 대상에서 load한 뒤 같은 image ID/architecture인지 확인한다. 아래 **클라우드 명령은 이번에 실행하지 않았다.**

```bash
sha256sum "$RUNTIME_ARCHIVE"  # 전달 기록의 archiveSha256과 실제 비교
# 별도 실행 승인과 대상 확인 후에만 실행한다.
docker image load --input "$RUNTIME_ARCHIVE"
docker image inspect --format '{{.Id}} {{.Architecture}}' "$RUNTIME_IMAGE_ID"
```

이 archive에는 운영 비밀값·DB/Anchor/chain backup·실행 세션이 없으며 **전체 배포 패키지가 아니다.** 웹은 실제 기관 trust 생성→pin 고정→build가 남아 있고 PBX/TURN 이미지도 미준비다. 전체 release manifest의 clean commit/evidence 및 모든 역할 image 요구는 유지한다. 같은 소스를 클라우드에서 재설치해 동일한 의존성이 생긴다는 보증 대신, 검토한 불변 image/archive를 전달한다. 최종 image의 오프라인 build와 이전 image/소스에서 실행한 서비스 검증을 구분한다.

이후 실제 이전에서는 기존 drain/fence·암호화 application/chain backup 절차를 따르고 source와 target의 동시 쓰기를 금지한다. 기관/계약/genesis/키/epoch/소비 이력을 보존하며 독립 Anchor를 DB와 함께 과거로 복원하지 않는다. 주소·TLS·OIDC callback·TURN이 달라지면 공개 trust/web pin과 실제 연결을 다시 검증한다. 최종 클라우드 사양은 PBX·media·동시 통화의 실제 자원 관측 전에는 확정하지 않는다.

## 배포 후보와 실제 연결 순서

기준일2026-10-31, 조사 시작 `a6e2452`. 이 절은 현재 코드의 다음 실제 연결 절차이며 **아래 기동·생성·배포 명령은 이번에 실행하지 않았다.** 설정 준비와 소스 검사 통과는 실환경 연결 성공이 아니다. [검증·차단 기록](FINALS-IMPLEMENTATION-PLAN.md#release-candidate-20261031)을 함께 본다.

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
| 1 실행 위치·접근 | 기존 서비스와 분리한 시험 호스트 권장. 현재 호스트 기본 ledger 대역10.203.0.0/24는 기존 Docker 망과 중복됨. 신규 prefix10.206.0 제안은 현재 관측에서 비중복이며 아직 미적용. 기존 망/프로세스를 끄지 않고 별도 호스트 또는 peer/genesis/Compose를 함께 검토한 주소 정책 선택 | 실행 호스트·이미지 registry/접근 참조·충돌 없는 network 계획·소유 자원 식별자 | 첫 체인 기동 차단. GCP project/zone/IAM/VM 선택은 이전 단계까지 미룰 수 있음 |
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

## 현재 실행 계약

기본 서비스는 등록 URI·갱신형 통화 유지·Asterisk 경로다. 확인한 실제 구성요소와 fixture는 [현황](guide/05-IMPLEMENTATION-STATUS.md)을 따른다. 빈 DB 신규 설치는 현재 migration `0000`~`0010` 전체를 적용하고, 복원은 빈 대상의 역할 준비와 manifest 검증을 먼저 한다. 아래 절차 자체는 새 기동 허가가 아니다. 과거 GCP/직접 통화 구성과 AWS 기본 경로를 혼동하지 않는다.

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
| database | 소스 검사 통과(전체 설정 PASS와 별개), 별도 `callsign_test_*` DB, owner TEST_DATABASE_URL·별도 auth/issuer/worker/PBX TEST_*_DATABASE_URL, migration/GRANT 적용 완료 | 실제 독립 SQL 연결·잠금·소비·commit 후 응답 유실·quota·claim·migration hash·권한 | 모든 실제 assertion 실행/통과. pending/skip은 PASS가 아님. 자동 DB 생성/적용 없음 |
| chain | database, 실제 deployment/trust 파일 | 제한된 Foundry 계약 시험; Besu/Witness/정책·키 회수는 MANUAL | 다른 signer2·nonce/domain/legacy 거절; 같은 snapshot3 Witness, 구 VC/lease 회수의 실관측 필요 |
| media | database+chain, 같은 test 배포의 양측 로그인 storage·할당 업무·확정 위임·trust pin | 실제 PBX 시험은 배포 identity 선검사, 수락 전 송신 track 비활성/수신 디코딩 무음, 양측 RTP·decoded audio 에너지·logout 회수. TURN·철회/lease 경계는 MANUAL | HTTP200/연결 문구만으로 판정 금지. zero assertions/skip/identity 불일치 차단 |
| provider | media, 동의받은 작은 WebM/전사, 모델·키 참조, `CONSENTED-SAMPLE-WITH-BUDGET` 확인 | 기존 고정 provider smoke 각1요청; 동의 철회/늦은 응답/보관 조건은 MANUAL | 실제 final 전사·근거 일치 출력. 재시도 전 불명 요청/지출을 확인. 한국어 품질 평가는 별도 |
| recovery | database+chain, 별도 HTTPS anchor 단일사용 zero fixture | 실제 CAS 시험; 재시작/raw tx/실제 새 대상 복원은 MANUAL | 오래된 DB가 gate를 못 열고 옛 세션이 부활하지 않는 실관측. 원 배포는 정지/수정하지 않음 |
| performance | media+recovery, 실제 관측 JSON | 실제 측정 수집은 MANUAL, 오프라인 분위수 판정은 자동 | 각 구간100표본 이상·실패 수 포함·같은 monotonic 관측자. 부족하면 BLOCKED |
| cloud | recovery와 실제 동일 릴리스 manifest, `cloud-test` identity | GCP 이전·재시작·복원은 MANUAL; API/Terraform 자동 호출 없음 | 동일 image/contract/trust, 재초기화 없이 재시작·gate·미디어를 실제 확인 |

이후 **시험 환경의 준비와 별도 실행 승인을 모두 받은 뒤** 첫 서비스 검증 명령은 다음이다. `REVIEWED_TEST_ENV`는 운영 DB와 다른 owner TEST_DATABASE_URL·별도 auth/issuer/worker/PBX TEST_*_DATABASE_URL을 담고, 허용 플래그는 파일 안에 넣지 않는다. 먼저 offline의 light/web/runtime/rules 소스 검사를 통과해야 한다. 전체 서비스 preflight 차단은 DB 검증의 선행 PASS로 요구하지 않는다. DB 전용 입력은 database 단계에서 별도로 검사한다.

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

<a id="trust-transition"></a>

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
| INPUT-03 DB·키·독립 복구의 소유 경계 | migrate-finals, provision-logins.sql, signing-key, postgresAuthorityStore, consumption-anchor | 역할별 DB URL·서로 다른 LOGIN, 보호 키/비밀번호/token 파일 참조, FINALS_ACCOUNTS_PATH, 독립 HTTPS anchor. 비밀/개인정보 보호 | DB owner·역할별 키 소유자·별도 anchor 관리자: 기존 대상의 보존과 새 시험 DB 분리. anchor를 서비스 백업과 함께 복원하지 않음 | 첫 database는 owner TEST_DATABASE_URL와 별도 auth/issuer/worker/PBX TEST_*_DATABASE_URL이 필수. 실제 계정/키/anchor는 이후 해당 단계에서 요구 |
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

필수 조건: test: 배포 ID와 DEPLOYMENT_ID 일치, 운영 DB와 다른 `callsign_test_*` DB에0000~0010 적용 및 역할 GRANT 완료, TEST_DATABASE_URL=시험 owner, TEST_AUTH/ISSUER/WORKER/PBX_DATABASE_URL=같은 시험 DB의 서로 다른 역할 LOGIN. 미래 준비 명령은 기존 migration/provision-logins 절차를 사용한다. AI/OIDC/PBX/기관 등록/실제 trust를 DB 경계 시험 선행 조건으로 추가하지 않는다. 결과는 NEW-DATABASE JSON/고정 sidecar·진행 파일이다. assertion 미실행/skip·권한 과다·hash 불일치·guard/identity 불일치·실패·timeout이면 중단한다.

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

PG_TEST_ENV는0700 임시 디렉터리의0600 파일로 POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD만 담는다. 비밀번호는 시험용으로만 생성하고 명령 argv/증거/Git에 넣지 않는다. 별도 보호 TEST_ENV에는 test: DEPLOYMENT_ID, owner TEST_DATABASE_URL, 같은 DB의 별도 auth/issuer/worker/PBX TEST_*_DATABASE_URL을 둔다. Docker internal network에서는 이 환경의 host port mapping이 생성되지 않았으므로 동일 옵션으로 무조건 재시도하지 않는다. localhost port 연결과 시험 DB 이름/label을 확인한 다음에만 migration을 적용한다.

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

통과 조건은 JWT 실패 경계·정확한 issuer/subject·work/official 분리·CSRF·재인증·계정 회수·실제 DB 행/outbox·동시 소비의 같은 서명 영수증·lease 서명 및 브라우저 클릭 결과다. HTTP200/문구만으로 판정하지 않는다. Chromium 소스는 현재 ROOT의 단일 시험 인증서 SPKI만 자식 browser launch 예외로 허용하고 context 전체 `ignoreHTTPSErrors`를 사용하지 않는다. Node↔OIDC는 추가 CA로 검증한다. 이 시험 SPKI 예외는 운영 인증서 chain/만료 검증이 아니며 최신 Chromium 실행은 아래 자원 차단 기록을 따른다. 운영 TLS/실제 IdP 호환성의 검증이 아니다.

각 단계는120초 이내, worker1로 실행한다. DB512MiB 외 Node/브라우저 예산2GiB를 잡고 가용 메모리8GiB 미만·지속적 swap 입출력·기존 작업 영향이면 중단한다. 정상 종료 시 app·Vite·fixture·browser를 닫는다. 강제 timeout 때에는 **이번 실행이 만든 자식 process group**만 회수하고, DB label/identity를 대조한 후 해당 컨테이너만 제거한다. 전역 prune/pkill을 사용하지 않는다.

스크린샷은 ROOT 아래 고유 `run-*` 디렉터리의 `service-mobile.png`/`service-desktop.png`다. cookie/storage/trace는 저장하지 않는다. 공유 전 합성 계정만 들어 있는지 확인하고 실제 API/DB 결과·코드 hash와 함께 보존한다. 보호 ROOT에는 테스트 개인키와 인증서가 있으므로 통째로 커밋하지 않는다. 증거 추출 후 이번 자원과 보호 파일만 제거한다.


<a id="mentoring-integration-unix"></a>

### 최신 변경의 Unix socket 검증과 자원 차단

2026-11-03 실제 DB5파일17시험은 통과했지만 HTTP/WS/Chromium은 연속 swap으로 assertion 실행 전 BLOCKED다. 승인된1회 재개도 같은 조건으로 중단했으며 추가 기동하지 않았다. [소스·실행·정리 증거](../artifacts/mentoring-integration-20261103.json)를 따른다. 아래는 **별도 실행 허가와 안정된 자원이 준비된 이후** 사용할 절차이며 지금 실행한 성공 명령 목록이 아니다.

- 기존 로컬 PostgreSQL17.6 이미지만 사용한다. `--network none --cpus 1 --memory 512m --memory-swap 512m --pids-limit 128`, PGDATA tmpfs512MiB, `listen_addresses=''`로 제한한다. 새0700 ROOT의 전용 하위 socket 디렉터리만 `/var/run/postgresql`에 mount한다. root 자신은0700을 유지하며 socket 하위 mount의 초기 권한만 entrypoint 요구에 맞춘다. 사용자 socket/DB·bridge/port publish를 사용하지 않는다.
- 공식 entrypoint의 임시 초기화 서버와 최종 서버를 구분한다. init 완료와 최종 ready를 확인하고 socket의 단순 존재를 readiness로 간주하지 않는다. `/run/callsign`만 지정하면 entrypoint의 초기 psql이 기본 socket을 찾지 못할 수 있다.
- `CALLSIGN_TEST_PG_SOCKET`은 위 ROOT 하위 실제 socket 디렉터리다. 테스트 전용 transport는 URL의 시험 DB·서로 다른 LOGIN·비밀번호를 그대로 유지하고 **실제 postgres3.4.9 driver의 host 옵션만 Unix socket으로 지정**한다. DB 응답·권한·transaction을 mock하지 않는다. CLI Node preload와 Vitest setup을 구분하며 production 자동 fallback을 추가하지 않는다.
- 일반 migration CLI는 명시한 owner URL에 적용한다. `integration` 변수만으로 대상 소유가 자동 확인되는 것은 아니므로 이번 시험에는 위 소유 socket preload를 반드시 함께 사용한다. CLI migration에는 명시적 integration 환경과 owner URL을 사용한다. 기본 명령은 계속 dry-run이며 `--apply`만 전체 적용한다. `applyMigrations`의 prefix 인자는0009→0010 시험 준비용이며 CLI restart/복구가 DB를 다운그레이드하거나 이력을 지우지 않는다.
- 모든 URL/비밀번호·TLS 키는 ROOT의 보호 파일/환경으로 공급한다. 명령 인자에 원문을 쓰지 않는다. Node22.22.2·설치된 pnpm/의존성으로 확인했으며 Node resolve-hook 미지원 버전은 다운로드로 우회하지 않는다.

```bash
# Explicitly reviewed protected environment and owned database are already prepared.
: "${CALLSIGN_HTTP_TEST_ROOT:?owned 0700 root}" "${CALLSIGN_TEST_PG_SOCKET:?socket under root}"
: "${MIGRATOR_DATABASE_URL:?protected owner URL}" "${NODE_EXTRA_CA_CERTS:?fixture certificate}"
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration   NODE_OPTIONS="--max-old-space-size=512 --import=tsx --import=$(pwd)/tests/integration/postgres-unix.mjs"   timeout 60s node scripts/migrate-finals.ts --apply
# Vitest config selects guarded socket setup itself; do not also preload tsx/Node hooks into workers.
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration NODE_OPTIONS=--max-old-space-size=1024   timeout 150s node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts   tests/integration/finals-store.test.ts tests/integration/finals-session-scopes.test.ts   tests/integration/service-runtime.test.ts tests/integration/database-readiness.test.ts   tests/integration/migration-upgrade.test.ts --reporter=json --outputFile=artifacts/NEW-DATABASE.json
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration NODE_OPTIONS=--max-old-space-size=1024   timeout 240s node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts   --reporter=json --outputFile=artifacts/NEW-HTTP.json
```

worker1·앱/브라우저 합산3GiB·임시5GiB는 관측 상한이고 DB512MiB는 강제 상한이다. 기존 작업에 RAM8GiB 이상을 남긴다. 실행별 deadline·소유 자식 process group·DB label/ID·보호 ROOT를 기록하고 지속 swap·기존 작업 영향·예산 초과 시 이번 대상만 중단한다. 중단을 SKIP/PASS로 바꾸거나 자동 재개하지 않는다. 앞선 실행의 watchdog은10초 구간의 swap page 카운터가3구간 연속 바뀌면 중단했다. 정확한 속도와 원인을 보존하지 못했으므로 OOM이나 서버 전체 메모리 부족으로 단정하지 않는다.

새 analysis/recall HTTP·Chromium 시험 소스는 타입 검사만 했다. ARI는 DELETE 성공 뒤 GET200/503/404를 fetch fixture로 구분하고 실제 ServiceAuthority/PbxRuntime·SQL 관측을 거치도록 작성했으며 실제 PBX·음성 회수의 성공 증거가 아니다. 최종 통합 검증에는 안정된 허가 환경에서 같은 DB의 재실행/상태 오염과 HTTP/WS/Chromium을 확인해야 한다. runtime에 포함되는 migration CLI가 바뀌므로 향후 새 runtime/공개 묶음에 포함한다. 기존 고정 Release·이미지는 변경하지 않으며 이번에는 발행하지 않는다.

<a id="http-pressure-policy-20261103"></a>

### 이번 통합 시험에 승인된 자원 정책

`integration-pressure-v1`은2026-11-03 시험의 운영 기준이며 보편적인 안전 기준이 아니다. 기본값은 기존 `swap-activity-v1`이다. 새 정책은 **각 observe/watch/run 명령에 `--policy integration-pressure-v1`을 명시**하고, identity의 `resourcePolicy`와 관측/결과 정책이 일치해야 한다. 환경변수만으로 선택되지 않는다. 이전 중단 원본과 기준은 아래 역사 기록에 보존한다. 이번 실행은 종료했으며 다음 기동은 별도 허가 범위를 확인한다.

5초 간격·첫 기준점부터60초 동안 사전 관측한다. MemAvailable<8GiB, 앱/브라우저/observer RSS>3GiB, 임시 디스크>5GiB, 작업 OOM/host oom_kill 증가, PSI some avg10>=10% 또는 full>=2%가3표본 연속, swap-out>=5MiB/s가3구간 연속, 필수 관측 누락/불일치, 명령/전체 deadline, 구체적인 기존 서비스 영향이면 중단한다. swap-in/소량 swap-out만으로 중단하지 않는다. PSI total 증분과 실제 구간 길이/page 크기를 보존한다. DB CPU1/memory512MiB는 강제 제한이고 RSS/disk는 관측 예산이다. 전체5400초에는 정리가 포함된다. watcher 인계 후에도5초 간격을 유지하고 표본 freshness는7초 이내다. Node heap OOM·container OOM·호스트 OOM은 구분한다.

아래 기존 소유 ROOT/Unix socket/migration/provisioning 절차를 그대로 쓰되 승인된 다음 실행에서 명령은 다음처럼 선택한다. 문서 확인을 위해 서비스를 기동하지 않는다.

```bash
python3 scripts/validation-resource-control.py --policy integration-pressure-v1 observe "$RUN_DIRECTORY"
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration python3 scripts/validation-resource-control.py --policy integration-pressure-v1 watch "$RUN_DIRECTORY" &
WATCHER_PID=$!
# 앞서 설명한 EXIT cleanup trap과 observer PID/freshness 확인을 유지한다.
step() { CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration python3 scripts/validation-resource-control.py --policy integration-pressure-v1 run "$RUN_DIRECTORY" "$@"; }
CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration python3 scripts/validation-resource-control.py --policy integration-pressure-v1 run "$RUN_DIRECTORY" readiness 45 node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/database-readiness.test.ts
```

압박 정책을 선택한 `run`의 하위 준비 CLI에도 같은 옵션을 명시한다. 바깥 launcher의 옵션은 별도 자식 argv로 자동 전달되지 않는다. 누락하면 `EXPLICIT_RESOURCE_POLICY_MISMATCH`로 차단되며 DB readiness나 migration 성공으로 기록하지 않는다.

```bash
step final-ready 30 python3 scripts/validation-resource-control.py --policy integration-pressure-v1 wait-database "$RUN_DIRECTORY"
step roles 45 python3 scripts/validation-resource-control.py --policy integration-pressure-v1 provision-logins "$RUN_DIRECTORY"
```

B/C 필터는 아래 절과 같으며 D에는 새 `analysis Chromium:`을 포함한다. 종전25개 정적 목록은 매개변수 사례7개를 놓쳤다. 현재 실제 사례는 원래32개+추가2개=34개이며 reporter의 실제 이름으로 배정을 대조한다. 추가 분석 Chromium은 실제 WS·동의·분석 결과를 **제품 패널의 component host**로 렌더링하며 ServiceCall/PBX 수신 오디오까지 연결한 시험은 아니다.

```bash
# 기존 step의 run에 명시적 pressure policy를 적용하고 API_ONLY를 제거한 뒤:
step chromium 300 node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts --testNamePattern '^(renders the actual service|recall Chromium:|analysis Chromium:|boundary: (reviews and exports|shows durable|synchronizes work logout|drops a held|disables ungranted|recovers a committed))'
```

오디오 종료는 소켓/분석기 중단→진행 작업과 quota 정산 drain→quota pool 종료 순서다. 종료가 consent transaction 또는 session 조회를 기다리는 동안 발생하면 이후 provider/watch를 새로 시작하지 않도록 수정하고 오프라인 경합 회귀로 확인했다. 이 수정 경로의 실제 서비스 재검증은 미실행이다. 최종 권한 검사 중 취소돼 제공자를 호출하지 않은 LLM 예약은0으로 해제한다. 정산 실패나5초 drain timeout은 종료 성공으로 바꾸지 않는다. 제공자 호출 전 취소는 예약 해제0, 호출 뒤 취소는 기존 보수적 요청 사용량1을 정산하며 실제 제공자 청구/취소 성공을 뜻하지 않는다. fixture teardown은 미정산 예약을 삭제하기 전에 assert한다. 잔류 감사가 실패하면 데이터를 지워 통과시키지 않는다. 이번 최초DB의 balance17개는 수정하지 않고 실패 기록으로 보존했고, 같은 cluster의 추가 회귀DB에서 전체 수정 소스와 동일DB 재실행을 확인했다. 역할 LOGIN은 그대로 재사용하고 migration/table GRANT/readiness를 새 DB에서 확인했다. 기존 LOGIN provisioning SQL을 재적용해 비밀번호를 교체하지 않았다.

강제 종료는 graceful drain과 다르다. 기존 worker의 `serviceMaintenance.tick()`은 만료된 reserved 행을 잠그고 전액 사용으로 보수 정산한다. 분석 예약은 현재24시간 뒤 만료되며 정상 worker가 유지보수를 수행해야 한다. 제공자 결과를 모르므로 자동 환불/청구 대조가 아니다. 이번 검토에서 이 crash 경로는 실행하지 않았다. 시험DB의 이미 삭제된 예약17개를 되살리거나 balance를0으로 맞추지 않는다. 저장소에서 영향받은 보존 배포는 확인되지 않았고 기존 영속 환경 영향 여부는 미확인이다.

[이번 실행 증거](../artifacts/http-pressure-integration-20261103.json)는 HTTP11/WS14/Chromium9, 동일DB3건 재실행과 전후 감사, 초기 실패·자원·정리를 구분한다. 원장/ARI/STT/LLM/Anchor/binding은 fixture이며 실제 음성 회수·한국어 품질·AWS를 검증한 것이 아니다. 새 runtime과 최종 trust/인증서에 맞춘 웹·공개 묶음은 별도 발행이 필요하며 기존 고정 Release/digest는 변경하지 않았다.

<a id="http-resource-resume-20261103"></a>

### HTTP·WS·Chromium 재개: 자원 관측과 단계별 중단

2026-11-03 후속 사전 관측은 **서비스 시작 전 BLOCKED**다. 10초 swap-in 속도가 약0.00039→0.0498→0.1959MiB/s로 세 구간 연속 증가했고, 마지막 MemAvailable은28.4GiB·memory PSI 평균은0이었다. 관측 대상 앱 RSS는0이며 컨테이너는 없었다. 호스트 전체 swap의 발생 주체나 OOM을 입증하지 않는다. [관측 원본과 검사 결과](../artifacts/http-resource-preflight-20261103.json)를 보존하며 이번에는 재기동하지 않는다.

기존 로컬 watchdog/launcher를 `scripts/validation_resources.py`와 `scripts/validation-resource-control.py`로 공유했다. 최초 표본은 기준점이고 실제 page 크기·monotonic 경과 시간으로 in/out을 따로 계산한다. 기존1초·10초 관측 모두 **어느 방향이든 양의 swap 증분이3구간 연속이면 중단**하며 새 속도 하한은 없다. 카운터 감소/시계 역행은 swap 압력으로 분류하지 않고 관측 불일치로 차단한다. 이 계산 오류가 과거 중단 원인이었다는 증거는 없다.

다음 명령은 **별도의 재개 허가 이후** 사용할 자료다. 이번 자원 중단을 자동 재시험하지 않는다. 첫 명령은 서비스·키·컨테이너 없이 읽기 전용 관측만 한다. 새 보호 디렉터리여야 하며 과거 stop 파일을 지워 재사용하지 않는다.

```bash
RUN_DIRECTORY="$(pwd)/.local/http-resume-$(date -u +%Y%m%dT%H%M%SZ)"
python3 scripts/validation-resource-control.py observe "$RUN_DIRECTORY"
# exit2: BLOCKED. 다음 명령·환경 생성 없이 관측 파일을 보존하고 종료한다.
```

실제 재개 시에는 위 Unix socket 절의 기존 절차로 **새 identity**를 준비한다. PostgreSQL은 `docker run` 대신 동일 인자의 `docker create --pull=never`로 먼저 생성하되 시작하지 않는다. 기존 local prepare.py는 DB를 즉시 시작하므로 그대로 재사용하지 않는다. 공개 image tag만 믿지 말고 로컬 ID/amd64와 소유 label·NetworkMode=none·PortBindings 없음·CPU1·memory/swap512MiB·PGDATA tmpfs512MiB를 대조한다. 보호 ROOT는0700이고 그 안에 시험 자격/env·localhost CA·socket만 둔다. 보호 자료 생성과 container create는 위 읽기 전용 관측 명령의 동작이 아니며 이번에 수행하지 않았다.

`RUN_DIRECTORY`와 ROOT는 서로 달라도 되지만 `RUN_DIRECTORY`의 basename을 runId·ROOT basename·DB label Docker label key `callsign.test`의 value에 동일하게 사용한다. `identity.json`은 `runId`, `root`(절대 경로), `containerId`(실제 전체 ID), `container`, `bootIdHash`, `deadlineMonotonicNs`를 기록한다. `bootIdHash`는 `/proc/sys/kernel/random/boot_id` 파일 bytes의 SHA-256이며 호스트 재부팅 후 기존 monotonic deadline을 재사용하지 못하게 한다. deadline은 준비 시작 때 `time.monotonic_ns()+5400_000_000_000`으로 계산하며 정리도 포함한다. ROOT의0600 `environment.json`에는 허용된 자식 환경만 기록한다. 이전 셸의 전체 환경/외부 제공자 자격을 복사하지 않는다. 필요한 값은 다음과 같다.

- `PATH`, `HOME` 등 설치 도구에 필요한 비민감 환경, `CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration`, `CALLSIGN_HTTP_TEST_ROOT`, `CALLSIGN_TEST_PG_SOCKET`, `NODE_EXTRA_CA_CERTS`, `NODE_OPTIONS=--max-old-space-size=1024`.
- 동일 `callsign_test_*` DB의 `TEST_DATABASE_URL`·`MIGRATOR_DATABASE_URL`과 서로 다른 `AUTH_DATABASE_URL`·`ISSUER_DATABASE_URL`·`WORKER_DATABASE_URL` 및 대응 `TEST_AUTH/ISSUER/WORKER/PBX_DATABASE_URL`. URL 원문은 보호 파일에만 둔다.
- 위 migration CLI와 `infra/deploy/provision-logins.sql`이 사용하는 역할별 보호 비밀번호 참조. owner로 앱을 실행하지 않는다. 현재 소스의 socket preload/setup·환경 검사는 그대로 유지한다.

준비가 끝난 뒤 **새 관측을31초 수행하고 즉시 watcher로 인계**한다. 기존 관측 종료 후 준비 작업을 오래 수행한 자료는 재개 근거로 쓰지 않는다. `observe`는 준비된0700 디렉터리도 받지만 이전 관측/stop 파일이 있으면 거절한다. 인계 간격2초 초과·observer 종료·표본 stale이면 새 단계는 차단된다. 명령들은 저장소 루트에서 순서대로 수행하고 **비0 종료 시 뒤 단계는 시작하지 않는다**.

```bash
set -e
export CALLSIGN_ALLOW_EXTERNAL_EXECUTION=integration
# 새로 준비한 RUN_DIRECTORY, ROOT, containerId를 대조한 뒤 한 번만 관측한다.
python3 scripts/validation-resource-control.py observe "$RUN_DIRECTORY"
python3 scripts/validation-resource-control.py watch "$RUN_DIRECTORY" &
WATCHER_PID=$!
cleanup_run() {
  result=$?
  trap - EXIT
  python3 scripts/validation-resource-control.py cleanup "$RUN_DIRECTORY" || result=2
  wait "$WATCHER_PID" || true
  exit "$result"
}
trap cleanup_run EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# watcher 실행 직후에만 아래 argv 기반 helper를 사용한다. 설정 문자열을 shell로 평가하지 않는다.
step() { python3 scripts/validation-resource-control.py run "$RUN_DIRECTORY" "$@"; }
step startdb 30 docker start "$OWNED_CONTAINER_ID"
step final-ready 30 python3 scripts/validation-resource-control.py wait-database "$RUN_DIRECTORY"
# 최종 PG entrypoint + 실제 SELECT 1 이후에만 migration을 시작한다.
step migrate 60 node --import tsx --import "$(pwd)/tests/integration/postgres-unix.mjs" scripts/migrate-finals.ts --apply
step roles 45 python3 scripts/validation-resource-control.py provision-logins "$RUN_DIRECTORY"
# 기존 SQL을 그대로 적용하며 보호 자격은 Docker exec의 환경 참조로만 전달한다.
step readiness 45 node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/database-readiness.test.ts
```

직접 Docker 하위 명령은 소유 DB `start`만 허용한다. 위 `wait-database`/`provision-logins`는 `run`이 등록한 PID/start의 자식에서만 동작하며 실제 container ID/label/network/budget를 재검사한다. 기존 `infra/deploy/provision-logins.sql`의 기존 LOGIN 거절·transaction을 그대로 사용하며 일반 재시작에 다시 적용하지 않는다. 실제 SQL/hash/역할 확인은 다음 readiness assertion으로 판정한다. 이 준비 하위 명령은 이번에 정적 검사만 했으며 실제 새 DB에서 실행하지 않았다.

A의 actual SQL/hash/LOGIN 확인 후 B→C→D로 나눈다. API-only 단계는 `environment.json`의 `CALLSIGN_HTTP_API_ONLY=true`를 사용해 Vite를 띄우지 않는다. D 직전에 이를 제거한다. 환경 변경은 앞 자식이 종료하고 다음 단계가 시작되기 전에만 한다. 아래 필터는 현재 두 파일의 준비된 모든 시나리오를 B/C/D 중 하나에 배정하며, 선택되지 않은 SKIP은 성공에 합산하지 않는다.

```bash
step http-auth 180 node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts tests/integration/service-http.test.ts --testNamePattern '^(?!renders the actual service)'
step http-recall 180 node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts tests/integration/service-boundaries.test.ts --testNamePattern '^(recall HTTP/SQL:|boundary: rejects replayed joint|boundary: separates first-connect|boundary: preserves a live synthetic)'
step analysis-ws 240 node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts tests/integration/service-boundaries.test.ts --testNamePattern '^(analysis HTTP/WS:|boundary: stops analysis transport|boundary: stops a pending model)'
# 보호 environment.json에서 CALLSIGN_HTTP_API_ONLY를 제거한 뒤 실행한다.
step chromium 300 node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts --testNamePattern '^(renders the actual service|recall Chromium:|analysis Chromium:|boundary: (reviews and exports|shows durable|synchronizes work logout|drops a held|disables ungranted|recovers a committed))'
```

E는 같은DB에서 B/C/D 중 영향받는 시나리오만 **새 label**로 재실행하고, 전후에 보호 environment.json에 `CALLSIGN_HTTP_AUDIT_CONFIRMATION=NO_ACTIVE_HTTP_FIXTURES`를 설정해 다음 SQL 감사를 수행한다. 일반 suite 전에 확인값을 제거한다. 시험 전용 빈DB에서 시작하고 active fixture가 없을 때만 권한/outbox/session/미정산quota 잔류를 assert한다. 데이터를 지워 통과시키지 않으며 정당한 usage 정산 이력은 보존한다. 이번E는 미실행이다.

```bash
step cleanup-audit 45 node node_modules/vitest/vitest.mjs run --config vitest.http.config.ts tests/integration/http-cleanup.test.ts
# 정상·실패 모두 증거를 먼저 보존한 뒤 소유 앱/브라우저→DB 순으로 정리한다.
exit 0 # EXIT trap이 정상·실패 모두 소유 cleanup을 실행한다.
```

자원 중단은 최초 원인을 `environment-stop.json`에 고정하고 새 단계를 거절한다. 실행 중 테스트에 SIGINT로 부분 결과/afterAll 기회를 주고, PID와 start tick이 일치하는 소유 자식만 TERM/KILL한다. 앱 정리가 확인되지 않으면 DB를 먼저 내리지 않고 미완료를 기록한다. Vitest progress에는 시험명/판정만 남기며 기존 FAIL을 환경 BLOCKED로 숨기지 않는다. `resource-samples.jsonl`, `*.result.json`, `environment-cleanup.json`을 대조하고, assertion0은 PASS가 아니다. 프로세스 종료 후에도 자식이 남거나 정리 오류가 있으면 수동 소유 identity 확인이 필요하다. 실제 다중 서비스 정리와 observer 인계는 이번에 실행되지 않았으며 오프라인 자식 취소/부분 결과·차단 회귀만 통과했다.

DB의512MiB/CPU1은 강제 제한, 앱/브라우저/observer 합산RSS3GiB·임시5GiB·RAM reserve8GiB는 관측 상한이다.1초 sampling은 순간 peak를 보장하지 않는다. deadline40초 전부터 새 단계를 차단해 정리 시간을 남긴다. 임시 디스크 표본은 소유 ROOT/기록 디렉터리의 파일과 PGDATA512MiB 상한을 합산한 범위다. 공유 도구 cache나 ROOT 밖의 브라우저 임시 profile을 포함한 호스트 전체 임시 공간의 peak로 해석하지 않는다. container `OOMKilled`·Node heap 오류·호스트 PSI/swap을 각각 기록하며 서로 원인으로 단정하지 않는다. Python CLOCK_MONOTONIC과 Vitest process hrtime은 관측자/clock 이름을 구별하고 시각을 직접 빼지 않는다.

`cleanup`은 소유 DB를 **중지**하며 container/보호 파일을 임의 제거하지 않는다. 공개 증거를 선별한 뒤 선언한 container ID·label·ROOT와 PID를 대조해 이번 stopped container 및 ROOT만 제거한다. 전역 prune/kill·기존 권한 변경·swap 설정 변경은 하지 않는다. 모든 종료 경로에 cleanup을 `trap`으로 등록하되 비밀 포함 로그는 공개하지 않는다. 중단 latch를 지우거나 새 identity를 자동 생성해 재개하지 않는다.

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



<a id="mentoring-five-evaluation"></a>

### 5차 평가·후보 인계

`tests/fixtures/service-purpose-evaluation.json`은 합성30사례이며 모두 `humanReview: not-reviewed`다. 개발용/평가용을 사례군 `family`로 분리한다. 파서 상한50은 외부 호출 허가가 아니다. `evaluate-service-analysis.ts --provider`는 **평가용만 최대20회**, 각4초·직렬·재시도0으로 제한한다. 기존 source/image·보호 제공자 참조·비용/보관 승인 guard를 유지하며 이번에는 호출하지 않았다. 미실행 사례는 NOT_RUN으로 남고 판단 불가율은 관측 사례만 분모로 사용한다. 실제 제공자 text 평가는 STT·실제 한국어 음원 품질과 별개다. 별도 승인된 음원 평가에는 기존 provider-smoke/통화 분석 경로가 필요하며 합성 replay를 정확도로 집계하지 않는다.

무호출 준비 확인은 `pnpm exec tsx scripts/evaluate-service-analysis.ts tests/fixtures/service-purpose-evaluation.json NEW_OUTPUT.json`이다. 이 명령은 결과 파일을 새로 만들며 언어 품질을 시험하지 않는다. 실제 호출에는 기존 [4차 실행 조건](RUNBOOK.md#mentoring-fourth-validation)을 따른다.

통화 집계에 `authorization-response`, `pbx-absent` 관측을 추가했다. 승인 응답은 실제 POST 응답 성공을 확인한 controller 시각이며, 승인 표시/검증 완료와 별도다. runtime-media의 PBX 부재는 ARI 채널2개·브리지의 실제404를 모두 확인한 뒤 기록한다. 실제 음성 중단은 양 끝점 decode 관측을 그대로 요구한다. 누락 구간은 `missing-endpoint`, 역순은 `reversed-order`로 남기며 타이머/0으로 채우지 않는다. smoke2회는 전체 성공률/SLA가 아니다.

현재 후보 e95b653/runtime dfee3789와 고정 Release `aws-bootstrap-20261102t093531z`에는 이번 UI·측정·평가 변경이 없다. 다음 발행은 검증 소스 고정→새 runtime→공개/observer 묶음→layer/context 감사→비공개 GHCR→실제 registry digest→새 고유 Release→별도 수령 검증 순서다. 기존 release-manifest/게시 절차를 재사용하고 기존 digest/서명 inventory를 편집하지 않는다.5종 인프라 recipe는 변경하지 않았으므로 재사용 검토 대상이다. 최종 웹은 새 runtime과 AWS 계약 metadata/trust/PBX 인증서로 다시 생성한다. 개발 서버 경로/키·전역 Docker 로그인은 runtime 입력으로 전달하지 않는다.

NEW·일반 restart·resume·RESTORE는 기존 절차를 유지한다. `deployment.sh restart`는 Compose restart만 실행하며 migration/seed/key/genesis를 호출하지 않는다. 강제 종료의 quota는 기존 만료 후 보수 정산이며 즉시 환불/청구 대조를 보장하지 않는다. 이번에 재시작·복원·외부 TLS/OIDC/TURN·AWS를 실행하지 않았다.40GiB 시작 guard와 동시 웹 build 예외의 미승인 상태도 변경하지 않았다.

새 observer archive에는 합성 평가 fixture도 포함한다. runtime 안의 평가 도구만 전달하고 입력을 개발 서버 checkout에 남기는 누락을 보완했다. 새 phase를 쓰는 observer와 구 runtime의 observation-contract를 혼합하지 않는다.

### 5차 후속의 직렬 웹 build 검토

`runtime-media.test.ts`의 controller beforeAll은 로컬 OIDC fixture와 준비 문맥을 생성하고 `image-services-started.json`을 최대120초 기다린다. host driver는 그 문맥을 받아 API4개를 기동한 뒤 해당 trust pin으로 최대90초 웹을 build한다. controller를 정상 종료하면 OIDC/시험 실행 문맥도 종료되므로 같은 프로세스를 이어갈 수 없다. 기반 서비스만 종료해도 controller와 builder가 겹치며, 전체 종료 후 NEW를 반복하는 것은 허용된 재개가 아니다. 기존 phase 보관은 이전 시험 종료 후 앱/controller를 재시작하는 절차이지 이 beforeAll 중간을 직렬 checkpoint로 바꾸는 기능이 아니다.

따라서 이번에는 복잡한 단계 분할 도구를 만들거나 실행 예외를 자동 적용하지 않았다. 변경 화면의 격리 HTTP/WS/Chromium, 새 runtime 제작, 전체 미디어 실행은 별도 명시적 허가가 필요하다. 웹 build2GiB/CPU1/90초만 동시 실행 예외·호스트1GiB 포함 전체 관측24GiB 제안은 승인 전까지 미적용이다.40GiB 시작·16GiB 여유·기존 pressure/OOM/timeout·소유 자원 정리 조건은 유지한다. 승인 후에도 최신 자원 관측과 실행 deadline을 고정한 뒤 시작하며, 부족한 로컬 이미지/도구는 다운로드하지 않는다.

### 2026-11-04 제품 경로 실행의 한정 승인

이번 로컬 실행에서는 앞선 동시 웹 build/예산 제안이 명시적으로 승인됐다. 시작40GiB·여유16GiB·전체 관측24GiB·호스트 시험 프로세스1GiB와 웹 build2GiB/CPU1/90초만의 동시 예외를 적용한다. 기존 중단 정책을 유지하고 정리 포함90분, 마지막10분은 신규 장기 단계를 시작하지 않는다. 다음 실행의 상시 허가가 아니다. 앞선 미승인 기록은 당시 상태로 보존한다.

기본 제품 경로는 `/service`, 별도 인증 공식 확인은 `/official`이다. 기관·상담원·수신자는 독립 브라우저 프로필에서 실제 로그인한다. 기관은 고객/상담원/콜센터 선택→업무·위임 생성→원장 확정 확인, 상담원은 배정 업무→새 통화→개별 승인→마이크/PBX 등록→발신, 수신자는 자기 통화 선택→마이크/PBX 등록→수락/검증→선택적 분석 동의 순서다. 종료·취소·정지는 각 실제 권한/API로 수행하고 원장/서버/PBX/양 끝 음성 관측을 분리한다. 복구는 현재 proposal/nonce/epoch/만료에 맞는 서로 다른 관리 승인자2명 서명이 필요하며 과거 통화를 재사용하지 않는다. 별도 발표 화면·장면 버튼·기록 재생을 만들지 않는다.

현재 `vercel.json`은 PUBLIC_PREVIEW build, self connect-src, microphone=()다. 실제 AWS API/WSS로 이어진 배포 연결이나 서비스 URL은 확인되지 않았다. 이를 풀어 쿠키/CSRF/origin 정책을 우회하지 않는다. 실제 서비스는 적절한 AWS 동일 origin과 OIDC callback/TLS/WSS/TURN 입력을 준비해 검증해야 하며 Vercel 공개 preview를 통화 성공으로 표시하지 않는다.

### 최신 제품 후보의 사용·인계 상태 (2026-11-04)

위 역할별 `/service` 사용 순서로 최신 후보의 work-cancel·emergency-stop을 실행했다. 일반 issuer 시작 확인은 실제 provider fixture 시험과 분리한다. 분석 결과 도착 표시와 이전 문맥 결과 폐기는6e3cd23에 포함된다. 정지 뒤 단독 복구400은 HTTP 검증,2명 공동 복구와 epoch/키 세대 반영은 실제 원장 검증이다. 과거 통화·승인을 다시 사용하지 않는다. [실행 기준·제한](FINALS-IMPLEMENTATION-PLAN.md#product-runtime-20261104)과 [inventory/checksum](../artifacts/product-runtime-validation-20261104.json)을 먼저 확인한다.

이번 실행에 한해 HTTP/WS/Chromium host RSS3GiB 재개를 승인받았고 전체 통화 host1GiB는 유지했다. cgroup 종료 경합 중단 뒤 사용자가 승인한 동일 후보 새 batch1회도 종료·정리했다. 이 승인을 다음 기동의 상시 권한으로 사용하지 않는다. 시작40GiB·실행 여유16GiB·총 관측24GiB와 관측 오류 중단 조건은 변경하지 않았다.

로컬 전달 후보는 `.local/presentation-run-20261103T155054Z-209fa1/candidate-final-209fa1/delivery-final/`에 보존한다. 이름은 작업 디렉터리일 뿐 발표 UI가 아니며 AWS runtime 경로가 아니다. 공개 배포 tar·observer tar·images inventory·SHA256SUMS와6종 bootstrap archive가 있다. 보호 키/채운 env/원음/DB·chain 상태는 전달 archive에 넣지 않았고 일회성 시험 보호 입력은 정리했다. 이 후보는 신규 AWS NEW용 코드/이미지 전달물이며 종료한 시험 배포의 RESTORE 백업이 아니다.

소스6e3cd23의 runtime config ID는 공개 증거를 따르며 registry manifest digest는 아직 없다.5종 인프라 이미지는 기존 검증 참조를 재사용한다. 실제 AWS trust·계약 metadata·PBX 인증서가 준비된 뒤 동일 전달 runtime/nginx로 최종 웹을 생성한다. 새 runtime 비공개 GHCR 게시→실제 registry digest 확보→새 고유 Release의 공개 파일/checksum 게시→별도 디렉터리 원격 수령 검증 전에는 기존 고정 Release가 최신이라고 설명하지 않는다. 이 작업에서는 새 원격 게시를 실행하지 않았다.
