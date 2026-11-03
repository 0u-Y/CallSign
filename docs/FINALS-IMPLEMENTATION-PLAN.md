# 개발 현황과 검증 기록

<a id="product-runtime-20261104"></a>

## 2026-11-04 최신 제품·후보 실제 연결 검증

제품 경로는 `/service`·`/official`을 유지했다. 사용자가 철회한 발표 전용 화면·장면·기록 재생은 추가하지 않았다. 실행 소스 `6e3cd238e95457406134e8ef37730fd6d251209a`의 clean tree로 runtime 후보를 만들었다. 실제 제품 분석 결과가 도착해도 상단이 계속 “분석 중”으로 남던 결함을 수정하고, 이전 문맥 결과가 새 상태를 덮지 않는 회귀를 추가했다. 브라우저 역할 heading/접힌 계정 식별자 선택자, 분석 입력 관측, NEW의 비활성 복구키 준비, 원장 이벤트 대기 경합은 시험·준비 도구 결함으로 구분했다.

최신 후보 `sha256:c39cbb13a1f0efde6a9ead66a4624f78cb998e7f8a6f7fb366df6b2c866a8dc7`(linux/amd64, **로컬 config ID**)에서 bootstrap 후 work-cancel·emergency-stop 각1회 PASS. 실제 제품 로그인·업무·위임·승인·binding·소비·lease, 양쪽 합성 음원 수신/디코딩, remote track→인증 WS→분석→ServiceCall 패널, 동의 철회, 양측 음성 중단·ARI 부재·추가 lease 거절·quota 정리를 확인했다. 단독 복구는 HTTP schema에서400(EVM 미도달), 서로 다른2명 공동 복구는 실제 계약/원장 반영 후 epoch3·승인키 세대2를 확인했다. 기존 통화 종료·승인 취소·위임 철회·소비 이력 보존을 확인했다. 일반 issuer entrypoint도 fixture mount 없이 health200/auth401을 확인했으나 이것만으로 전체 readiness를 주장하지 않는다.

HTTP11·WS17·Chromium9의37개 고유 사례를 확인했다. Chromium1개 분석 패널은 component host이며 전체 ServiceCall 증거와 분리한다. 최초 host1GiB 초과로6건 이후 중단한 실행, 승인된3GiB 재개 중 선택자8건 실패·교정 후 선택 재시험, 동일 DB 잔류 감사는 모두 보존했다. readiness·부분6건·재시험을37에 더하지 않는다. 이 HTTP 소스 이후 추가된 분석 상태 문구는 최종 후보의 실제 ServiceCall 시험과 단위 회귀로 확인했다.

첫 최종 후보 batch는 종료 순간 `/proc/PID/cgroup` 조회 실패로 BLOCKED였다. 종료/제거된 소유 준비 도구를 재조회하는 관측 경합을 최소 수정·오프라인6사례 확인한 뒤 사용자가 승인한 새 batch1회에서 위2건을 완료했다. 최초 실패는 보존했고 자원 중단을 성공으로 바꾸지 않았다. 최종 batch5초 표본41개: 가용 RAM 최소45.77GiB, host RSS 최대99.13MiB, container current 최대4.47GiB, 총 관측 최대4.54GiB. 표본 최대이지 peak·최소 사양·SLA가 아니다. 시작40GiB·여유16GiB·전체24GiB·전체 통화 host1GiB, 웹 build2GiB/CPU1/90초와 pressure/OOM/deadline 조건을 유지했다.

최종 `pnpm light`63파일316시험·웹 build·API runtime 타입 검사 PASS. 웹 chunk/dynamic import 경고는 남는다. [공개 증거](../artifacts/product-runtime-validation-20261104.json)에 원본 실패·소스/이미지·묶음 checksum·동일 DB 감사·정리 결과를 연결했다. 최종 batch 컨테이너21개·볼륨2개와 이번 실행의 보호 입력을 정리했다. 기존 자원·사용자 자료·과거 후보·고정 Release는 보존했다.

실제 구성요소는 Besu4·Witness4·PostgreSQL·HTTPS Anchor·API/worker·Asterisk·TURN·제품 웹/Chromium이다. OIDC와 STT/LLM은 명시적 fixture, 음원은 합성이다. 같은 namespace의 TURN과 같은 호스트는 외부 NAT·독립 기관 장애 내성의 증거가 아니다. AWS·실제 IdP·한국어 STT/LLM 품질·새 GHCR/Release 게시는 미실행이다. 새 공개/observer 묶음과 runtime은 같은6e3cd23 소스이며5종 인프라는 재사용했다. 최종 AWS 웹은 실제 AWS metadata/trust/PBX 인증서 뒤에 생성해야 한다. 이전 고정 Release는 이번 소스를 포함하지 않는다.

## 현재 상태와 다음 단계

| 구분 | 상태·다음 작업 |
|---|---|
| 제품 소스 | 검증한6e3cd23과 이후 문서/증거 정리를 구분. `/service`·`/official`, 역할·정족수·서명/통화 구조 유지 |
| 로컬 후보 | runtime·공개/observer 묶음과2개 실제 통화/회수 사례 확인. 원격 게시 전 후보이며 AWS 최종 웹 아님 |
| 원격 전달 | 고정 Release는 이전 소스. 최신 runtime 게시·새 inventory/Release·별도 수령 검증이 남음 |
| 외부 환경 | AWS 공개 origin/TLS/OIDC/PBX/TURN·reader 보호 참조와 실행 허가 필요. AI 품질·사람 평가도 별도 |
| 문서 기준 | 요구는 MASTER, 실행은 RUNBOOK, 한계는 KNOWN-LIMITATIONS. 과거 실행 성공을 현재 전체 PASS로 복사하지 않음 |

문서 정리에서는 진행표의 과거 본문을 보관본으로 분리하고 기존 앵커를 유지했다. 현재 구현 현황의 중복된 NOT_RUN 문장을 최신 소스/과거 증거 표로 정리했다. 요구사항 ID·실행 명령·원본 증거·Release·사용자 기획서는 삭제하지 않았다.

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
