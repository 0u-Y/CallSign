# 개발 현황과 검증 기록

## 2026-11-05 DB 감사·반복·전체 복원 시도

최신 운영 observer는 `aws-recovery-tools-20261104t153749z`로 새 공개5파일을 원격 수령했다. 같은 비공개 runtime/인프라 manifest를 유지했고 이미지 재build/재게시/재수령은 하지 않았다. [전달 대응](../artifacts/product-candidate-20261104.json)의 `recoveryTools`와 실제 실행 소스/단계를 구분한다. 전체 RESTORE 검증 완료판이 아니다.

[이번 실행과 여섯 항목 판정](../artifacts/restore-audit-20261105.json)을 기준으로 본다. 정상 반복은 사전 계획5/실행5/성공5/재시도0이고, 별도 취소 사례를 같은 DB에서 실행했다. 원본 DB의 시작·quiesced·앱/worker 종료 후 삭제 전 최종 감사가 PASS다. 세션30개·소비 영수증6개 등 정상 보존 데이터를 지우지 않았으며 pending/processing outbox·미정산 예약/잔액은0이었다. 규칙/합성 제공자의 실제 WS 시작·종료 관측은 모델 품질과 구분한다.

전체 RESTORE는 **미완료**다. 최초에는 Node 복사가 심볼릭 링크로 남아 도구 mount가 거절됐다(원본 drain/백업 이전의 시험 도구 결함). 실제 역할 env/보존 입력을 백업하도록 정정하고 `docker cp -L`/일반 파일 검사를 추가했다. 같은90분 deadline 안의 최소 복원 상태 재준비는 swap-out21.29→72.19→19.32MiB/s의3구간 연속 기준으로 중단했고 자동 재기동하지 않았다. 수정한 복원 도구는 타입/오프라인 검사만 확인했으며 실제 복원 성공으로 기록하지 않는다.

두 환경 모두 소유 컨테이너21개·volume2개와 보호 trial 경로를 정리했다. 두 번째 baseline의 기존 container/network ID는 보존됐지만 interface/route 차이는 원인 미확정이다. 원본 비교와 최초 중단 신호를 보존했고 host 설정 변경 명령은 실행하지 않았다. 이를 전체 설정 일치 PASS로 바꾸지 않는다.

Vercel 연결·별도 reader·실제 AI 자격/입력/비용은 아직 없다. AI 평가 도구의 숫자 예산 선검사와 dry-run을 보완했고 실제 호출0이다. 이는 제공자 청구 상한 보장이 아니며 실제 모델 가격/지출 제한 확인이 필요하다. AWS 실행은 사용자 후속 지시에 따라 제외했다. 제품 서비스 입력은 바뀌지 않아 runtime을 재제작하지 않으며 새 observer/운영 도구와 기존 이미지의 차이를 전달 기록에 명시한다.


## 2026-11-04 후속 승인 batch: 최신 이미지 선택 경로 통과

후속 `aws-media-candidate-20261104t142900z`의 공개5파일을 새 저장 경로로 원격 수령하고 checksum을 대조했다. [전달 기록의 followup](../artifacts/product-candidate-20261104.json)은 runtime 불변 digest 재사용과 새 공개/observer source를 연결한다. 기존 Release는 변경하지 않았다.

새 사용자 승인에 따른 별도 batch에서 같은59b4379 runtime/37edf8e observer의 정상 반복2회(그중1회는 실제 업무 조회 장애 중 종료)·work-cancel·emergency-stop 각1회가 통과했다. [이번4개 고유 사례·단일 시계 측정·정리](../artifacts/media-final-20261104.json)를 기준으로 보고 이전 정상 smoke2회나 실패를 이번 분모에 합산하지 않는다. 새 이미지 재제작·GHCR 재게시·이미지 재다운로드 없이 기존 불변 manifest를 재사용했다.

[조회 장애 수정 화면](../artifacts/media-resume-20261104/workspace-outage-fixed.png)을 직접 열어 연락 당시 기관/목적·최신 조회 미확인·한국어 장애 안내·진행 통화 종료가 유지됨을 확인했다. [실제390px 경고](../artifacts/media-resume-20261104/final-recipient-mobile.png)도 검토했다. 정상 반복의 계획 분모2/실행2/성공2/재시도0이며 소표본/SLA 미평가다. 실제 원장·Witness·Anchor·PBX/TURN·remote track/인증 WS를 사용했고 OIDC·음원·STT/LLM fixture 범위를 유지했다. 동의 철회·늦은 결과·양측 음성 중단·ARI 부재·추가 lease 거절·통화별 SQL 예약0·공동 복구와 과거 승인/위임/통화 비활성 유지를 확인했다. 단독 복구400은 여전히 HTTP schema 경계다.

이전 분석 중단/PBX 종료의 원인은 미확정이며 이번 미재현을 수정 증거로 쓰지 않는다. DB/체인/Anchor를 보존한 앱/controller 단계 재시작은 수행했으나 전체 RESTORE는 미실행이다. 통화별 SQL 검사는 통과했지만 별도 최종 전체 DB 감사는 정리 완료 후 연결을 시도해 관측하지 못했다. 이를 PASS로 처리하지 않는다. baseline/full ID·소유 cgroup 관측과 앱 우선 정리·잔류0/보호 trial 경로 제거를 확인했다. Vercel 인증·독립 reader·실제 AWS/외부 AI 입력은 남는다.

## 2026-11-04 동일 deadline의 통화 검증과 실제 화면 결함 수정

