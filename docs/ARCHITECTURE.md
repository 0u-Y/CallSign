# Architecture

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

## 배포 구성

- Compose: PostgreSQL 17.6, Besu 26.8.1 validator 4개, witness Node 프로세스 4개.
- Host: Fastify API·issuer·signaling 단일 프로세스 4100, Vite 4173. 배포 프로세스는 합쳤지만 issuer key 코드, gateway 브라우저 key, signaling 역할 검사는 분리했다. Besu RPC는 18545/28545/38545/48545에 localhost로만 노출한다.
- 원장: chainId 20260914, QBFT 고정 validator set, 초기 block period 2초, Cancun 활성화, zero base fee 데모 프로파일.
- 계약과 상태: 고객·연락 데이터는 DB/서명 객체에 있고, 원장에는 기관·위임·정지·복구·directory 상태만 있다.

## 신뢰 경계

수신 앱의 배포 코드와 그 안에 생성된 trust bundle, enrollment 서비스, 기관 승인 시스템, gateway 종단 코드, 브라우저/OS를 신뢰한다. 집계 API의 `verified` 플래그는 존재하지 않으며 브라우저가 서명을 검증한다. 다만 동일 운영자가 웹 코드 배포와 trust bundle까지 교체하면 정상 표시를 위조할 수 있다.

네 witness는 프로세스·키·RPC 경계가 분리됐지만 한 컴퓨터와 한 Compose 운영자 위에 있으므로 현실의 독립 기관 운영을 입증하지 않는다. QBFT 합의와 witness quorum은 서로 다른 신뢰 가정이다.
