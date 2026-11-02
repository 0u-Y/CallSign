# 시스템 아키텍처

기본 제품은 `/service` → `/v3`의 등록 URI·교환기 통화 경로다. 이 문서는 구성·키·데이터·신뢰 경계를 설명한다. 요구는 [MASTER](MASTER-DEVELOPMENT-SPEC.md), 데이터 형식은 [프로토콜](PROTOCOL.md), 실제 실행 범위는 [구현 현황](guide/05-IMPLEMENTATION-STATUS.md), 설정·기동은 [RUNBOOK](RUNBOOK.md)이 기준이다.

## 확정 기본 서비스와 이행 상태

기관→콜센터의 업무 위임 VC와 고객별 개별 연락 승인을 구별한다. 등록 URI·등록 Ed25519 공개키가 기본이고 DID 조회는 선택 호환 기능이다. 120초는 최초 연결 시작 창이며 진행 통화는 같은 binding·권한 세대에 한정한 lease로 갱신한다. 세 형식의 입력은 strict 진입점으로 구분하며 검증 실패 시 이전 형식으로 자동 전환하지 않는다.

[현재 서비스 구조도](guide/02-ARCHITECTURE.md)는 통화·분석 경로를, [통화 흐름](guide/03-CALL-FLOW.md)은 준비·소비·수락·미디어 허용 순서를 설명한다. `/finals`의 직접 통화와 초기 시청 시연은 호환·회귀 경로다.

## 역할·키·저장소 경계

| 구성요소 | 책임과 접근 범위 |
|---|---|
| Platform | 인증된 사용자 요청·서명 데이터 중계. DB client나 기관·콜센터 개인키를 생성하지 않음 |
| Issuer Gateway | 업무·개별 승인·소비·취소·계정 권한 검사. 기관 승인키/PBX 증거키와 issuer/auth의 서로 다른 DB LOGIN 사용 |
| Sender Agent | 콜센터 장기키 하나와 요청별 서명. 할당·시도·브라우저 공개키를 다시 확인 |
| worker | 원장 관리자·긴급 정지키, 영속 outbox·서명자 lease·사건 cursor·자원 회수·retention. Issuer에 원장 관리키를 mount하지 않음 |
| PostgreSQL | 기관별 JSONB 업무 상태, 세션·회원 세대, 공통 소비 식별 범위·영수증·journal·outbox·quota |
| 별도 HTTPS Anchor | 배포/기관의 journal 순번·hash·권한 기준을 CAS로 전진. DB 백업과 분리된 저장 수명·인증·운영 책임 필요 |
| Besu·ServiceRegistry | 기관·위임 digest·키·epoch·정책·철회 상태. 고객별 통화·음성·전사 원문을 기록하지 않음 |
| Witness | 각자의 RPC·고정 키로 같은 체인/블록/상태에 서명. 서로 다른 3-of-4 상태 증언 검증 |
| 브라우저 | 통화별 단기키, 고정 trust pin, 서명·세션·실제 연결 근거 대조. 서버의 성공 boolean만 신뢰하지 않음 |

같은 runtime 이미지를 `SERVICE_ROLE`로 나눈다. 공동 승인자 개인키는 공유 mount하지 않으며 승인자는 [서명 도구](../scripts/sign-recovery.ts)로 자기 키 하나를 사용한다. PBX 증거키와 Asterisk TLS 개인키도 구별한다. 역할별 LOGIN·키 분리는 호스트 관리자 침해나 하드웨어 격리의 증명이 아니다.

<a id="보존한-직접-통화-호환-경로"></a>

## 직접 경로와 PBX

기본 경로는 상담원 웹 ↔ Asterisk PJSIP/WSS·DTLS-SRTP ↔ 수신 웹이다. [교환기 제어](../services/api/src/asterisk.ts)는 실제 ARI channel·Call-ID·bridge를 조회한다. 준비 단계의 양 채널 mute, 양측 준비 서명·수락·유효 lease 확인, bridge 구성·확인과 음소거 해제, 브라우저의 최종 증거 확인을 구별한다. 취소·철회·로그아웃·만료는 감시와 영속 cleanup에 연결된다.