새 부분 검증 사전 Release의 비공개 runtime·공개5파일 원격 수령을 완료했다. [최종 전달 근거](../artifacts/product-candidate-20261104.json)에 소스/manifest/observer/checksum을 연결했다. 이 전달 성공은 아래 미해결 통화·Vercel·복구 범위를 완료로 바꾸지 않는다.

[실행별 근거와 현재 미확인 범위](../artifacts/media-resume-20261104.json)를 기준으로 본다. 이전 swap-out 중단은 host-wide 관측이며 원인을 이번 작업으로 귀속하지 않는다. 이번 launcher는 baseline을 trial root 밖에 선보존하고 full Docker ID·소유 cgroup swap/pressure/events를 기록한다. 의도된 앱 archive 종료와 실제 기반 서비스 종료를 구분하며, 후속 수정은 종료 상태·소유 로그를 정리 전에 보존한다. 이 마지막 로그 보완은 오프라인 검증만 수행했고 과거에 없던 로그를 복원하지 않는다.

| 항목 | 실제 결과 | 남은 조건 |
|---|---|---|
| 기존9d6f9dd runtime | 정상 smoke2회, 선택 반복·조회 실패 중 실제 종료, work-cancel/emergency-stop·양측 음성 회수·ARI 부재·lease 거절·예약 정리 및 실제 공동 복구 확인 | 반복 제어 도구의 두 실패도 원본 보존. 단독 복구400은 HTTP schema 거절이며 이번 EVM 단독 거절 증거 아님 |
| 실제 화면 수정59b4379 | 업무 조회 장애에도 연결 당시 기관·목적을 ‘최신 조회 미확인’으로 유지. 관리/신규 발신은 비활성 유지, 원문 네트워크 오류 대신 한국어 안내. SSR·타입 회귀 통과 | 새 이미지에서 조회 장애 상호작용은 미실행 |
| 새 runtime c7455c2 | 일반 issuer health/auth challenge·실제 정상 통화2회·양방향 음성·remote track/WS·위험/목적 패널·동의 철회·정상 종료 통과 | 앞선 분석 중단1건 원인 미확정. 이후 PBX 예기치 않은 종료로 반복·취소·정지 단계 BLOCKED, 자동 재기동 없음 |
| 정리·보존 | 각 실행 소유 컨테이너/volume 정리, baseline 비교 확인. 실제1366px/390px 캡처를 열어 검토 | 전체 DB 세션/outbox 잔류 감사·최신 RESTORE 미실행. 소표본은 SLA 아님 |
| 외부 단계 | 기존 Release 보존, 새 후보를 부분 검증 사전 후보로 구분 | Vercel 연결 인증·독립 GHCR reader·외부 AI 비용/입력·AWS 결정 필요 |

[데스크톱](../artifacts/media-resume-20261104/recipient-desktop.png)과 [390px](../artifacts/media-resume-20261104/recipient-mobile.png)는 새 runtime의 실제 ServiceCall이며 합성 계정·음원·분석 제공자를 사용했다. 기관 승인/현재 연결/위험·목적 안내와 통화 종료를 각각 확인했다. 합성 제공자 결과는 실제 모델 정확도가 아니다. 이전 또는 수정 전 이미지의 취소/정지 PASS를 새 이미지의 PASS로 옮기지 않는다.


## 2026-11-04 최신 이미지 실제 준비·일반 기동 후 자원 중단

[후속 실행 원본](../artifacts/candidate-media-followup-20261104.json)은 기존 후보와 같은 runtime/observer이며 제품 변경·재build·새 Release는 없다. 시작 가용40.20GiB를 확인하고 실제 Besu4·계약 배포·Witness4·migration0000~0010·역할 LOGIN·별도 TLS Anchor·PBX/TURN과 제품 API 준비를 수행했다. **일반 issuer 명령은 fixture mount 없이 health200/auth401**을 확인했다. 이는 전체 readiness/통화 PASS가 아니다. 전달 runtime/nginx만으로 새 합성 identity의 웹을 build했으나 실제 화면을 여는 통화 사례 완료 전에 중단됐다.

swap-out이5초 구간11.11→66.99→18.93MiB/s로3회 연속 기준을 넘어 `SUSTAINED_SWAP_OUT`으로 중단했다.25개 표본의 가용 최소37.58GiB·host 최대0.096GiB·전체 최대3.90GiB는 관측 극값이며 peak/최소 사양이 아니다. host-wide swap의 원인은 미확정이고 OOM 증가는 없었다. bootstrap 준비 완료와 통화 성공을 합산하지 않는다. work-cancel은 준비 중 BLOCKED, emergency-stop·정상 smoke2회·재시작/복원은 NOT_RUN이며 새 제품 사례 완료0이다. 자원 중단 후 자동 재기동하지 않았다.

소유 컨테이너21개·volume2개는 앱/브라우저 우선 순서로 정리했고 보호 trial root도 제거했다. 원본 로그는 보호 로컬 경로, 공개 판정·최초3구간은 위 artifact에 보존했다. 정리 중 원래 호스트 baseline을 복사하지 못한 증거 한계가 있다. 기존 Docker ID의 short/full 비교 오류는 보존 PASS로 쓰지 않았고, interface 전체 snapshot 차이의 원인도 단정하지 않았다. route·Docker network ID 비교는 같았으며 host 설정 변경 명령은 실행하지 않았다. 후속 정리 절차에 baseline 선보존·ID 정규화를 명시했다.

