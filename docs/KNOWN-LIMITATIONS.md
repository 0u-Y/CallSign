# 현재 구현의 한계

기준일: 2026-11-02. [현재 구현·검증 현황](guide/05-IMPLEMENTATION-STATUS.md)과 [개발 기록](FINALS-IMPLEMENTATION-PLAN.md#execution-readiness-20261029)을 함께 갱신한다. ‘부분 구현’은 코드가 남은 상태이며 ‘실환경 미검증’과 다르다.

## GitHub 보관·전달의 현재 차단

사용자가 Git 저장소/Release/GHCR을 최종 경로로 확정했다. 공개 파일 Release와 실제 수령 검증은 [RUNBOOK의 게시 기록](RUNBOOK.md#github-delivery-20261102)을 따른다. GHCR은 기존 토큰의 package 권한이 없어 차단이며 사용자도 별도 토큰이 아직 없다고 답했다. 로컬 config ID를 원격 manifest digest로 대체하거나 이미지를 공개로 전환하지 않는다. 공개 파일만으로 AWS 이미지 확보가 완료된 것은 아니다. 아래의 보관처 미정/미전송 설명은 앞선 실행 당시 범위다.

## 전달물 신규 리허설의 추가 범위

[2026-11-02 새 실행](FINALS-IMPLEMENTATION-PLAN.md#delivery-only-20261102)은 전달 archive/공개 파일과 새 시험 보호 입력으로 실제 전체 stack·제품 통화를 연결했다. 정책 변경·필수 정지/공동 키 복구·PBX 장애 재시도·장치 거절/없음을 실행했으며 자연 세션 만료는 관측 요청을 수정한 뒤 실제1시간 재검증을 완료했다. 아래 이전 기록의 ‘전체 신규 stack 미실행’은 당시 범위다. 같은 host/daemon의 격리 환경이며 실제 AWS override·외부 보관/재수령·외부 IdP/TLS/NAT/TURN·AI·독립 host 장애 검증으로 확대하지 않는다.

## AWS 배포 준비의 현재 경계

최종 대상은 AWS이며 현재 서버는 개발/빌드/검증 전용이다. 리전·예산·도메인·IdP는 사용자 답변상 미정이다. AWS override·별도 TLS Anchor·TURN renderer·7종 image inventory·신규/복원 절차를 준비했으나 실제 AWS 자원·외부 업로드·TLS/NAT·IdP·최종 web trust는 미검증/미준비다. 앞선 준비 단계의 이미지 전용 probe/hash 확인 이후, 위 후속 NEW 리허설에서 전체 로컬 stack과 제품 흐름을 추가 연결했다. AWS의 전체 신규 배포를 실행한 것은 아니다. [이번 실제 실행](FINALS-IMPLEMENTATION-PLAN.md#aws-preparation-20261102). 현재 서버 경로가 이미지 내부 설치 layout이나 과거 증거에 나타나는 것과 host bind/실행 연결 의존성을 구분한다. 공개 파일 묶음과 부분 이미지 archive만으로 전체 배포 성공이라고 하지 않는다. [정확한 입력과 gate](RUNBOOK.md#aws-competition).

## 실제 미디어 연결의 검증 범위

[2026-11-02 실행](FINALS-IMPLEMENTATION-PLAN.md#isolated-media-20261102)은 실제 원장·DB·HTTPS Anchor·runtime 역할·Asterisk22.11·coturn4.6.3·제품 웹을 연결했다. 양쪽 browser는660/990Hz 합성 마이크를 쓰고 실제 원격 트랙을 디코딩했다. 승인 전 무음, 양방향 상대 음원, 로그아웃·업무 취소·실제 lease 만료·위임 철회·긴급 정지 후 무음을 확인했다. 원장 확정과 실제 Witness 확인도 포함하지만 OIDC는 fixture다.

같은 namespace의 실제 relay 선택은 외부 NAT 통과나 독립 호스트 장애 내성이 아니다. Asterisk는 loopback host ICE 후보를 제외하므로 시험 전용 TURN을 PBX에도 연결했다. `allow-loopback-peers`는 이 격리 설정에만 사용하며 공개 TURN의 기본값으로 옮기지 않는다. 내장 G.711 μ-law의8kHz 음성 경로만 확인했고 Opus 변환·한국어 음질·실제 외부 STT/LLM·제공자 보관/취소/청구는 미검증이다.

초기 미디어 실행에 없었던 정책/키 복구·실제 PBX 제어 장애·장치 거절/없음은 위 전달물 NEW 리허설에서 추가 확인했다. 자연 세션 만료도 수정된 관측으로 실제1시간을 기다려 완료했다. 선택한 사례들의 결과이며 모든 실패 조합을 검증한 것은 아니다. 외부 IdP/MFA·다른 브라우저·AWS 외부망·전체 배포 복원은 별도다. 기존 fixture/단위 시험을 실통화 결과로 확대하지 않으며 실제 사람의 음성을 수집하지 않았다.

초기 기록은 최종 이미지의 역할 기동/서명/worker 관측과 candidate 이미지의 통화 결과를 구분한다. 이후 전달물 NEW 리허설은 같은 최종 runtime에서 새 통화를 실행했다. 초기4종 archive와 이후6종 bootstrap archive 모두 chain·DB·Anchor·키의 일관 서비스 백업이 아니다. 시험 controller의 PID 상한 도달 뒤 init으로 회수했고 상한을 늘리지 않았다. 공개 증거에는 관측 표본과 실제 cgroup peak의 출처를 구분한다. 클라우드 최소 사양·SLA는 확정하지 않았다.

전후 host 대조에서는 기존 veth1개와 연결된 IPv6 경로가 달랐다. 다른 route·Docker network ID·기존 container ID는 보존됐다. 비소유 restart-always container의 재시작이 관측됐지만 직접 대응은 미확정이며 host 전체 동일이라고 주장하지 않는다. 소유 none 자원은 모두 정리했고 그 차이를 복구하려고 기존 설정을 바꾸지 않았다.

## 배포 후보의 차단과 미확인

[2026-10-31 기록](FINALS-IMPLEMENTATION-PLAN.md#release-candidate-20261031)은 오프라인 정합성 검토다. 기본 ledger subnet과 기존 host network가 중복된다. 2026-11-01 신규 prefix10.206.0 제안은 현재 interface/IPv4 route/Docker IPAM 관측에서 비중복이나 아직 미적용이며 숨은 VPN/조직망/GCP는 미확인이다. 프로젝트·경로·chain ID 선택과 실제 생성물 준비 전 첫 chain 기동은 차단한다. 기존 자원 중단으로 해결하지 않았다. 다른 호스트/네트워크의 결정, DNS/TLS/OIDC·키 소유자·PBX/TURN·provider 입력과 실제 생성값은 [다섯 결정 묶음](RUNBOOK.md#배포-후보와-실제-연결-순서)에 구분한다.

API/trust 기본 명령·공개 CA mount·worker 보관 기간·Docker 시험/비밀 context 배제를 수정했지만 실제 image build/내용·mount UID·CA 전체 체인·TLS·IdP·PBX 모듈/ODBC 지원은 미확인이다. Web/Platform은 시작 가능과 readiness를 분리하므로 UI 표시 자체가 전체 준비 성공이 아니다. 기본 서비스의 OIDC는 공개 client+PKCE 경로이며 임의 confidential-client/secret 교환을 지원한다고 가정하지 않는다. 신규 배포는 LEDGER_IPV4_PREFIX 하나로 Compose subnet/static IP와 Besu advertised host/peer/allowlist를 파생한다. 지원 범위는 RFC1918 IPv4 /24이며 media10.205.0.0/24와 분리한다. 기존 peer 파일은 자동 덮어쓰지 않고 genesis/키/epoch는 바꾸지 않는다. 기존 배포 이동은 별도 검토/승인이 필요하다. chain preflight는 로컬 형식/파일/관측 CIDR만 확인하며 실제 합의·파일 UID 접근·현재 RPC·Witness 서명을 입증하지 않는다.

## 백업 경계 후속 검증의 적용 범위

[2026-10-30 후속 기록](FINALS-IMPLEMENTATION-PLAN.md#backup-boundaries-20261030)은 실제 쓰기/worker drain과 별도 PostgreSQL cluster 복원·LOGIN 권한, Anchor 지연 중 소수 요청을 추가 확인한다. 이전의 ‘정지 fixture/같은 cluster만 검증’ 표시는 그 당시 범위다. 최신 결과는 연결된 실행 증거를 따른다.

- admission fence는 이 migration/코드를 사용하는 모든 동일 DB replica가 준수해야 한다. owner 수동 SQL·구버전 writer·다른 DB source의 Anchor 자격 사용을 자동 제어하지 않는다. target 활성화의 source 정지 확인은 운영자 책임이며 자동 failover가 아니다.
- draining 중 안전 작업은 허용하지만 snapshot의 배타 구간에는 빠른503 재시도가 필요하다. 신규 일반 작업은 재개 전까지 차단하며 dead worker/미확정 작업 때문에 drain이 완료되지 않으면 abort/resume 후 재조정해야 한다. claim 이력을 지워 백업을 강행하지 않는다.
- HTTP 연결 종료가 서버 작업의 즉시 취소를 뜻하지 않는다. 시험의 미응답 Anchor 요청은 약2.5초 timeout 뒤 rollback했으며, Anchor CAS가 이미 성공한 응답 유실은 정확한 readback/저장 이력으로 확인해야 한다. 기관별 행 잠금은 유지한다. 큰 동시성·pool 고갈 내성·SLA 검증이 아니다.
- application 복원과 합성 키만 검증한다. 체인 전체 복원·운영 키 전체·호스트 내구성·GCP·실제 미디어/제공자는 여전히 별도다.

## 영속 복구의 추가 확인 범위

[영속 복구 평가](../artifacts/persistent-recovery-20261030.json)에서 실제 HTTPS anchor·별도 PG 저장소·API/worker 자식 프로세스·application 범위 암호화 백업/새 DB 복원을 확인했다. 아래 인증 단계의 메모리 anchor 설명은 그 실행 당시 경계다. 같은 호스트의 프로세스·volume·계정·복원 수명을 분리한 시험이며 독립 기관/호스트 장애 격리·전원/디스크 내구성을 입증하지 않는다.

복원 대상은 같은 시험 cluster의 새 DB이며, 새 cluster의 global role/owner provisioning과 운영 분산 drain은 이번 증거가 아니다. 백업은 API/worker 쓰기가 quiesced됐다는 운영 전제가 필요하고 SQL lock만으로 외부 anchor CAS를 정지시키지 못한다. 전체 chain archive 복원은 여전히 미실행이다. 새 manifest의 필수 inventory/size/migration 정보가 없는 구 bundle은 자동 수용하지 않으며, 부분 파일 복원 실패 뒤 DB gate는 blocked로 남긴다. 임의 악성 파일 동시 교체·강제 종료 시점 전수·장기 보관/용량·전체 운영 키/trust 조합은 미검증이다. 복구 전 확인이 필요한 worker에는 issuer 권한을 추가하지 않았으며 최초 checkpoint를 만들 수 없다. 실제 PBX/RTP·제공자·운영 IdP/GCP와 원장 적용 횟수는 검증하지 않았다.

## 인증 후속 경계

[후속 검증 평가](../artifacts/service-boundaries-20261030.json)는 `a75398d` 이후 변경의 별도 증거다. 공동 관리의 이벤트 소비·서명 검증·SQL·브라우저 처리, 계정 전환·공식 세션 만료·분석 취소 경계를 추가했지만, RPC/log·Witness 전송·STT/LLM은 명시적인 fixture다. Witness 시험키의 실제 서명 검증을 실제 Witness 서버나 독립 분산 운영으로 확대하지 않는다. 원격 오디오는 장치 없이 합성 프레임만 사용했다.

브라우저 탐색 중 빈 화면/로그인 버튼 timeout이 관측됐다. 시간 제한·retry로 숨기지 않고 탐색 실패 진단을 남겼으며 browser context를 한 Chromium 프로세스에서 분리해 자원을 줄였다. 이것만으로 과거 heading timeout의 원인이 확정됐다고 주장하지 않는다. Chromium `ERR_NETWORK_CHANGED`로 로그인 요청이 중단된 실행도 별도로 보존한다. 호스트 네트워크 변경의 발생 주체는 확정하지 못했으며 재시도로 숨기는 제품 동작을 추가하지 않았다. 운영 TLS·실제 IdP·여러 브라우저/장치·PBX/RTP와 제공자 취소·보관·청구는 계속 별도 검증이 필요하다.

## 현재 서비스

- **인증·원장·DB·미디어 선택 경로 검증, 전체 서비스 미검증.** 최신 실제 연결은 상단의2026-11-02 범위를 따른다. OIDC만 fixture이고 원장/Witness·PostgreSQL·HTTPS Anchor·PBX/TURN·합성 원격 음원은 실제 구현이다. 과거 HTTP/복구 평가의 대체 경계는 그 실행 당시의 것이며 최신 미디어 결과나 운영 IdP·외부 AI/GCP·전체 복원 성공으로 합산하지 않는다.
- **PBX 보장 경계.** Asterisk가 DTLS-SRTP 음성 종단이다. ARI는 채널·Call-ID·bridge를 조회한다. 인증서 지문은 배치한 공개 인증서에서 고정하고 브라우저의 실제 관측과 대조한다. 서버의 독립 DTLS handshake 수집이나 원 상담원의 개인 신원 증명은 아니다. 자체 SIP 모듈은 직접 Asterisk WSS/등록/수신 dialog로 제한하며 proxy route·PSTN·임의 transfer·재협상은 거절한다. 이번 Asterisk/PJSIP·ODBC·작업 CA·Chromium 경로는 확인했다. 운영 인증서·다른 단말·외부망 호환은 검증 전이다.
- **통화 정책값.** 120초는 attempt 생성부터의 연결 시작 창이다. lease 30초·최대 4시간은 설정 가능한 초기값이며 합의된 SLA가 아니다. 업무·VC가 먼저 만료되면 더 일찍 종료한다. 기관 서비스 재시작 후 기존 PBX 통화는 정리하고 새 시도를 요구한다. 진행 통화의 무중단 복원은 보장하지 않는다.
- **원장 외부 호출.** 같은 서명 raw tx/hash를 저장한 뒤 제출·조회·재전송한다. 외부 exactly-once는 아니다. 12회 실패는 운영자 확인 상태로 남고, 결과 불명의 signer nonce가 있으면 새 nonce 발급도 차단한다. 다른 도구가 같은 관리자 계정으로 동시에 tx를 제출하는 운영은 지원하지 않는다.
- **독립 복구 기준.** anchor는 별도 장애·백업 영역에 배치해야 한다. VM 백업 안의 값만으로 차단을 풀지 않는다. 외부 CAS 진행 뒤 DB commit이 불명확하거나 기존 소비 이력과 journal이 다르면 gate를 닫는다. 완전한 최신 이력이 없으면 자동 복구하지 않으며 운영자 재신뢰 판단이 필요하다. 구 배포를 새 구조로 옮길 때 소비 journal 기준도 별도 대조해야 한다.
- **DB와 운영.** 행 잠금·공통 소비 제약·quota 예약/정산·작업 claim·retention·권한 SQL을 작성했으나 격리 시험의 소비/claim/quota 경합·응답 유실과 auth LOGIN의 제한된 실제 허용/금지 SQL은 검증했다. 모든 production 역할의 SQL 전체, 영속 disk 장애/부하 내성은 미검증이다. JSONB 기관 aggregate의 실제 성장·잠금 비용도 미측정이다. 백업 도구의 chain archive는 정지된 체인의 일관 snapshot이어야 하며 이 조건을 파일 복사만으로 입증할 수 없다.
- **요금·AI.** 사용 초·요청·입력 바이트를 제한/계측하지만 STT는 연결 초/바이트와 응답을 제한하며 실제 제공자 음성 길이 과금·청구서·가격 정산은 구현하지 않았다. 제공자 콘솔 지출 한도와 짧은 입력 검토를 별도로 적용해야 한다. 원음/전사는 기본 비영구이고 모델 제공자 측 보관 설정은 별도 확인 대상이다. 36개 합성 개발 fixture의 규칙 결과는 독립 한국어 품질·실제 STT/LLM 평가가 아니다. 재연결은 새 동의·스트림을 요구하며 누락 음성을 복구하지 않는다.
- **인증·관리.** 주요 작업은 실제 OIDC auth_time이 최근인지 검사하고 토큰 iat로 재인증을 대신하지 않는다. 실제 IdP/MFA 정책은 미검증이며 로그인 진행 상태는 재시작 후 다시 로그인해야 한다. 관리 화면은 등록한 OIDC issuer/subject에 내부 역할을 연결하며 외부 IdP 계정을 생성하지 않는다. 공동 정책·공식 경로 변경은 새 계약에서 2-of-3으로 연결했지만 기존 배포가 자동 변경되지는 않는다. 공동 변경 전후 비교·제안 내보내기/서명 가져오기·로컬 digest/서명 검사를 연결했다. Chromium에서 로그인·생성/취소·역할 메뉴·390px overflow·Tab/focus·select label을 확인했으나 공동 관리 전체·다른 브라우저·보조기술 접근성은 미검증이다.
- **복구 이행.** 새 authority checkpoint 기준이 없는 구 DB는 gate를 닫는다. 별도 수명 anchor와 동일한 소비·계정/키/정책 이력을 복구하지 못하면 자동 해제하지 않는다. 기존 DB의 flag나 anchor만 임의로 초기화하는 절차는 없다. DB·Issuer·anchor 관리자는 신뢰 대상이며 이 journal이 임의 악성 DB 관리자까지 방어한다는 주장은 하지 않는다.
- **관측·알림·증거.** 내부 웹 알림은 영속/중복 억제/설정/만료를 구현했다. 외부 문자·메일 채널은 미선택이다. 제한된 오프라인 검사와 preflight의 증거 수집은 구현했으나 이번 합성 계정의 로컬 화면 스크린샷은 수집했으나 실제 통화/운영 환경 trace는 미수집이다. 고정 단계 runner가 기존 시험·guard·증거와 선행 identity를 연결하지만 Besu/Witness 전체 장애·TURN/철회·동의 중단·실제 복원·측정 수집·GCP 확인은 MANUAL이다. 자동 시험으로 위장하지 않으며 관측 출처를 검토 후 호환 status는 MANUAL로 남지만 assessment는 수동/완료/검토된 PASS 또는 FAIL을 기록한다. 과거 MANUAL이나 첨부만으로 PASS하지 않는다. 브라우저 지연 표본은 사용자 단말의 비신뢰 관측이며 체인 확정→화면까지의 실측을 대신하지 않는다.
- **실행 준비 검사.** runtime preflight는 BLOCKED62·PASS14·SKIPPED1이다. 각 차단의 준비 주체/입력/순서는 실행 준비 artifact에 기록했다. local PASS는 이미지 존재·SQL GRANT·실제 DNS/인증서 handshake·독립성의 증거가 아니다. Node 자식의 네트워크/listen 제한은 OS 수준의 악성 코드 sandbox가 아니며 브라우저·네이티브 도구의 모든 통신을 일반적으로 가로채는 보장은 없다. runner는 고정 도구/시험 소스와 별도 test 배포만 사용한다.
- **신뢰 게시.** 정책/키 확정 뒤 공개 trust·웹 pin·runtimePolicy가 맞지 않으면 신규 발급/연결을 막는다. 여러 replica·오래된 탭·캐시의 실제 전환과 일부 배포 실패 복구는 검증 전이다. 일반 재시작에 신뢰 전환이나 키 재생성을 숨기지 않는다.
- **별도 확장.** 선택 DID의 추가 DNS/캐시 방어와 체인 헤더·commit seal·account/storage proof 직접 검증은 기본 PBX 서비스와 분리한다. Witness를 native proof로 설명하지 않는다.

## 보존한 초기 시연의 한계와 정책 차이

아래는 **2026-09-14 코드·시험**의 범위다. 현재 서비스가 통과한 결과나 운영 절차로 사용하지 않는다.

- Chromium 153·같은 컴퓨터에서의 직접 통화·실제 원격 인증서 관측만 검증했다. Firefox/Safari·실제 모바일·TURN·여러 기기는 미검증이었다.
- 네 노드·증언자는 키·프로세스·조회 서버가 나뉘었으나 같은 호스트·운영자여서 독립 기관 운영의 증거가 아니었다.
- 시연은 승인마다 새 위임을 생성하고 철회 후 통화는 유지한 채 인증 표시만 철회했다. **현재 목표는 위임 재사용과 명시적 철회 시 통화 종료**다.
- 당시 활성 화면은 3초 주기로 상태를 조회했고 마지막 기록의 취소 요청→표시 철회는 6.691초였다. 현재 체인 확정 후 5초 목표와 측정 시작점·코드가 다르다. 만료 뒤 화면 타이머 지연의 반복 측정도 하지 않았다.
- 공동 복구에서 관리자·정지키를 바꿨지만 기관 승인용 Ed25519 키는 유지했다. 새 승인키 교체 성공의 증거로 사용할 수 없다.
- 시연용 신뢰 설정을 다시 생성하는 `demo:up`은 초기화 도구다. 현재 배포의 일반 재시작·복원 명령이 아니다.
- 합성 전사문·규칙과 선택 Ollama 연결 코드는 있었으나 실제 모델 추론은 하지 않았다.
- 당시 Vercel 공개 화면은 고정 시험 데이터·브라우저 내 검증·저장된 로컬 증거를 보여주는 미리보기였다. 원격 PostgreSQL·Besu·분리 브라우저 전체 서비스는 아니었으며 현재 공개 주소·자동 배포 연결은 재확인하지 않았다.

최신 실행 준비 후속에서는 전체 설정과 DB 소스 선행 조건을 분리했다. 검토한 수동 PASS도 사람의 관측/판정이며 독립기관 운영·침해 내성 인증이 아니다. sourceFiles/계약 파일 hash는 코드·선택 공개 산출물의 범위이고 개인키·DB/chain 상태·이미지의 실제 실행을 포함하지 않는다. [최신 기록](FINALS-IMPLEMENTATION-PLAN.md#readiness-refinement-20261029)을 따른다.

## 로컬 EVM 검증의 보장 범위

2026-10-30 계약21시험·실패/skip0, 제한 fuzz32회, 실제 앱 EIP-712와 계약의 digest/signer/calldata/event 호환을 확인했다. 이는 설치된 forge/Solc의 로컬 실행이며 Besu/QBFT 합의·P2P·Witness·실제 배포·오프체인 회수 전파의 검증이 아니다. 기존 InstitutionRegistry는 회귀용이며 기본 ServiceRegistry의 모든 추가 서명 검증·legacy 우회 차단과 구분한다.

온체인은 정책/공식 경로의 hash와 version을 검증할 뿐 질문·표시 문자열의 의미를 해석하지 않는다. directory-only의 현재 제품 범위는 서버 schema가 제한한 `/official` 표시명 변경이며 임의 외부 경로의 안전성을 증명하지 않는다. 전역 nonce는 기관 간에도 재사용할 수 없다. fuzz는 assume 없는2단계 sequence32회이며 전체 상태 공간의 invariant 증명은 아니다. [현재 증거](../artifacts/contract-validation-20261030.json)를 따른다.

첫 공개 push CI에서 source checker의 rg 의존성이 실패해 Git 기반 목록으로 수정했다. 현재 source hygiene는 Git checkout이 필요하며 rg 설치는 요구하지 않는다. 당시 로컬 light는43파일195시험 PASS이고 원격 CI 상태는 해당 실행 URL을 별도로 확인한다.

## 인증·화면 시험의 대체 경계

실제 로그인/세션/권한 middleware·issuer/platform/Sender Agent HTTP·역할별 PostgreSQL은 실행했다. 로컬 OIDC fixture는 production IdP/MFA 호환성이 아니며 앱은 discovery 대신 설정한 endpoint를 소비한다. Node는 시험 CA로 TLS 검증했고 Chromium context만 시험 인증서 오류를 허용했다. 운영 인증서 정책을 바꾸지 않았다. 실제 원격 오디오·PBX·Witness snapshot SDK 검증·체인 권한 전파·제공자 장애 중 분석 회수는 미실행이다.

시험 중 heading timeout1회는 원인을 확정하지 못했고 후속 순차 실행에서는 재현되지 않았다. 개발 실패와 최종 PASS를 구분해 보존했다. 화면 캡처에는 합성 계정만 있으며 cookie·storage·trace·음성은 공유하지 않는다. API/DB가 시험 fixture에서 통과한 것은 전체 배포 readiness나 성능 목표 달성이 아니다.