서버의 PBX fingerprint 출처는 `configured-certificate`다. 서버는 고정 인증서와 ARI 관측을, 브라우저는 실제 DTLS 인증서·SDP·SIP Call-ID를 대조한다. 서버가 DTLS handshake를 독립 수집했다고 주장하지 않는다. ARI 성공·PeerConnection 상태·RTP 증가만으로 실제 음성 전달을 판정하지 않는다.

Asterisk는 음성 종단이므로 PBX와 그 운영자는 신뢰 대상이다. `/finals`의 상대 브라우저 직접 DTLS/datachannel 검증과 혼동하지 않는다. 이전 `MediaEdgeAdapter`는 호환 helper이며 별도 외부 Media Edge 서비스가 있다는 근거가 아니다.

<a id="신뢰-경계"></a>

## 분석과 신뢰 경계

수신한 상대 remote stream만 동의 후 분석 경로에 보낸다. Deepgram STT adapter는 음성→전사, 규칙·Anthropic adapter는 전사/목적 정책→위험 근거를 처리한다. 동의·세션·revision이 바뀌면 추가 전송과 늦은 결과 반영을 차단한다. 외부 제공자 품질·보관·취소·비용 조건은 미검증이다.

웹 코드·trust bundle 배포자, 등록 기관/콜센터·PBX·Witness 키, 브라우저/OS, DB/Anchor 운영자는 여전히 신뢰 경계다. Witness 정족수는 native chain proof가 아니고, 한 호스트의 여러 validator/Witness는 독립 운영기관의 장애 내성을 입증하지 않는다. [위협 모델](THREAT-MODEL.md)을 따른다.

## 영속 처리와 복원 경계

기관별 JSONB aggregate를 transaction에서 직렬화하고 업무·소비·취소의 순서를 정한다. `issuer_v2.outbox`의 claim token/만료, 서명 raw transaction/nonce 보존과 재조회로 재처리한다. 외부 호출과 SQL 사이 exactly-once나 분산 원자 commit은 보장하지 않는다.

journal 전체 순번·hash chain·권한 metadata와 독립 Anchor를 대조한다. 읽기 snapshot 검사 뒤 짧은 잠금에서 head/metadata를 재확인하며, CAS 뒤 DB commit이 유실되거나 Anchor가 앞서면 gate를 자동 해제하지 않는다. 백업 drain은 신규 권한 쓰기를 막고 진행 중 CAS/DB·worker를 정리한 뒤 snapshot과 checkpoint를 연결한다. 안전을 위한 종료/철회를 무조건 멈추지 않는다.

