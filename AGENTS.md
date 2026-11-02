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

## 2026-10-31 배포 후보 정합성 작업

이번 요청은 저장소/로컬 도구/이미지의 읽기 전용 조사, 코드·공개 설정·기존 문서 수정, 가벼운 정적/타입/단위 검사·웹 build, 관련 commit/일반 push/CI 확인만 허용한다. 이전의 DB/Anchor/API/브라우저 한정 허가는 승계하지 않는다. 모든 서비스·체인·미디어·제공자·클라우드 기동/호출·키 생성·migration·배포·이미지 build/다운로드·기존 자원 변경·force push를 하지 않는다.

## 2026-11-01 첫 체인 준비의 한정 작업

이번 요청은 host/interface/route/Docker IPAM·자원의 읽기 전용 관측, 저장소의 신규 배포 설정안/준비 도구·문서 수정, 제한된 오프라인 검사와 관련 commit/일반 push/CI 확인을 허용한다. 서버의 실제 설정은 변경하지 않는다. 모든 서비스/노드/컨테이너 기동·이미지 build/download·의존성 설치·키/인증서 생성·계약 배포·GCP 변경·기존 자원 변경은 금지다. 신규 prefix 제안은 미적용이며 과거 한정 실행 허가는 승계하지 않는다.

## 2026-11-01 호스트 설정 보존 격리 연결의 한정 예외

이번 사용자 요청은 기존 host/interface/route/DNS/firewall/Docker daemon·기존 서비스/volume을 보존하는 조건으로 작업 전용 none namespace·loopback의 Besu4/Witness4·DB/Anchor/API·worker, 합성 키/계정, 오프라인 app image build·검증과 관련 commit/일반 push/CI 확인을 허용했다. 새 bridge/host port publish·공개 노출·host 설정 변경은 허용하지 않았다. package probe137 종료 후 소유 서비스를 중단했으며 사용자가 명시한2GiB·60초 재검증은1회만 수행했다. 유료 AI/GCP·운영 데이터는 사용하지 않았다. 실행 결과와 남은 media/외부 설정은 진행 기록을 따른다. 이 기록은 후속 세션의 상시 기동 허가가 아니다.

## 2026-11-02 격리 미디어 검증의 한정 예외

이번 사용자 요청은 기존 host/IP/route/DNS/firewall/Docker daemon·기존 자원을 보존하는 조건으로 소유 none namespace의 실제 체인/DB/Anchor/API/worker/Asterisk/TURN/제품 웹·합성 음원 Chromium 시험, 시험 키/CA·오프라인 image build·관련 commit/일반 push/CI 조회를 한정 허용했다. Asterisk22.11.0/coturn4.6.3 및 공식 build 의존성 다운로드는 총500MiB 상한으로 별도 승인했다. public exposure·host 설정 변경·운영 데이터/마이크·외부 유료 AI/GCP는 허용하지 않았다. 실행 guard를 유지하고 소유 자원만 정리한다. 이 기록은 후속 세션의 상시 기동·다운로드 허가가 아니다. 결과·한계는 최신 진행 기록을 따른다.

## 2026-11-02 AWS 단독 배포 준비

최종 대회 대상은 AWS이며 개발 서버는 빌드/검증 전용이다. 현재 요청은 코드/설정/문서·기존 도구 수정, 서버 설정을 바꾸지 않는 제한된 로컬 전달 리허설·검사·관련 commit/일반 push/CI 확인을 허용한다. 리전/예산/도메인/IdP는 미정이다. AWS 자원 생성·구매·외부 업로드·공개 노출·유료 AI와 기존 host/network/service/volume 변경은 별도 허가 없이 하지 않는다. 폐기 시험 chain/DB를 대회 배포로 간주하지 않으며 기본 NEW와 승인된 기존 identity RESTORE를 구분한다. 이 기록은 이후 세션의 상시 실행 권한이 아니다.

## 2026-11-02 전달물 신규 전체 리허설의 한정 예외

이번 사용자 요청은 새 폐기 identity의 전달 archive load, 이미지/공개 파일과 합성 보호 입력만으로 소유 none namespace의 chain/DB/Anchor/API/worker/PBX/TURN/제품 웹·설치 Chromium, 기존 최종 runtime/nginx를 이용한 pin 웹 build, 소유 프로세스의 제한된 중단/재시도·실제 자연 세션 만료와 관련 commit/일반 push/CI 확인을 허용한다. host 설정·bridge/port publish·기존 자원·AWS/유료/공개 업로드·실제 IdP/음성/외부 AI·추가 다운로드는 허용하지 않는다. controller의 코드/브라우저와 로컬 OIDC 인증 fixture를 명시하며 소유 label/ID·예산·기한을 유지한다. 원본 실패는 보존하고 이 기록을 다음 세션의 상시 실행 허가로 사용하지 않는다.

