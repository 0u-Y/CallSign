# CallSign 멘토링 검토

서비스 설명은 [CallSign 서비스 가이드](../guide/README.md)에 모았습니다. 개요·아키텍처·통화 처리·신뢰 및 보안·구현 현황을 순서대로 읽을 수 있습니다.

## 2026-10-27 검토 질문

> 3차 멘토링 의견을 반영해 기관의 업무 위임, 개별 통화 승인, 실제 연결 검증과 AI 위험 안내 구조를 구체화했습니다. 이 서비스를 금융기관·위탁 콜센터에 실제로 적용한다고 보실 때, 도입을 가로막을 수 있는 가장 큰 문제와 이를 해결하기 위해 우선 보완해야 할 점은 무엇이라고 생각하시는지 의견을 부탁드립니다.

질문은 사용자가 제공한 문구입니다. 3차 멘토링 원문은 저장소에서 확인하지 못했으며, 실제 발언·채택 내역은 추정하지 않습니다. 검토 일정·질문은 서비스의 기능 요구나 완료 기준과 별도로 관리합니다.

## 4차 피드백 반영 범위

아래 피드백은 이번 사용자 요청의 개발 항목을 요약한 것이며 멘토 발언 원문을 재구성한 것이 아니다. 계약/정책 결정과 코드·오프라인 검사·실제 통합·외부 환경·산출물 발행을 구분한다. 현재 소스의 검사 결과는 [개발 기록](../FINALS-IMPLEMENTATION-PLAN.md#mentoring-fourth-20261102), 실제 실행 조건은 [RUNBOOK](../RUNBOOK.md#mentoring-fourth-validation)이 기준이다.

| 피드백 | 결정·이유 | 실제 변경 | 확인 범위·남은 조건 |
|---|---|---|---|
| A 기관의 승인·회수·추적과 공동 운영 범위를 명확히 | 수정 채택. 고객 로그인/수락·키/binding 유지, Registry 전역 대칭2-of-3을 기관별 필수 동의로 설명하지 않음 | PRODUCT·README·ARCHITECTURE·THREAT-MODEL·WHY-BLOCKCHAIN·ServiceAdministration | 설계 설명·UI 코드 반영. 독립 운영은 제안 모델 |
| B 통화 한 건과 정상 반복을 실패 포함해 측정 | 채택. 기존 Measurements/성능 평가·미디어 suite·guard 재사용 | evaluate-performance·call-trials·observation-contract·service-pbx.spec | 합성 집계/guard 회귀. 실제 성공률/지연 기준선 NOT_RUN |
| C 기관이 위임/업무/통화와 회수를 구분해 조회 | 채택. 별도 audit/outbox와 현재 상태의 제한된 read snapshot, 기존 cleanup 경로 재사용 | recall-status·finals-store·service-routes·ledger-events·service-worker·pbx-runtime·ARI·ServiceRecallStatus·migration0010 | API inject/상태/UI 단위, 실제 PG·ARI·음성은 미실행 |
| D 승인 목적 이탈을 금지 요구·실행 상태와 분리 | 채택. 정책 hash는 그대로, 분석기 버전/문맥 revision만 별도 | protocol/analysis·service-analysis·service-audio·risk/transcription | 정책 결합·문맥/정정·늦은 결과·룰 병합 오프라인. 실제 모델 판정 미검증 |
| E 근거와 공식 경로 안내·평가를 보완 | 채택. LLM의 URL/명령/확률을 사용자 행동으로 채택하지 않음 | ServiceAnalysisPanel·Service·합성 purpose fixture·evaluate-service-analysis·회귀 | SSR/파싱/평가 집계, 제공자 호출0. development/evaluation 모두 모델 작성 합성 자료 |
| F CTI 계약·재시도/취소 경계 | 수정 채택. 현재 로그인한 상담원·Sender/PBX 경계만 다룸 | PROTOCOL의 CTI 계약·service-routes 회귀 | 현재 API 경계 단위와 HTTP 시험 소스. 상용 CTI/새 machine principal 미구현 |
| G 새 소스와 전달물 정합성 | 채택. 기존 Release/서명 inventory 보존 | release-manifest·Docker context/ignore 검사·RUNBOOK | 새 runtime/공개 묶음 필요.5종 infrastructure build 구성 유지, 이미지/Release 미발행 |
| H 외부 검증을 단계별로 준비 | 채택. 기존 AWS 입력 계약·guard·시험 lifecycle 재사용 | RUNBOOK·guard 회귀·call/provider runner·기존 통합 시험 소스 | 무기동 준비·검사. AWS/IdP/TURN/제공자/복구 실제 실행은 별도 허가·입력 필요 |
| 관리 승인자 교체·기관별 집합·정족수 변경·Witness 직접 proof 대체 | 후속. 현재 계약의 보장을 바꾸므로 이번 제외 | KNOWN-LIMITATIONS의 후속 조건 | 새 권한 모델/이행·서명 재사용/구 trust 차단과 독립 운영 검증이 선행되어야 함. ABI·bytecode·서명 도메인 유지 |

최신 실행 후속: migration0010·실제 SQL 경계는5파일17시험 PASS이며 C~E의 최신 HTTP/WS/Chromium은 연속 swap으로 BLOCKED다. [2026-11-03 실행 기록](../FINALS-IMPLEMENTATION-PLAN.md#mentoring-integration-20261103)을 따르며 기존 오프라인/과거 통합 결과와 구분한다.
