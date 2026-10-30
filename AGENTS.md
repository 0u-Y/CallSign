# CallSign 작업 지침

## 현재 개발 계약 (2026-10-26)

기존 시연 코드와 시험 증거를 보존하면서 모의 금융기관 이상거래 연락의 업무 권한·위임·통화 연결·음성 분석을 구현한다. 현재는 서비스를 기동하지 않는 개발 단계이며 실제 환경 실행은 별도 사용자 요청 뒤에 한다. Ponytail full 지침에 따라 기존 구조와 의존성을 재사용하고 요청 범위의 코드와 검증을 끝낸다.

- 사용자 변경과 과거 기획서·키·볼륨·시험 증거를 덮어쓰거나 삭제하지 않는다.
- Besu/Anvil/Hardhat, PostgreSQL, witness, Asterisk, TURN, Media Edge, API/웹 전체 스택을 기동하지 않는다. Compose up/down, 이미지 pull/build, 체인 초기화·배포·seed, 실제 migration 적용 금지.
- 외부 통합/E2E/장애/부하 시험, STT/LLM 실제 호출·모델 다운로드·추론, GCP 변경 금지. 다른 터미널·원격·CI로 우회하지 않는다. 기존 프로세스·컨테이너를 건드리지 않는다.
- Node.js 타입 검사와 작은 메모리 단위 테스트는 허용한다. 실행 전 하위 script/hook을 읽고 인프라 자동 기동 여부를 확인한다. `pnpm light`만 기본 검증 경로로 사용한다.
- 의존성은 기존 pnpm lockfile을 사용한다. 설치 전 lifecycle/download 범위를 확인하고 모델·브라우저·컨테이너·도구체인을 자동 설치하지 않는다.
- 무거운 실행의 기본 차단을 이번 작업에서 해제하지 않는다. 스크립트는 미래 실행 절차용으로만 작성한다.
- 실제 금융기관·통신사 연동이라고 표현하지 않는다. 고정 시험 데이터·과거 녹화·실제 외부 제공자 호출 코드를 구분한다. 구현 상태와 검증 상태를 각각 기록한다. 메모리 fake로 PostgreSQL 원자성·QBFT 내성·실제 통화를 입증했다고 쓰지 않는다.
- 진행과 미검증 사항은 `docs/FINALS-IMPLEMENTATION-PLAN.md`에 이어 기록한다. 과거 PASS는 이번 실행 결과가 아니다.
- 전체 요구사항과 완료 조건은 `docs/MASTER-DEVELOPMENT-SPEC.md`의 ID를 따른다. 현재 진행표의 날짜별 기록과 미커밋 변경을 먼저 확인하고, 좁은 경계의 구현을 전체 영역 완료로 확대하지 않는다.
- 2026-10-27 확정 서비스 결정이 이전 설계안보다 우선한다. 등록 기관 주소·키를 기본으로 하고 DID(분산 식별자)는 선택 기능이다. 120초 최초 연결 승인과 갱신형 통화 유지 허가를 구분한다. 기본 통화는 양측 웹 사이 Asterisk 교환기를 거친다. 체인 헤더·상태 직접 검증은 후속 확장이다. 실행 제한은 유지한다.

## 2026-10-29 이번 검증 작업의 한정 예외

사용자는 이 작업에 한해 자원 관측·로컬 Git 커밋, 기존 로컬 이미지의 격리된 소규모 PostgreSQL과 작업 전용 DB/역할·migration·통합 검증·자체 자원 정리를 허용했다. 기본 실행 guard는 유지하며 DB 범주만 integration으로 명시한다. 기존 DB/프로세스 변경, 체인/Witness/통화/AI/클라우드, 이미지 다운로드/build, push는 금지다. 이 기록은 이후 세션의 임의 DB 기동을 허용하는 상시 예외가 아니다.

## 2026-10-30 계약 검증·게시의 한정 예외

이번 사용자 요청은 설치된 forge/Solc의 프로세스 내부 로컬 EVM·오프라인 컴파일·제한 fuzz/TS 호환성 검증과 미공개 프로젝트 커밋 재구성·Git fetch/일반 push를 허용한다. chain guard는 해당 자식 실행에만 명시한다. RPC/fork/Anvil/Besu/Witness·DB/통화/AI/클라우드·실제 배포·운영키·대형 다운로드·force push는 금지다. 공개된 이력은 재작성하지 않으며 원본 ref/미커밋 자료/증거를 보존한다. 이것은 이후 세션의 상시 실행 허가가 아니다.

## 2026-10-30 인증·HTTP·브라우저 검증의 한정 예외

이번 사용자 요청은 격리된 시험 PostgreSQL·최소권한 LOGIN·migration, loopback 시험 API/웹/HTTPS OIDC fixture와 설치된 headless 브라우저, 합성 계정/시험키 및 관련 일반 commit/push를 허용한다. integration guard와 `callsign_test_*` 대상 검사를 유지한다. 체인/Witness/Anvil/RPC·PBX/TURN·실제 음성장치·외부 AI·클라우드는 금지다. 기존 서비스는 읽기 전용이며 이번 identity의 자원만 정리한다. 이 기록은 후속 세션의 상시 기동 허가가 아니다.


## 2026-10-30 인증 후속 검증의 한정 예외

이번 요청은 격리 PostgreSQL, loopback issuer/platform/Sender·HTTPS 웹·OIDC fixture, 설치 Chromium과 합성 계정/시험키, 원장·anchor·binding·분석 fixture, 관련 커밋·일반 push·CI 조회만 일시 허용한다. 실제 체인/Witness/PBX/TURN·음성 장치·외부 AI/IdP/GCP·전체 Compose·다운로드·기존 자원 변경·force push는 금지한다. 이 허가는 이후 작업의 상시 기동 권한이 아니다. integration guard와 production 검증은 유지하고 이번에 생성한 identity의 자원만 회수한다.


## 2026-10-30 영속 복구 검증의 한정 예외

이번 사용자 요청은 작업 소유 PostgreSQL 두 개와 별도 영속 시험 volume, 기존 anchor의 로컬 HTTPS 실행, 필요한 loopback API/worker, 합성 키/계정, 소유 프로세스 재시작·제한된 응답 유실·암호화 앱 백업과 새 시험 DB 복원, 관련 commit/일반 push/CI 조회만 일시 허용한다. 실제 체인/Witness/PBX/TURN/음성/외부 AI/실제 IdP/GCP·호스트 재부팅/디스크 고갈/전역 네트워크 변경·기존 자원 변경·다운로드/설치·force push는 금지한다. 기존 guard는 유지하고 infrastructure는 소유 anchor/backup/restore 자식에만 지정한다. 상시 실행 허가가 아니며 이번 identity의 자원만 정리한다.

## 2026-10-30 Drain·별도 cluster 복원·Anchor 지연 검증 예외

이번 요청은 고유 identity/label의 source·target·Anchor PostgreSQL과 별도 volume, loopback API/worker/HTTPS Anchor, 합성 데이터·키·인증서, 소수 경쟁 요청과 제한 지연·중단/재시작, 암호화 application 백업/복원 및 관련 commit/일반 push/CI 확인을 허용한다. 기존 자원·운영키·실제 체인/Witness/PBX/음성/외부 AI/IdP/GCP·전역 장애·다운로드·force push는 금지한다. 기존 guard와 최소권한을 유지하며 이번 소유 자원만 정리한다. 상시 실행 허가가 아니다.