| 남은 항목 | 현재 상태/근거 | 다음 행동·차단 조건 |
|---|---|---|
| 제품 UI·HTTP/WS | 기존 최신 UI 검증 재사용, 이후 제품 코드 차이 없음 | 새 실제 ServiceCall 화면은 아래 통화 범위에서 확인 |
| 일반 runtime 진입점 | startup/auth challenge 확인 | readiness·실제 통화로 확대하지 않음 |
| 통화·분석·회수·정상 반복·실패/복원 | 이번 자원 중단으로 BLOCKED/NOT_RUN | 안정된 별도 환경 또는 새 실행 승인 뒤 동일 정책. guard 완화/자동 재개 없음 |
| Vercel | token 보호 참조 없음, 원격 설정/새 버전 미확인 | 기존 프로젝트 인증 참조 또는 대시보드의 정확한 Git SHA 배포 |
| GitHub 전달·AWS 입력 | 기존 사전 Release/비공개 digest 수령 근거 유지 | AWS reader·실제 배포 입력 필요. 원격 전달을 전체 통화 PASS로 확대하지 않음 |


## 2026-11-04 AWS 이전 전 후보 정합성

새 사전 Release의 공개5개 파일을 별도 디렉터리에 다시 내려받아 checksum과 GHCR6종 실제 digest를 대조했다. 이미지 원격 수신은952,751,386bytes이며 기존 Docker cache를 사용하지 않았다. runtime source9d6f9dd·공개/observer source76e5590의 제품 입력26파일 hash가 같고 차이는 문서/증거다. 최종 기동·통화는 BLOCKED 상태로 게시했으며 기존 후보·Release는 변경하지 않았다. 게시 인증 임시 디렉터리는 제거하고 원본 보호 파일은 보존했다.

| 최종 기획의 행동/조건 | 현재 판정 | 근거와 남은 조건 |
|---|---|---|
| 기관 업무·할당·위임·취소·회수 조회 | 구현·범위 검증 완료 | 최신 제품 UI/실제 SQL·HTTP의 [검증 근거](../artifacts/service-redesign-20261104.json). 원장/PBX는 해당 UI 시험에서 fixture |
| 상담원·수신자의 승인·소비·lease·동의·오류 처리 | 구현·UI/WS 검증 완료, 최신 이미지 통화 미실행 | 제품 소스49a2cb9 이후 문서만 변경. 실제 음성 증거는 이전6e3cd23이며 새 이미지로 확대하지 않음 |
| 공동 변경·긴급 정지·복구 | 구현·선택 범위 검증 완료 | 최신 HTTP/화면과 이전 실제 원장 증거를 구분. 단독 복구 HTTP400은 EVM 거절 증거가 아님 |
| 최신 runtime·공개/observer·원격 전달 | 후보 제작·비공개 이미지 게시·공개 사전 Release/원격 수령 완료 | [후보 기록](../artifacts/submission-candidate-20261104.json). 통화40GiB guard 미달, 정상 smoke2회는 NOT_RUN |
| 최신 Vercel frontend | 배포 준비·BLOCKED | 프로젝트 ID/URL 확인, token 보호 참조 없음. API403·과거 SPA 반환. main push를 배포로 간주하지 않음 |
| AWS·외부 IdP·AI·독립 reader | 외부 입력 필요 | RUNBOOK 입력 계약. 계약 주소/genesis/trust pin은 NEW 산출물이며 사용자 선입력 아님 |

prepared runtime의 dependency lock과 인프라5종 recipe/config가 기존 검토본과 같음을 확인했다. 새 runtime에는 최신 화면·정산·migration26개 선택 파일의 일치 감사를 기록했다(전체 migration 개수가26이라는 뜻이 아니다). 라이브러리 공개 self-test 키 형태6개 hash 일치만 허용했고 원본 탐지를 보존했다. 새 사용자 데이터·보호 파일은 build context에 넣지 않았다. runtime/observer의 실제 기동·복구·호환성 성공을 정적 감사로 주장하지 않는다. 이번에는 필수 제품 결함이 새로 확인되지 않아 제품 로직을 추가하지 않았다.


## 2026-11-04 실제 업무 공간 재설계와 UI 확인

[화면 구성 결정](../DESIGN.md)에 따라 기관은 목록/선택 상세, 수신자는 통화/위험 안내, 공동 승인자는 변경 전후 검토를 중심으로 재구성했다. 인증·권한·서명·동의·미디어 생명주기는 유지했다. 공개 `/demo`는 `/service`로 연결하고 과거 발표 화면은 `/legacy/demo`에만 남긴다. API 미연결 공개 빌드는 로그인·통화를 비활성화하고 그 이유를 표시한다.

[이번 원본 결과와 역할별 캡처](../artifacts/service-redesign-20261104.json)가 기준이다. 고유 HTTP11·WS17·Chromium12는 재실행/viewport를 중복 합산하지 않은 결과이며 Chromium 중2개는 component host다. 실제 통화 상태의 합성 시각 검토를 ServiceCall·음성 검증으로 확대하지 않는다. 최종 선택 회귀 소스는49a2cb9이며 초기 실행 이후 UI 변경과 선택 재시험을 기록했다. 공식 세션 시험의 원인 미확정 네트워크 중단과 공개 preview 시험 설정 결함의 실패 원본은 보존했고 보안 조건·timeout은 완화하지 않았다. 소유 DB/보호 경로5세트는 모두 정리했으며 이번에는 같은 DB 간 재실행을 주장하지 않는다.

