# CallSign 작업 지침

## 현재 개발 계약 (2026-10-26)

Understood as: 기존 v1 증거와 코드를 보존하면서, 모의 금융기관 이상거래 연락의 업무 권한·위임·통화 연결·음성 분석 경계를 구현한다. 이번 단계는 오프라인 개발이며 실환경 실행은 별도 사용자 요청 뒤에 한다. Ponytail full: 기존 구조와 의존성을 재사용하고 필요한 코드·검증을 끝낸다.

- 사용자 변경과 과거 기획서·키·볼륨·시험 증거를 덮어쓰거나 삭제하지 않는다.
- Besu/Anvil/Hardhat, PostgreSQL, witness, Asterisk, TURN, Media Edge, API/웹 전체 스택을 기동하지 않는다. Compose up/down, 이미지 pull/build, 체인 초기화·배포·seed, 실제 migration 적용 금지.
- 외부 통합/E2E/장애/부하 시험, STT/LLM 실제 호출·모델 다운로드·추론, GCP 변경 금지. 다른 터미널·원격·CI로 우회하지 않는다. 기존 프로세스·컨테이너를 건드리지 않는다.
- Node.js 타입 검사와 작은 메모리 단위 테스트는 허용한다. 실행 전 하위 script/hook을 읽고 인프라 자동 기동 여부를 확인한다. `pnpm light`만 기본 검증 경로로 사용한다.
- 의존성은 기존 pnpm lockfile을 사용한다. 설치 전 lifecycle/download 범위를 확인하고 모델·브라우저·컨테이너·도구체인을 자동 설치하지 않는다.
- 무거운 실행의 기본 차단을 이번 작업에서 해제하지 않는다. 스크립트는 미래 실행 절차용으로만 작성한다.
- 실제 금융기관·통신사 연동이라고 표현하지 않는다. fixture/녹화/provider 코드를 구분한다. 구현 상태와 검증 상태를 각각 기록한다. 메모리 fake로 PostgreSQL 원자성·QBFT 내성·실제 통화를 입증했다고 쓰지 않는다.
- 진행과 미검증 사항은 `docs/FINALS-IMPLEMENTATION-PLAN.md`에 이어 기록한다. 과거 PASS는 이번 실행 결과가 아니다.
- 전체 요구사항과 완료 조건은 `docs/MASTER-DEVELOPMENT-SPEC.md`의 ID를 따른다. 현재 진행표의 날짜별 기록과 미커밋 변경을 먼저 확인하고, 좁은 경계의 구현을 전체 영역 완료로 확대하지 않는다.
- 2026-10-27 확정 서비스 결정이 이전 설계안보다 우선한다: DID 선택/등록 URI 기본,120초 시작 승인과 유지 lease 분리, Asterisk 웹↔웹 기본, native proof는 후속 확장. 실행 제한은 유지한다.
