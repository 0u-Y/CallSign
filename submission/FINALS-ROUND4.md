# 4회차 멘토링 자료와 본선 최종 보고서 초안

현재 멘토에게 전달할 검토 자료는 [멘토링 폴더](../docs/mentoring/README.md)다. 아래는2026-10-26 초안 이력이며 현재 설계·82개 단위 결과·미구현 범위를 대체하지 않는다. 새 발표 시나리오/순서는 이번 작업에서 결정하지 않았다.

기준 소스: 시작 커밋 `7aa26d9` 이후 worktree 변경. 2026-10-26. 원본 기획 PPTX/PDF·과거 증거는 수정하지 않는다. 현재 자료는 코드 기반 진행 보고이며 실환경 성공 발표 자료가 아니다.

## 설명 흐름

1. 문제와 대표 사례: 모의 금융기관 이상거래 확인 연락. 기관 표시명만으로 통화를 믿지 않는다.
2. 업무 근거: 모의 CRM/FDS의 수신자·할당 상담원·허용 질문/금지 요구·공식 후속 경로.
3. 권한: 기관 DID/키/원장 상태, 재사용 위임 VC, Sender의 브라우저 세션 공개키 허가, 개별 승인.
4. 수신: 서명/소유 증명/1회 소비/취소/키 버전, 현재 DTLS·datachannel과 결합. 서버 성공 응답을 그대로 표시하지 않는다.
5. 음성: 수락 뒤 마이크, 상대 stream만 동의 기반 STT, revision에 맞는 경고 갱신/철회. 분석 실패는 안전이 아니다.
6. 공동 운영: 복구 2-of-3과 witness 상태 증언 3-of-4를 별개로 설명한다. RPC/가장 느린 노드 의존을 줄인 집계 코드.
7. 서버→GCP: 같은 이미지/Compose와 역할별 DB/키, 새 신뢰 설정과 복원 구분.
8. 증거와 남은 작업: [진행·요구 추적표](../docs/FINALS-IMPLEMENTATION-PLAN.md), [검증 한계](../docs/KNOWN-LIMITATIONS.md), [후속 시험 순서](../docs/RUNBOOK.md).

실제 배포일·본선 통화 성공 화면·처리량·위험 탐지 정확도·장애 시험 수치를 새로 채우지 않는다. `/demo`의 생성 음원/fixture·과거 녹화와 `/finals`의 미검증 실제 provider 코드를 구분한다.

## 멘토링 반영표

멘토링 원문이 이번 작업에 제공되지 않았다. 사용자 개발 요구를 멘토의 발언으로 바꾸지 않는다.

| 의견 원문 | 현재 판단 | 구현 증거 | 남은 확인 |
|---|---|---|---|
| 원문 확인 필요: 업무 실체/기관 신뢰 | 이번 사용자 요구를 기준으로 업무·조직·할당·모의 FDS를 분리 | finals-model/authority, finals.test | 실제 멘토 의견과의 대응 확인 |
| 원문 확인 필요: DID/VC/위임 | VC 2.0/JOSE, registered DID-key/원장 연결 | protocol/finals, did.ts, STANDARDS | 원문·표준 상호운용 요구 확인 |
| 원문 확인 필요: 키 분리/공동 운영 | 분리 프로세스·DB role·독립 signer·키 활성화 | finals-server, governance-v2, migration | 원문·배포 권한 검증 |
| 원문 확인 필요: 실제 통화/AI | 마이크/STT/revision/provider 코드, PBX는 미완료 | liveMedia/finalsCall/transcription/media | 실환경 검증과 media bridge 선정 |
| 원문 확인 필요: 제출·성능 | 과거 증거 보존, 현재 결과를 별도 기록 | FINALS-IMPLEMENTATION-PLAN | 실제 4회차 양식·멘토링 원문 |

## 최종 보고서에 이어 채울 항목

구현과 검증을 각각 상태로 보고한다. 실제 통합 검증 이후에만 실행 커밋, OS/VM, image digest, DB/chain/키 버전, browser/provider/model, raw 측정값, 실패와 잔여 한계를 추가한다. 연락처·계정·비밀키는 공개 보고서에 넣지 않는다.