64파일321시험 light·웹 build를 확인했다. 이전42개 Markdown 감사는 보존하고 새 DESIGN.md만 추가 검토했다. 기존65d85ac runtime은 이 재설계를 포함하지 않는다. 새 runtime/웹/observer 제작과 실제 통화 회귀가 필요하며 이번에 이미지·Release를 만들지 않았다.

확인된 공개 주소는 `https://callsign-rouge.vercel.app`이나 실제 라우트는 과거 발표 화면이며 배포 SHA는 미확인이다. 기존 프로젝트 ID는 사용자가 제공했다. Preview 브랜치는 정상 push했지만 Vercel check가 queued이고 새 URL은 미확인이다. 프로젝트 ID만으로 인증할 수 없으며 Vercel token 보호 파일 참조가 없어 원격 프로젝트 설정 확인/게시가 막혀 있다. Git push·로컬 build를 Vercel 배포 성공으로 기록하지 않는다.


<a id="product-runtime-20261104"></a>

## 2026-11-04 최신 제품·후보 실제 연결 검증

제품 경로는 `/service`·`/official`을 유지했다. 사용자가 철회한 발표 전용 화면·장면·기록 재생은 추가하지 않았다. 실행 소스 `6e3cd238e95457406134e8ef37730fd6d251209a`의 clean tree로 runtime 후보를 만들었다. 실제 제품 분석 결과가 도착해도 상단이 계속 “분석 중”으로 남던 결함을 수정하고, 이전 문맥 결과가 새 상태를 덮지 않는 회귀를 추가했다. 브라우저 역할 heading/접힌 계정 식별자 선택자, 분석 입력 관측, NEW의 비활성 복구키 준비, 원장 이벤트 대기 경합은 시험·준비 도구 결함으로 구분했다.

최신 후보 `sha256:c39cbb13a1f0efde6a9ead66a4624f78cb998e7f8a6f7fb366df6b2c866a8dc7`(linux/amd64, **로컬 config ID**)에서 bootstrap 후 work-cancel·emergency-stop 각1회 PASS. 실제 제품 로그인·업무·위임·승인·binding·소비·lease, 양쪽 합성 음원 수신/디코딩, remote track→인증 WS→분석→ServiceCall 패널, 동의 철회, 양측 음성 중단·ARI 부재·추가 lease 거절·quota 정리를 확인했다. 단독 복구는 HTTP schema에서400(EVM 미도달), 서로 다른2명 공동 복구는 실제 계약/원장 반영 후 epoch3·승인키 세대2를 확인했다. 기존 통화 종료·승인 취소·위임 철회·소비 이력 보존을 확인했다. 일반 issuer entrypoint도 fixture mount 없이 health200/auth401을 확인했으나 이것만으로 전체 readiness를 주장하지 않는다.

HTTP11·WS17·Chromium9의37개 고유 사례를 확인했다. Chromium1개 분석 패널은 component host이며 전체 ServiceCall 증거와 분리한다. 최초 host1GiB 초과로6건 이후 중단한 실행, 승인된3GiB 재개 중 선택자8건 실패·교정 후 선택 재시험, 동일 DB 잔류 감사는 모두 보존했다. readiness·부분6건·재시험을37에 더하지 않는다. 이 HTTP 소스 이후 추가된 분석 상태 문구는 최종 후보의 실제 ServiceCall 시험과 단위 회귀로 확인했다.

첫 최종 후보 batch는 종료 순간 `/proc/PID/cgroup` 조회 실패로 BLOCKED였다. 종료/제거된 소유 준비 도구를 재조회하는 관측 경합을 최소 수정·오프라인6사례 확인한 뒤 사용자가 승인한 새 batch1회에서 위2건을 완료했다. 최초 실패는 보존했고 자원 중단을 성공으로 바꾸지 않았다. 최종 batch5초 표본41개: 가용 RAM 최소45.77GiB, host RSS 최대99.13MiB, container current 최대4.47GiB, 총 관측 최대4.54GiB. 표본 최대이지 peak·최소 사양·SLA가 아니다. 시작40GiB·여유16GiB·전체24GiB·전체 통화 host1GiB, 웹 build2GiB/CPU1/90초와 pressure/OOM/deadline 조건을 유지했다.

최종 `pnpm light`63파일316시험·웹 build·API runtime 타입 검사 PASS. 웹 chunk/dynamic import 경고는 남는다. [공개 증거](../artifacts/product-runtime-validation-20261104.json)에 원본 실패·소스/이미지·묶음 checksum·동일 DB 감사·정리 결과를 연결했다. 최종 batch 컨테이너21개·볼륨2개와 이번 실행의 보호 입력을 정리했다. 기존 자원·사용자 자료·과거 후보·고정 Release는 보존했다.

실제 구성요소는 Besu4·Witness4·PostgreSQL·HTTPS Anchor·API/worker·Asterisk·TURN·제품 웹/Chromium이다. OIDC와 STT/LLM은 명시적 fixture, 음원은 합성이다. 같은 namespace의 TURN과 같은 호스트는 외부 NAT·독립 기관 장애 내성의 증거가 아니다. AWS·실제 IdP·한국어 STT/LLM 품질·새 GHCR/Release 게시는 미실행이다. 새 공개/observer 묶음과 runtime은 같은6e3cd23 소스이며5종 인프라는 재사용했다. 최종 AWS 웹은 실제 AWS metadata/trust/PBX 인증서 뒤에 생성해야 한다. 이전 고정 Release는 이번 소스를 포함하지 않는다.