## 2026-11-02 GitHub 산출물 보관·전달 작업

이번 요청은 기존 산출물의 읽기 전용 layer/history/build-input/첨부물 감사, 소스/공개 배포 파일의 commit·일반 push·고유 GitHub Release 게시/재다운로드, 권한이 있을 때만 기존 이미지를 비공개 GHCR에 게시·원격 digest/접근 확인하는 범위다. package 권한이 없는 현재 인증을 공개 전환이나 CI로 우회하지 않는다. token/키/채운 env/개인정보/DB/chain/session/image tar는 Git·공개 첨부물에서 제외한다. 서비스/노드/컨테이너·이미지 rebuild·기존 서버 설정/AWS 자원/과금은 실행하지 않는다. AWS NEW 키/identity는 향후 AWS에서 생성한다.


## 2026-11-03 4차 반영 소스 작업

이번 요청은 기관 운영 조회·정책 기반 분석·통화별 집계·CTI 계약·배포 재현성의 코드/시험/기존 문서 수정, 설치 의존성의 오프라인 검사/타입/무기동 웹 build와 관련 commit/일반 push·기존 light CI만 허용한다. 모든 서비스/DB/체인/Witness/PBX/TURN/Anchor/브라우저·migration/seed/계약·이미지 build/load/pull/push/Release·AWS/유료 제공자·다운로드·기존 서버/자원 변경은 허용하지 않는다. 신규 index migration은 소스만 작성한다. 실제 연결/모델 품질·산출물 발행은 별도 단계이며 이 기록은 후속 실행의 상시 허가가 아니다.

## 2026-11-03 최신 기능의 PostgreSQL·HTTP 검증 한정 예외

이번 요청은 새 identity의 network=none PostgreSQL/Unix socket, loopback Platform·Issuer·Sender·HTTPS OIDC/웹·설치 Chromium, 합성 계정/시험키/CA·migration·통합 시험·관련 commit/일반 push/light CI만 허용했다. DB CPU1·RAM/데이터512MiB, 앱 관측3GiB·임시5GiB·가용 RAM8GiB 여유와 지속 swap 중단 조건을 유지한다. 첫 자원 중단 후 사용자가 같은 예산의1회 재개를 승인했으며 재개 후 다시 swap 중단하여 추가 서비스 기동은 하지 않는다. 실제 체인/Witness/PBX/TURN/Anchor·음성장치·외부 IdP/AI/AWS·이미지/Release·기존 서버/자원 변경은 허용하지 않았다. 이 기록은 후속 기동의 상시 허가가 아니다.


## 2026-11-03 HTTP 재개 관측의 한정 작업

이번 요청은 기존 자원 기준을 만족할 때 새 소유 identity에서 HTTP/WS/Chromium을1회 재개하고 관련 검사·검토 branch commit/일반 push/light CI 확인을 허용한다. 사전 관측에서 연속 swap 기준이 충족되어 이번에는 서비스·DB·키·컨테이너를 생성/기동하지 않았다. 자동 재개·기준 완화 없이 관측/취소 전파를 오프라인 회귀하고 원인을 보존한다. 기존 host/network/daemon/global auth·서비스/volume·체인/Witness/PBX/TURN/Anchor·외부 제공자/AWS·이미지/Release 변경은 금지이며 이 기록은 후속 기동의 상시 허가가 아니다.


## 2026-11-03 명시적 압박 정책의 통합 검증

이번 요청은 `--policy integration-pressure-v1`(5초 표본·60초 사전 관측·명시한 memory/PSI/swap-out/OOM/RSS/disk/timeout 기준)을 선택한 소유 network=none PostgreSQL·loopback API/OIDC/웹·Chromium, 합성 입력·관련 commit/일반 push/light CI를 허용했다. 호스트 설정은 바꾸지 않았고 기본/과거 swap 정책을 보존했다. 최초 quota 실패DB를 초기화하지 않고 같은 소유 cluster에 회귀DB1개를 추가해 검증했으며 소유 자원은 정리했다. 체인/Witness/PBX/TURN/실제 Anchor·음성장치·외부 IdP/AI/AWS·이미지/Release·기존 자원 변경은 금지였다. 이 기록은 다음 실행의 자동 허가가 아니다.
