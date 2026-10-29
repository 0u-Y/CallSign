# 시스템 아키텍처

이 문서의 Platform은 요청 중계, Issuer Gateway는 기관 승인, Sender Agent는 콜센터 서명 서비스다. PBX는 교환기이며 Witness는 원장 상태 증언자다. 통신 형식 번호·세션 결합·갱신형 통화 유지 허가 등은 [용어와 형식 대응](PROTOCOL.md#protocol-profiles)을 따른다.

## 확정 기본 서비스와 이행 상태

2026-10-27: 등록 기관/콜센터 URI·키를 기본으로 하고 DID는 선택 호환 기능이다. VC는 기관→콜센터 업무 위임, 개별 승인은 이번 고객·업무·세션에 한정한다.120초 시작 승인·현재 권한 상태 최신성·진행 통화 lease를 분리한다. 기본 음성은 양측 웹↔Asterisk PJSIP/WSS+ARI↔웹이며 Asterisk가 media edge 종단이다. native proof는 별도 후속 확장이다.

기본 `/service` 화면은 URI 기반 위임·개별 승인·수신 nonce·양측 단기키 서명·일회 소비·수신 SDK·통화 유지·PBX·동의 기반 원격 음성 분석으로 연결했다. 영속 worker는 서명 요청/nonce 보존·재조회, 원장 사건 cursor, 회수·사용량·보관 처리를 수행한다. 이는 코드 연결 상태이며 실제 DB·체인·교환기·브라우저·외부 AI 성공을 뜻하지 않는다. 아래 도식의 직접 WebRTC는 `/finals` 호환 경로이고 현재 기본 경로는 서비스 가이드 그림을 따른다. [현재 상태](FINALS-IMPLEMENTATION-PLAN.md#service-20261027), [서비스 구조도](guide/02-ARCHITECTURE.md).

## 보존한 직접 통화 호환 경로

```mermaid
flowchart LR
  UI[역할별 React 앱] -->|HTTPS/WSS, 역할 세션| P[Platform: 기관 DB·개인키 없음]
  P -->|별도 service token + 원래 사용자 세션| I[Issuer Gateway]
  P -->|다른 서비스 채널| S[Sender Agent]
  S -->|할당·시도·브라우저 공개키 재검사| I
  I --> A[(issuer_v2 기관 행 잠금·삭제 없이 추가하는 감사 기록)]
  I --> U[(별도 auth 계정: users/sessions)]
  S --> SK[서비스 장기키]
  I --> IK[기관 승인키 버전별 파일]
  I --> W[서로 다른 witness 3-of-4]
  W --> B[Besu QBFT 4개]
  UI <-->|직접 WebRTC / 수락 후 양방향 마이크| PEER[상대 브라우저 세션키]
  UI -->|동의한 상대 음성| I
  I --> STT[Deepgram streaming]
  STT --> REV[전사 구간·수정 번호·목적 정책]
  REV --> RULE[규칙 + 선택 Anthropic]
  RULE -->|근거·revision·철회| UI
```

같은 소스 이미지를 `SERVICE_ROLE`로 나눈다. Platform 역할은 DB client와 private key를 생성하지 않는다. Sender는 서비스키 한 개만 mount한다. Issuer는 기관 승인키, 업무/소비 쓰기 계정과 auth 별도 계정을 가진다. 원장 관리/긴급 정지 키는 별도 worker에만 mount하며 Issuer에는 mount하지 않는다. PBX 증거키는 Issuer, Asterisk TLS 개인키는 교환기에만 둔다. 공동 승인자 개인키는 어디에도 공유 mount하지 않는다. `scripts/sign-recovery.ts`는 승인자 환경에서 자기 키 하나만 사용한다.

기관별 JSONB aggregate에 업무/위임/시도/승인/영수증을 저장하고, `SELECT ... FOR UPDATE` 후 검사·서명·갱신을 같은 transaction에서 수행한다. 감사는 별도 테이블에 append한다. Platform/Sender group에 issuer_v2 schema 접근을 주지 않는다. 실제 DB 계정 격리·경합/가용성은 통합 시험 대기다. JSONB aggregate는 기관 단위로 상태를 직렬화하는 현재 선택이며 대규모 저장소 설계는 아니다.

브라우저는 짧은 세션키만 가진다. 고정한 trust bundle hash에서 기관/서비스/witness키를 얻고 VC·승인·허가·소비영수증·최신 일회성 난수 상태응답·원장 특정 블록의 상태 묶음·SDP·실제 DTLS/datachannel을 직접 대조한다. `/official` 권한은 별도 OIDC audience/cookie와 소유권 조건이다. 브라우저 코드와 trust bundle을 함께 바꿀 수 있는 운영자는 여전히 신뢰 경계다.

## 직접 경로와 PBX

직접 경로의 DTLS 종단은 상대 브라우저 PeerConnection이다. ICE 변경·새 연결은 새 승인과 전송 검증이 필요하다. 수락 전 마이크 track을 sender에 부착하지 않고 종료/오류에서 track을 stop한다.

새 PBX 경로의 종단은 Asterisk다. `asterisk.ts`는 실제 ARI channel·Call-ID·bridge를 조회해 signed browser report와 대조하고 준비 시 두 채널을 mute, 수락/lease 후 bridge 멤버 확인·unmute한다. 별도 PBX Ed25519 키의 JWS를 `verifier/service.ts`가 승인·receipt·통화 유지 허가·state·SIP Call-ID·DTLS 문맥과 대조하는 코드를 작성했다. `pbxSip.ts`는 SHA-256 내용 해시 REGISTER와 수신 INVITE/ACK·WebRTC answer의 제한된 브라우저 모듈이다. `ServiceCall`과 역할 화면, ARI 사건 구독·재구독, 재시작 종료·회수, 철회/logout, realtime endpoint SQL·설정·배포 profile과 브라우저 통합 시험 소스를 연결했다. 실환경 시험은 하지 않았다. 브라우저는 실제 DTLS 인증서를 관측하지만 서버는 ARI 채널/Call-ID/bridge와 사전 고정한 PBX 인증서를 대조한다. 이를 서버가 독립적으로 DTLS handshake를 관측한 것으로 설명하지 않는다.

이전 `media.ts`의 `AsteriskAdapter`/`MediaEdgeAdapter`는 과거 helper이며 실제 외부 Edge가 존재한다는 근거가 아니다. PBX는 상담원 개인 신원이나 내부 구간의 종단 간 진실을 증명하지 않는다. 역할 분리 직접 통화 경로 consume/SDK는 여전히 PBX profile을 직접 통화로 승인하지 않는다.

## 배포

`infra/deploy/compose.yml`: DB, Besu4, witness4, Issuer/Sender/Platform, web, HTTPS/TURN, 별도 원장 worker 및 PBX overlay의 Asterisk다. 독립 소비 anchor는 같은 VM 백업 밖 별도 저장소와 HTTPS 서비스로 운영해야 한다. DB/RPC는 host에 공개하지 않는다. application network는 내부망이고 provider 통신은 별도 egress network다. 각 witness는 자기 private key와 deployment metadata만 읽는다. 키 누락 시 자동 재발급하지 않는다. 체인·DB는 named volume, 키/trust/genesis는 명시적인 persistent 디렉터리다. GCP 구성은 기존 배포를 재시작할 뿐 bootstrap을 하지 않는다. 자세한 이전/복원은 [runbook](RUNBOOK.md).

## 초기 시연의 로컬 구성: 과거 코드 보존

아래는 2026-09-14 초기 시연 코드의 구성이다. 현재 키 격리·실행 성공의 증거가 아니다. 초기화·기동 명령은 현재 작업에서 실행하지 않는다.


```mermaid
flowchart LR
  I[기관 브라우저] -->|역할 세션 + CSRF| API[Fastify API 프로세스\nissuer 코드·signaling 경계 분리]
  G[게이트웨이 브라우저\n로컬 Ed25519 키] <-->|인증 WebSocket| API
  R[수신 브라우저\n고정 trust bundle] <-->|인증 WebSocket| API
  G <-->|WebRTC audio + datachannel\n동일 PeerConnection| R
  API -->|원자적 consume| DB[(PostgreSQL)]
  API -->|viem tx| C[InstitutionRegistry]
  C --- B1[Besu 1]
  C --- B2[Besu 2]
  C --- B3[Besu 3]
  C --- B4[Besu 4]
  B1 --> W1[Witness 1]
  B2 --> W2[Witness 2]
  B3 --> W3[Witness 3]
  B4 --> W4[Witness 4]
  W1 & W2 & W3 & W4 -->|동일 payload 서명 전달| API
  API -->|집계만 수행| R
  R --> O[/official 별도 로그인]
  O --> DB
```

## 당시 로컬 배포 구성

- Compose: PostgreSQL 17.6, Besu 26.8.1 validator 4개, witness Node 프로세스 4개.
- Host: Fastify API·issuer·signaling 단일 프로세스 4100, Vite 4173. 배포 프로세스는 합쳤지만 issuer key 코드, gateway 브라우저 key, signaling 역할 검사는 분리했다. Besu RPC는 18545/28545/38545/48545에 localhost로만 노출한다.
- 원장: chainId 20260914, QBFT 고정 validator set, 초기 block period 2초, Cancun 활성화, zero base fee 데모 프로파일.
- 계약과 상태: 고객·연락 데이터는 DB/서명 객체에 있고, 원장에는 기관·위임·정지·복구·directory 상태만 있다.

## 신뢰 경계

수신 앱의 배포 코드와 그 안에 생성된 trust bundle, enrollment 서비스, 기관 승인 시스템, gateway 종단 코드, 브라우저/OS를 신뢰한다. 집계 API의 `verified` 플래그는 존재하지 않으며 브라우저가 서명을 검증한다. 다만 동일 운영자가 웹 코드 배포와 trust bundle까지 교체하면 정상 표시를 위조할 수 있다.

네 witness는 프로세스·키·RPC 경계가 분리됐지만 한 컴퓨터와 한 Compose 운영자 위에 있으므로 현실의 독립 기관 운영을 입증하지 않는다. QBFT 합의와 witness quorum은 서로 다른 신뢰 가정이다.

## 영속 처리와 복원 경계

`issuer_v2.outbox`의 claim token·만료로 작업을 배정하고 제출 전 서명 raw transaction과 nonce를 저장한다. 외부 호출과 SQL 사이 exactly-once를 주장하지 않으며 동일 요청을 재조회·재처리한다. 원장 확인과 Witness 최신 상태 확인은 별개다. 기관 JSONB는 종료된 개인정보를 보관 정책으로 줄이지만 승인 소비 식별 범위와 hash journal은 유지한다.

신규 소비와 계정·키·정책 및 취소/회수 사건은 DB journal과 독립 anchor의 순서·hash에 결합한다. 재시작 검사는 읽기 전용 snapshot에서 500행씩 전체 순번·각 hash 연결·권한 metadata marker를 검증하고 마지막 짧은 잠금에서 head·metadata·검사 token을 재확인하므로 마지막 root만 남은 중간 이력 유실도 거절한다. 복원 검증 전 gate를 닫고 anchor/DB 불일치·anchor 미설정이면 신규 발급·연결을 거절한다. anchor가 먼저 전진한 뒤 DB commit이 유실되면 자동 해제하지 않는다. 이는 가용성보다 재사용 차단을 우선한 설계이며 실제 백업·복원은 미검증이다.

## 공동 설정·내부 계정의 권한 경계

기본 새 `ServiceRegistry`의 `updateConfiguration`은 독립 관리키 2-of-3을 요구한다. 구 directory 단독 변경은 거절한다. 제안/독립 서명/작업 제출과 원장 확정/정책 활성화는 다른 상태다. event의 nonce·정확한 내용과 같은 블록 상태, 최신 Witness profile/policyHash를 대조한 뒤 활성화한다. policyHash 변경은 epoch를 올리고 구 권한을 회수한다. 구 배포에는 proxy upgrade가 없으므로 새 주소와 trust 게시가 필요하다.

내부 계정 화면→Issuer 최근 인증/CSRF→제한된 SQL 함수→기관 aggregate와 세션 generation→권한 checkpoint를 같은 DB transaction으로 연결한다. 외부 IdP 사용자 생성이나 이메일 기반 자동 연결은 없다. 일반 관리자는 공동 승인자 집합을 단독 변경할 수 없다. 플랫폼은 계정/업무 DB에 직접 쓰지 않는다.

원장 서명 준비는 서명자별 영속 lease로 조정하고 RPC 대기 중 전역 DB transaction을 열지 않는다. 늦은 결과는 token·기한을 재검사한 뒤 저장한다. anchor CAS는 DB와 분산 원자성을 제공하지 않으므로 CAS 뒤 commit 유실은 차단 상태다. 이 경계와 새 배포 기준은 [RUNBOOK](RUNBOOK.md)에 있다. 실제 DB/체인/복구 검증은 미실행이다.
