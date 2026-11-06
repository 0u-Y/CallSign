# CallSign 문서 안내

처음 방문했다면 [저장소 소개](../README.md) → [서비스 가이드](guide/README.md)를 읽습니다. 실행 담당자는 [현재 서버컴 지속 운영](RUNBOOK.md#지속-서비스와-시험-환경의-분리)에서 시작하세요. 현재 배포 기준 tag·digest·수령 명령은 RUNBOOK에서 관리하며 `latest`로 추정하지 않습니다.

## 기준 문서의 역할

| 찾는 내용 | 기준 문서 | 다루는 범위 |
|---|---|---|
| 서비스 목적·사용자 흐름 | [서비스 가이드](guide/README.md) | 기관·상담원·수신자의 동작, 승인과 내용 위험의 구분 |
| 제품 표현·화면 원칙 | [제품 기준](../PRODUCT.md) · [화면 구성 결정](../DESIGN.md) | Team Signal·CallSign 명칭, UX·접근성 원칙 |
| 요구사항·완료 조건 | [MASTER](MASTER-DEVELOPMENT-SPEC.md) | 요구 ID와 목표. 검증 성공을 선언하는 보고서가 아님 |
| 구성요소·키·데이터·신뢰 경계 | [아키텍처](ARCHITECTURE.md) | 기본 PBX 경로와 보존한 호환 경로 |
| 데이터·서명·세션 결합 | [프로토콜](PROTOCOL.md) | 등록 URI/VC/JWS·EIP-712·lease·Witness 형식 |
| 공격자·신뢰 가정 | [위협 모델](THREAT-MODEL.md) | 방어 조건과 신뢰에 남는 위험 |
| 지속 운영·수령·배포·복구 | [RUNBOOK](RUNBOOK.md) | 입력·NEW/재개/RESTORE·영속 경로 |
| 로컬 통화·HTTP·DB·EVM 검증 | [검증 절차](LOCAL-VALIDATION.md) | 환경별 guard·예산·관측·정리. 새 실행 허가를 대신하지 않음 |
| 현재 확인한 범위와 남은 경계 | [구현 현황](guide/05-IMPLEMENTATION-STATUS.md), [알려진 한계](KNOWN-LIMITATIONS.md) | 실제 구성요소·fixture·미검증의 구분 |
| 날짜별 변경·원래 SHA·결과 | [개발 진행 기록](FINALS-IMPLEMENTATION-PLAN.md) | 원본 증거로 연결하는 작업 이력 |

가이드는 설명, MASTER는 요구, RUNBOOK은 절차, 진행 기록과 artifacts는 당시 실행 근거입니다. 문서 사이에 상태를 복사해 최신성을 판단하지 말고 해당 기준과 원본 증거를 확인합니다. 사용자 지시와 [AGENTS](../AGENTS.md)가 작업의 실행 허용 범위를 정합니다.

## 개발과 시험

[루트의 가벼운 검사](../README.md#개발-시작)부터 시작합니다. workspace는 `apps/web`, `services/api`, `services/witness`, `packages/protocol`, `packages/verifier`, `contracts`로 나뉩니다. package scripts는 [package.json](../package.json), 일반 CI는 [light workflow](../.github/workflows/ci.yml)가 기준입니다.

- 로컬 단위/타입 검사는 `pnpm light`, 웹 컴파일은 `pnpm --filter @callsign/web build`입니다.
- 실제 DB·EVM·HTTP·미디어 시험은 [실행 범주](RUNBOOK.md#실행-범주)와 [단계별 판정](RUNBOOK.md#단계별-검증과-판정)을 먼저 확인합니다. 별도 허가 없는 서비스 기동은 하지 않습니다.
- 코드 변경은 관련 회귀와 함께 검토하고, 증거에는 실제 소스·환경·대체 경계를 기록합니다. 과거 PASS를 새 실행으로 복사하지 않습니다.
- 설치·다운로드·key 생성·migration·seed는 단순 문서 확인 작업에 포함되지 않습니다.

## 현재 운영과 후속 이전

현재 목표는 서버컴의 지속 데모이며 AWS 이전은 후속이다. 보존된 이전 준비 절차는 [보존된 전달 버전과 AWS 수령 명령](RUNBOOK.md#github-delivery-20261102) → [NEW 초기 배포](RUNBOOK.md#new-초기-배포-순서) → [재시작·재개·RESTORE](RUNBOOK.md#재시작실패-재개기존-배포-restore) 순서로 확인합니다.

Git 소스·공개 Release·비공개 GHCR·보호 파일은 역할이 다릅니다. bootstrap 전달은 검증했지만 최종 AWS 웹·별도 GHCR 수령용 읽기 자격 검증·AWS 실행은 미완료입니다. 시험 chain/DB를 대회 identity로 간주하지 않으며, 기존 키·genesis·계약·소비 이력·Anchor를 초기화해 재개하지 않습니다. `infra/gcp`는 과거 보존물입니다. 공개 frontend의 연결 범위는 [현황표](guide/05-IMPLEMENTATION-STATUS.md)를 따르며 AWS 배포 완료와 구분합니다.

## 기록과 자료

| 보존 자료 | 위치·해석 |
|---|---|
| GHCR 게시·공개 파일 수령 | [이미지 증거](../artifacts/ghcr-images-20261102.json), [Release 영수증](../artifacts/ghcr-delivery-20261102.json). 태그·digest·config ID를 구분 |
| 전달물 신규 리허설 | [원본 평가](../artifacts/delivery-only-rehearsal-20261102.json). 실제 원장/DB/PBX·합성 음원, 로컬 OIDC fixture, 같은 호스트 범위 |
| 앞선 DB·계약·인증·복구 실행 | [개발 이력 보관본](archive/DEVELOPMENT-HISTORY-20261104.md)과 [artifacts](../artifacts/). 당시 SHA·실패·중간 결과를 보존하고 현재 진행표와 분리 |
| 초기 시청 시연 | [당시 제품안](PRODUCT.md), [진행](PROGRESS.md), [시험](TEST-RESULTS.md), [화면 검수](DESIGN-QA.md), [디자인 참고](DESIGN-REFERENCES.md), [사실 확인](FACT-CHECK.md). 현행 운영 절차가 아님 |
| 이전 기획·개발안 | [보관 문서](archive/2026-10-26/), [설계 결정](adr/0002-finals-offline.md), [원장 선택 근거](WHY-BLOCKCHAIN.md) |
| 멘토링·제출 자료 | [멘토링 진입점](mentoring/README.md), [기획·발표 원본](../submission/). 일정·시연 흐름은 제품 요구와 분리 |
| 형식의 출처 | [표준 적용 범위](STANDARDS.md), [제3자 고지](../THIRD_PARTY_NOTICES.md) |

`artifacts/test-results.json`은 과거 결과이면서 기존 웹/배포가 읽는 입력이고 `artifacts/service-registry-build-20261027.json`은 계약 배포 입력입니다. artifacts를 모두 생성물로 보고 삭제·ignore하지 않습니다. 파일별 실제 사용처와 원본 provenance를 먼저 확인합니다.

개인 전달용 `docs/*-SUMMARY.md`와 `artifacts/*.progress.json`, 보호 자료·cache는 로컬에 보존하고 Git에서 제외합니다. 새 종합 요약을 반복해 게시하는 대신 현재 기준 문서와 진행 기록을 갱신합니다. 과거 SHA·날짜·결과는 수정하지 않습니다.

현재 저장소에는 프로젝트 LICENSE 파일이 없습니다. 이번 정리에서 라이선스를 선택하거나 새로 부여하지 않았습니다. 의존성 고지는 프로젝트 자체의 LICENSE를 대신하지 않습니다. 비밀값이나 개인정보가 의심되면 공개 issue·diff에 원문을 붙이지 말고 위치·유형만 전달하세요.

전체 추적 Markdown/MDX의 독자·역할·유지/수정/통합 내역은 [2026-11-06 파일별 검토 목록](../artifacts/document-review-20261106.json)을 참고하세요. [이전 감사](../artifacts/document-review-20261104.json)는 원본으로 보존합니다. 구현 리뷰와 통합 안내는 [제출 정리 기록](FINALS-IMPLEMENTATION-PLAN.md#submission-review-20261106)에 있습니다. 새 UI의 오프라인 검사와 기동 차단은 [현재 진행표](FINALS-IMPLEMENTATION-PLAN.md#2026-11-04-실제-업무-ui-후속과-시작-조건-차단)에서 이전 실제 통화 증거와 구분합니다.