최신 main `2423e73`의 RUNBOOK/한계 문서를 포함한 추가 인계 묶음을 `.local/delivery-handoff-2423e73/delivery/`에 생성했다. 검증 runtime6e3cd23/c39cbb와 observer 내용은 그대로이며 main과의 차이는 문서·증거뿐이다.4개 파일 checksum·공개 tar 경계 검사를 통과했다. 이미지 재빌드/서비스 기동/원격 게시·수령은 하지 않았다. 기존 후보는 보존했으며 새 inventory는 로컬 config ID·최종 웹 미준비·NOT_SENT를 유지한다.

## 2026-11-04 제출 후보의 원격 전달과 문서 정리

새 지시의 명시적 발행 허가로 `aws-candidate-20261104t085935z`의6종 private GHCR 태그를 게시했다. runtime은 기존 검증 config ID, 인프라5종은 기존 이미지/manifest를 재사용했으며 실제 새 경로에 manifest/config/layer를 수령했다. [원본 증거](../artifacts/ghcr-candidate-20261104.json)는 writer 기반 pull-scope 수령과 미제공 AWS reader를 구별한다. 공개 사전 Release의 봉인·재수령은 후속 영수증으로 판정한다.

RUNBOOK은 AWS 수령/NEW/재개/복구 중심으로 줄이고 로컬 통화·HTTP/DB/EVM 절차를 LOCAL-VALIDATION으로 분리했다. 기존 앵커는 이동 링크로 유지하고 공개 배포 tar에 새 문서를 포함한다. MASTER의 과거 실행 수치/미구현 이력은 원문 링크로 대체해 요구/완료 조건과 구분했다. KNOWN-LIMITATIONS의 오래된 현재형·결과 중복을 정리했고 요구 ID·서명/권한·원본 증거·사용자 기획서는 보존했다. 서비스/브라우저/체인 재기동·이미지 재build·AWS/유료 제공자 호출은 하지 않았다.

## 2026-11-04 실제 업무 UI 후속과 시작 조건 차단

`feat/service-workspace-20261104`의 제품 UI는 현재 연락 요약·역할/다음 행동·독립 검증 상태·경고 우선·통화 중 종료 위치·업무 선택/기술 상세를 개선했다. 계정 관리만 접고 공동 승인 문맥·경고·승인/현재 연결은 유지했다. 승인 전 마이크/PBX 준비를 비활성화하며 기존 API 권한/세대/동의 검사는 그대로다. 기존 실제 캡처2개를 직접 열어 문제를 확인했으며 새 UI 캡처나 이해도 평가를 했다는 주장은 하지 않는다.

사용자가 같은 예산의 새 UI batch1회를 승인했으나 `START_40_GIB_REQUIRED`에서 계획·키·DB·컨테이너 생성 전에 차단됐다. 첫 표본의 수치는 보존하지 못했으며 **후속 읽기 전용 표본**은 available38.81GiB였다. guard/예산을 낮추거나 자동 재시도하지 않았다. 새 HTTP/WS/Chromium·통화·runtime 제작은 NOT_RUN이고 이전6e3cd23/c39cbb 결과를 복사하지 않는다. 정상 통화2회/재시도0의 기존 observer 경로를 준비했지만 실행한 결과는 없다.

추가 리뷰에서 업무 조회 실패 시 이전 목록/관리 동작 유지와 다른 업무 선택 시 이전 통화 요약 유지, 공식 업무 조회 실패 시 과거 목록/내부 오류 표시를 수정했다. 기존 진행 통화 종료는 조회 실패에도 사용할 수 있다. CI에서 종료 중 마지막 helper가 `/proc` 첫 표본에 누락되는 정리 경합1건을 발견해 빈 소유 목록을 재확인하도록 수정했다. 실패 CI 원본은 보존했고 결정적 경합 회귀와 기존11개 정리/자원 시험을 통과했다. 최종 오프라인 `pnpm light`63파일319시험·웹 build·API runtime 타입 검사 PASS이며 새 UI 실제 HTTP/브라우저 결과가 아니다. [소스/검증 경계](../artifacts/service-workspace-20261104.json)에 기록한다.

Git 추적 Markdown42개(MDX0)의 파일별 독자·현행/원본/이력·처리를 [전수 검토 기록](../artifacts/document-review-20261104.json)에 보존한다. root 개인 요약4개·기존 ignored 전달 요약25개는 별도 분류해 로컬 보존하고 게시/삭제하지 않았다. RUNBOOK/MASTER/한계/현황 역할을 나누고 코드·문서/anchor·배포 포함 경로를 대조했다. UI/reference 변경은 [제품 기준](../PRODUCT.md)과 [공식 패턴](DESIGN-REFERENCES.md)을 따른다.

GHCR의6e3cd23 이미지 후보6종은 비공개 게시·실제 원격 수령을 완료했으나 추가 UI는 포함하지 않는다. 기존 Release는 그대로 두고 사전 Release/후속 runtime은 새 UI 검증 뒤에 확정한다. 봉인한 이전 묶음·실패 원본은 로컬에 보존했다. 새 Release가 있다고 설명하거나 기존 tag/inventory를 덮어쓰지 않는다.

<a id="ui-only-20261104"></a>

## 2026-11-04 UI 전용 실제 실행과 main 반영