복원은 소비 이력·계정/키/epoch를 보존하고 세션·미사용 승인·임시 연결을 폐기한다. 같은 호스트의 별도 cluster·HTTPS Anchor·application 복원 시험과 전체 chain archive/독립 호스트 복원은 다르다. [복구 절차](RUNBOOK.md#쓰기-중-백업-준비와-별도-cluster-복원)를 따른다.

<a id="joint-operating-model"></a>

## 공동 운영의 현재 권한과 제안 배치

현재 계약의 관리 승인자는 **Registry 전체가 공유하는 고정3명**이며 주요 관리 명령은 서로 다른2명의 서명이 필요하다. 대칭적인2-of-3이므로 특정 기관 대표의 동의가 반드시 포함되지는 않는다. 기관별 승인자 집합·승인자 교체·정족수 변경은 구현하지 않았고 이번에도 ABI·bytecode·EIP-712 도메인을 바꾸지 않았다. 관리2-of-3, Witness3-of-4, QBFT 검증자 합의는 서로 다른 판단이다.

| 주체 | 현재 권한·책임 | 운영 시 분리할 것 |
|---|---|---|
| Registry 전역 관리 승인자3명 | 기관 등록·공동 설정·복구·콜센터 키 변경의 정확한 명령에 서명. 일반 연락의 개별 승인은 아님 | 각자 승인키·승인 검토·보관 책임. 서로 다른 이름만으로 독립성 성립 안 됨 |
| 기관 담당자·기관 승인키 | 내부 contact/delegation/manage 권한으로 업무·승인·취소. 기관 서명 서비스가 Ed25519 승인 | OIDC 계정·최근 재인증·권한 세대와 서버키 보관을 구별 |
| 기관 긴급 정지 주체 | 등록된 자기 기관의 stopper가 정지. 공동 복구·키 활성화는 별도 절차 | 다른 기관을 정지할 포괄 권한 없음. 전역 승인키와 분리 |
| 콜센터·상담원 | 등록 서비스키와 개인 로그인·할당으로 승인 요청. 수신자 수락·키 검증 생략 불가 | 센터키 보유가 모든 상담원·고객 권한을 뜻하지 않음 |
| QBFT 검증자 | 원장 변경 순서·확정에 참여 | 서로 다른 운영자/클라우드 계정·관리 접근을 갖는 배치는 제안이며 실증 아님 |
| Witness | 각자의 원장 조회 결과에 서명. 수신 웹은 서로 다른3개를 검증 | RPC·키·운영자 분리. 체인 직접 증명의 대체 구현은 아님 |
| 서비스·DB·PBX·Anchor 운영자 | 상태·음성 종단·보관·배포·복구를 운영. 운영권 자체로 연락 승인 권한을 얻지 않음 | 공통 관리자·키 저장소·RPC·클라우드 계정이 함께 침해/중단될 수 있음 |

전역 승인자2명의 공모는 공동 관리 명령을 승인할 수 있고, Witness 정족수 키의 공모는 허위 상태 증언 위험을 만든다. PBX와 웹 배포자는 음성/검증 화면의 신뢰 대상이며 DB·Issuer·Anchor 관리자 침해 전체를 journal이 방어하지는 않는다. 지금까지 같은 호스트의 합성 키/노드 실행은 이 독립 운영 모델의 검증이 아니다. [위협 모델](THREAT-MODEL.md)을 따른다.

기관 운영 조회는 `/v3/management/recalls`에서 같은 기관의 업무·위임 digest·시도·요청 기록·마지막 원장 사건·서버 종료·PBX 회수 관측을 제한된 목록으로 반환한다. 서버 종료와 `pbx-absent`는 별개이며 후자는 ARI DELETE 뒤 채널/브리지 GET404를 확인한 관측이다. 실제 디코딩 음성 중단 증거가 아니다. JSON aggregate의 선택 필드이므로 기존 행은 관측 없음으로 읽고 과거 종료 상태에 새 증거를 만들어 붙이지 않는다.

## 공동 설정·내부 계정의 권한 경계

`ServiceRegistry.updateConfiguration`과 복구 등 주요 관리는 서로 다른 유효 관리키 2-of-3의 EIP-712 서명을 요구한다. nonce·이전/다음 상태·정확한 작업 내용과 chain/contract를 결합한다. 제출·receipt·원장 상태·최신 Witness 확인·활성화를 구분한다. 정책 hash 변경은 epoch를 전진시키고 이전 VC/승인/lease를 회수하며 새 trust/web pin이 필요하다.

내부 계정은 검증된 OIDC issuer/subject에 역할을 연결한다. 최근 auth_time·CSRF·기관/역할·회원 세대를 API와 SQL transaction에서 확인한다. 이메일 기반 자동 연결·별도 우회 로그인·일반 관리자의 공동 승인자 임의 생성은 제공하지 않는다.

<a id="배포-후보-구성의-현재-경계"></a>

## 배포

[기본 Compose](../infra/deploy/compose.yml), [PBX overlay](../infra/deploy/compose.pbx.yml), [AWS override](../infra/deploy/compose.aws.yml), [별도 Anchor](../infra/deploy/compose.anchor.yml)를 사용한다. DB/RPC/ARI는 내부 전용이고 브라우저 공개 origin과 내부 DNS를 구별한다. `SERVICE_EXTRA_CA_PATH`는 공개 CA bundle이며 서버 역할에만 mount한다. 서비스 시작과 readiness도 구별한다.

대회 대상은 AWS다. 개발 서버의 IP·파일·DB·Anchor·로그인·이미지 제공 경로에 의존하지 않는다. GitHub Release/비공개 GHCR 전달과 실제 AWS 운영은 별도 단계이며 [현재 고정 버전·수령 절차](RUNBOOK.md#github-delivery-20261102)에서 관리한다. NEW는 새 identity를 준비하고, 일반 재시작/RESTORE는 기존 키·genesis·epoch·소비 이력을 초기화하지 않는다. GCP/Vercel 구성은 과거 보존물이다.

<details>
<summary>초기 시청 시연의 구성 기록</summary>

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


</details>
