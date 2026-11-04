# 개발 현황과 검증 기록

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

추가 리뷰에서 업무 조회 실패 시 이전 목록/관리 동작 유지와 다른 업무 선택 시 이전 통화 요약 유지, 공식 업무 조회 실패 시 과거 목록/내부 오류 표시를 수정했다. 기존 진행 통화 종료는 조회 실패에도 사용할 수 있다. 최종 오프라인 `pnpm light`63파일318시험·웹 build·API runtime 타입 검사 PASS이며 새 UI 실제 HTTP/브라우저 결과가 아니다. [소스/검증 경계](../artifacts/service-workspace-20261104.json)에 기록한다.

Git 추적 Markdown42개(MDX0)의 파일별 독자·현행/원본/이력·처리를 [전수 검토 기록](../artifacts/document-review-20261104.json)에 보존한다. root 개인 요약4개·기존 ignored 전달 요약25개는 별도 분류해 로컬 보존하고 게시/삭제하지 않았다. RUNBOOK/MASTER/한계/현황 역할을 나누고 코드·문서/anchor·배포 포함 경로를 대조했다. UI/reference 변경은 [제품 기준](../PRODUCT.md)과 [공식 패턴](DESIGN-REFERENCES.md)을 따른다.

GHCR의6e3cd23 이미지 후보6종은 비공개 게시·실제 원격 수령을 완료했으나 추가 UI는 포함하지 않는다. 기존 Release는 그대로 두고 사전 Release/후속 runtime은 새 UI 검증 뒤에 확정한다. 봉인한 이전 묶음·실패 원본은 로컬에 보존했다. 새 Release가 있다고 설명하거나 기존 tag/inventory를 덮어쓰지 않는다.

## 현재 상태와 다음 단계

| 구분 | 상태·다음 작업 |
|---|---|
| 제품 소스 | 검증한6e3cd23과 이후 미통합 검증 UI branch를 구분. `/service`·`/official`, 역할·정족수·서명/통화 구조 유지 |
| 로컬 후보 | 이전6e3cd23 runtime·공개/observer와2개 실제 통화/회수 증거를 보존. 새 UI runtime은 미제작이며 AWS 최종 웹도 아님 |
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