새 명시적 승인으로 `ui-only-v1`(시작24GiB/여유16GiB/host3GiB/DB 포함4GiB/45분, 정리10분)을 선택해 실제 PostgreSQL·API/세션/CSRF·HTTPS OIDC·제품 웹/Chromium을 실행했다. 전체 통화 profile의40GiB guard는 유지했다. 첫 표본은 판정 전에 보존했다. UI/업무 선택·공식 업무 오류·공동 승인·WS 분석 경계를 확인했고, 최초 숨겨진 ID 선택자 실패와 확대/보류 응답 시험 결함을 고쳐 원래 deadline 안에서 선택 재시험했다. 실패·재시험을 분모에서 없애거나 고유 사례 수에 더하지 않았다. [실행·자원·소스·캡처 원본 연결](../artifacts/service-ui-validation-20261104.json)을 기준으로 한다.

직접 연 캡처에서 기관 고급 입력의 과밀과 공식 확인 버튼의 작은 조작 영역을 확인해 기존 details/버튼을 재사용했다. 위험·공동 변경 검토·긴급 정지는 접지 않았다. 계정 전환/조회 장애·빈 목록/로딩·정책/분석 오류와 동의 철회를 확인했다. 분석 화면1개는 실제 인증 WS를 받는 component host이며 ServiceCall/PBX/음성 경로가 아니다. 진행 통화에서 조회 장애 후 종료 조작은 B에서 확인할 항목으로 유지한다.

A 정리 뒤 B 최초 표본은 available39.04GiB로40GiB 시작 조건을 통과하지 못했다. 체인/PBX/TURN/Anchor를 기동하거나 조건을 기다리며 반복 조회하지 않았다. 새 clean source65d85ac의 runtime은 기존 로컬 base·network-none·2GiB/CPU1/90초로 직렬 build하고 파일/사용자/아키텍처를 무기동 대조했다. 새 runtime 실제 기동·통화와 AWS 최종 trust 웹·후속 원격 게시를 완료로 표시하지 않는다. 기존 후보/Release·원본 실패·개인 요약은 보존했다.

공개/observer·inventory·audit·checksum5개 로컬 후보를 [전달 영수증](../artifacts/service-ui-candidate-20261104.json)에 고정했다. runtime source와 문서/공개 묶음 source의 차이는 문서·증거뿐이다. checksum·공개 경로/패턴 검사를 통과했지만 새 runtime 기동/통화가 미검증이므로 원격 게시·수령·AWS 준비 완료로 쓰지 않는다.

Git은 사용자 지시에 따라 검증 변경을 main에 정상 반영·일반 push하고 원격/CI를 확인한다. PR을 새로 만들거나 승인 대기하지 않으며 기존 Draft #1은 main 반영 뒤 중복으로 닫는다.

## 현재 상태와 다음 단계

| 구분 | 상태·다음 작업 |
|---|---|
| 제품 소스 | 이전 미디어 후보와 후속 UI 전용 실제 검증 소스를 구분. `/service`·`/official`, 역할·정족수·서명/통화 구조 유지 |
| 로컬 후보 | 이전 미디어 후보/증거 보존. 후속 clean runtime은 로컬 build/무기동 감사 완료, 실제 기동·미디어는 미검증. AWS 최종 웹 아님 |
| 원격 전달 | 검증한 이전 제품의6종 GHCR 게시/수령 완료. 후속 UI는 미반영이며 새 Release는 검증 뒤 발행 대기 |
| 외부 환경 | AWS 공개 origin/TLS/OIDC/PBX/TURN·reader 보호 참조와 실행 허가 필요. AI 품질·사람 평가도 별도 |
| 문서 기준 | 요구는 MASTER, 실행은 RUNBOOK, 한계는 KNOWN-LIMITATIONS. 과거 실행 성공을 현재 전체 PASS로 복사하지 않음 |

문서 정리에서는 진행표의 과거 본문을 보관본으로 분리하고 기존 앵커를 유지했다. 현재 구현 현황의 중복된 NOT_RUN 문장을 최신 소스/과거 증거 표로 정리했다. 요구사항 ID·실행 명령·원본 증거·Release·사용자 기획서는 삭제하지 않았다.

## 최종 기획과 구현·검증 연결

| 요구 ID·기획 흐름 | 실제 소비 경로 | 이번 근거·남은 범위 |
|---|---|---|
| BUSINESS-001~003·AUTH-001~002 | `ServicePage`→인증/업무 API→SQL | 역할/기관 격리·업무/위임·로그인·CSRF·회수 조회 HTTP/Chromium. 외부 IdP는 별도 |
| CALL-001~006·IDENTITY-003 | `ServiceCall`→승인/binding/소비/lease→verifier | 최종 후보의 실제 업무 취소/정지 통화2사례. 모든 만료/장애 조합을 재실행한 것은 아님 |
| CONTRACT-003~004·STATE-001~002·GOVERNANCE-001~002 | worker→ServiceRegistry→Witness→서버 projection | 실제 정지·공동 복구·키 세대 활성화. 관리2/3·Witness3/4·QBFT는 별개 |
| MEDIA-001~003·PBX-001~003 | 양측 제품 웹→Asterisk/TURN→상대 receiver | 실제 합성 음원 양방향 디코딩·회수 후 음성 중단. AWS 외부 TLS/NAT는 별도 |
| AI-001~004·UI-001~004 | remote recorder→인증 WS→orchestration→ServiceCall 패널 | 동의/경고/목적 이탈/장애 분리·철회·정산. 실제 LLM/STT 품질(AI-005)은 미검증 |
| OPS-001~005·OPS-007·TEST-004 | runtime/공개·observer 전달→NEW/restart/RESTORE | 최신 로컬 후보 생성·일반 issuer 시작·소유 자원 정리. 과거 복원 증거는 당시 소스이며 최신 원격 게시/AWS는 남음 |

## 과거 기록 찾기

이전 진행표의 본문은 [날짜별 보관본](archive/DEVELOPMENT-HISTORY-20261104.md)에 그대로 보존했다. 기존 링크가 끊기지 않도록 아래 앵커를 유지한다. 원본 artifacts와 Release는 이동하거나 덮어쓰지 않았다.

<a id="2026-11-04-5차-후속-실행-경계-확인"></a>
- [2026-11-04 5차 후속 실행 경계 확인](archive/DEVELOPMENT-HISTORY-20261104.md#2026-11-04-5차-후속-실행-경계-확인)

<a id="mentoring-five-20261104"></a>
<a id="2026-11-04-5차-제품측정평가-보완"></a>
- [2026-11-04 5차 제품·측정·평가 보완](archive/DEVELOPMENT-HISTORY-20261104.md#mentoring-five-20261104)

<a id="candidate-readiness-20261103"></a>
<a id="2026-11-03-현재-후보의-자원무기동-검토"></a>
- [2026-11-03 현재 후보의 자원/무기동 검토](archive/DEVELOPMENT-HISTORY-20261104.md#candidate-readiness-20261103)

<a id="candidate-media-20261103"></a>
<a id="2026-11-03-후보-제작-실제-sqlws-종료-회귀와-전체-미디어-자원-차단"></a>
- [2026-11-03 후보 제작: 실제 SQL·WS 종료 회귀와 전체 미디어 자원 차단](archive/DEVELOPMENT-HISTORY-20261104.md#candidate-media-20261103)

<a id="main-review-20261103"></a>
<a id="2026-11-03-검토-브랜치-리뷰와-main-반영"></a>
- [2026-11-03 검토 브랜치 리뷰와 main 반영](archive/DEVELOPMENT-HISTORY-20261104.md#main-review-20261103)

<a id="http-pressure-integration-20261103"></a>
<a id="2026-11-03-명시적-압박-정책으로-httpwschromium-통합-완료"></a>
- [2026-11-03 명시적 압박 정책으로 HTTP·WS·Chromium 통합 완료](archive/DEVELOPMENT-HISTORY-20261104.md#http-pressure-integration-20261103)

<a id="http-resource-preflight-20261103"></a>
<a id="2026-11-03-http-재개-사전-관측-서비스-시작-전-차단"></a>
- [2026-11-03 HTTP 재개 사전 관측: 서비스 시작 전 차단](archive/DEVELOPMENT-HISTORY-20261104.md#http-resource-preflight-20261103)

<a id="mentoring-integration-20261103"></a>
<a id="2026-11-03-최신-기능-통합-시도-db-확인자원-중단"></a>
- [2026-11-03 최신 기능 통합 시도: DB 확인·자원 중단](archive/DEVELOPMENT-HISTORY-20261104.md#mentoring-integration-20261103)

<a id="mentoring-fourth-20261102"></a>
<a id="2026-11-0203-4차-반영-운영-조회승인-목적-분석통화별-측정"></a>
- [2026-11-02~03 4차 반영: 운영 조회·승인 목적 분석·통화별 측정](archive/DEVELOPMENT-HISTORY-20261104.md#mentoring-fourth-20261102)

<a id="aws-final-preparation-20261102"></a>
<a id="2026-11-02-aws-전-입력재개-경계-점검"></a>
- [2026-11-02 AWS 전 입력·재개 경계 점검](archive/DEVELOPMENT-HISTORY-20261104.md#aws-final-preparation-20261102)

<a id="public-repository-20261102"></a>
<a id="2026-11-02-공개-저장소의-문서-진입점-정리"></a>
- [2026-11-02 공개 저장소의 문서 진입점 정리](archive/DEVELOPMENT-HISTORY-20261104.md#public-repository-20261102)

<a id="ghcr-images-20261102"></a>
<a id="2026-11-02-비공개-ghcr-게시와-실제-원격-blob-수령"></a>
- [2026-11-02 비공개 GHCR 게시와 실제 원격 blob 수령](archive/DEVELOPMENT-HISTORY-20261104.md#ghcr-images-20261102)

<a id="github-publication-20261102"></a>
<a id="2026-11-02-github-전달-경로와-게시-준비"></a>
- [2026-11-02 GitHub 전달 경로와 게시 준비](archive/DEVELOPMENT-HISTORY-20261104.md#github-publication-20261102)

<a id="delivery-only-20261102"></a>
<a id="2026-11-02-전달물만-사용하는-신규-전체-리허설"></a>
- [2026-11-02 전달물만 사용하는 신규 전체 리허설](archive/DEVELOPMENT-HISTORY-20261104.md#delivery-only-20261102)

<a id="aws-preparation-20261102"></a>
<a id="2026-11-02-aws-단독-실행-준비와-전달-이미지"></a>
- [2026-11-02 AWS 단독 실행 준비와 전달 이미지](archive/DEVELOPMENT-HISTORY-20261104.md#aws-preparation-20261102)

<a id="isolated-media-20261102"></a>
<a id="2026-11-02-실제-교환기합성-음원과-권한-회수"></a>
- [2026-11-02 실제 교환기·합성 음원과 권한 회수](archive/DEVELOPMENT-HISTORY-20261104.md#isolated-media-20261102)

<a id="isolated-runtime-20261101"></a>
<a id="2026-11-01-호스트-설정을-보존한-실제-원장api-연결"></a>
- [2026-11-01 호스트 설정을 보존한 실제 원장·API 연결](archive/DEVELOPMENT-HISTORY-20261104.md#isolated-runtime-20261101)

<a id="2026-11-01-저장소-게시-파일-정리"></a>
- [2026-11-01 저장소 게시 파일 정리](archive/DEVELOPMENT-HISTORY-20261104.md#2026-11-01-저장소-게시-파일-정리)

<a id="chain-preparation-20261101"></a>
<a id="2026-11-01-첫-체인-실행-직전의-입력네트워크-준비"></a>
- [2026-11-01 첫 체인 실행 직전의 입력·네트워크 준비](archive/DEVELOPMENT-HISTORY-20261104.md#chain-preparation-20261101)

<a id="release-candidate-20261031"></a>
<a id="2026-10-31-실제-인프라-연결-전-배포-후보-검토"></a>
- [2026-10-31 실제 인프라 연결 전 배포 후보 검토](archive/DEVELOPMENT-HISTORY-20261104.md#release-candidate-20261031)

<a id="backup-boundaries-20261030"></a>
<a id="2026-10-30-쓰기-중-drain별도-cluster-복원anchor-잠금-후속"></a>
- [2026-10-30 쓰기 중 drain·별도 cluster 복원·Anchor 잠금 후속](archive/DEVELOPMENT-HISTORY-20261104.md#backup-boundaries-20261030)

<a id="persistent-recovery-20261030"></a>
<a id="2026-10-30-영속-anchor프로세스-재시작앱-백업복원"></a>
- [2026-10-30 영속 anchor·프로세스 재시작·앱 백업/복원](archive/DEVELOPMENT-HISTORY-20261104.md#persistent-recovery-20261030)

<a id="authenticated-boundaries-20261030"></a>
<a id="2026-10-30-공동-관리세션분석의-인증-후속-경계"></a>
- [2026-10-30 공동 관리·세션·분석의 인증 후속 경계](archive/DEVELOPMENT-HISTORY-20261104.md#authenticated-boundaries-20261030)

<a id="authenticated-http-validation-20261030"></a>
<a id="2026-10-30-실제-인증httppostgresql브라우저-검증"></a>
- [2026-10-30 실제 인증·HTTP·PostgreSQL·브라우저 검증](archive/DEVELOPMENT-HISTORY-20261104.md#authenticated-http-validation-20261030)

<a id="contract-validation-20261030"></a>
<a id="2026-10-30-커밋-정리와-로컬-evm-계약-실행"></a>
- [2026-10-30 커밋 정리와 로컬 EVM 계약 실행](archive/DEVELOPMENT-HISTORY-20261104.md#contract-validation-20261030)

<a id="실행-제한"></a>
- [실행 제한](archive/DEVELOPMENT-HISTORY-20261104.md#실행-제한)

<a id="postgres-validation-20261029"></a>
<a id="로컬-보존과-첫-postgresql-검증-2026-10-29"></a>
- [로컬 보존과 첫 PostgreSQL 검증 (2026-10-29)](archive/DEVELOPMENT-HISTORY-20261104.md#postgres-validation-20261029)

<a id="readiness-refinement-20261029"></a>
<a id="실행-준비-후속-수정-2026-10-29"></a>
- [실행 준비 후속 수정 (2026-10-29)](archive/DEVELOPMENT-HISTORY-20261104.md#readiness-refinement-20261029)

<a id="execution-readiness-20261029"></a>
<a id="2026-10-29-실행-준비검증-체계"></a>
- [2026-10-29 실행 준비·검증 체계](archive/DEVELOPMENT-HISTORY-20261104.md#execution-readiness-20261029)

<a id="pre-execution-20261027"></a>
<a id="2026-10-27-실행-전-마무리-기록"></a>
- [2026-10-27 실행 전 마무리 기록](archive/DEVELOPMENT-HISTORY-20261104.md#pre-execution-20261027)

<a id="이전-연결-작업의-기록"></a>
- [이전 연결 작업의 기록](archive/DEVELOPMENT-HISTORY-20261104.md#이전-연결-작업의-기록)

<a id="service-20261027"></a>
<a id="이전-연결-시점의-기능"></a>
- [이전 연결 시점의 기능](archive/DEVELOPMENT-HISTORY-20261104.md#service-20261027)

<a id="중요한-정책과-경계"></a>
- [중요한 정책과 경계](archive/DEVELOPMENT-HISTORY-20261104.md#중요한-정책과-경계)

<a id="이번-실제-검증"></a>
- [이번 실제 검증](archive/DEVELOPMENT-HISTORY-20261104.md#이번-실제-검증)

<a id="코드-미구현과-외부-검증의-구분"></a>
- [코드 미구현과 외부 검증의 구분](archive/DEVELOPMENT-HISTORY-20261104.md#코드-미구현과-외부-검증의-구분)

<a id="앞선-인증조회세션-회수-구현"></a>
- [앞선 인증·조회·세션 회수 구현](archive/DEVELOPMENT-HISTORY-20261104.md#앞선-인증조회세션-회수-구현)

<a id="검증-이력"></a>
- [검증 이력](archive/DEVELOPMENT-HISTORY-20261104.md#검증-이력)

<a id="문서-관리와-다음-개발"></a>
- [문서 관리와 다음 개발](archive/DEVELOPMENT-HISTORY-20261104.md#문서-관리와-다음-개발)
