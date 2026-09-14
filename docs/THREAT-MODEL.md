# Threat model

## 공격자가 할 수 있는 것

- 기관과 같은 표시 이름을 주장하고 signaling payload·proof 필드·수신 대상·nonce·session·fingerprint를 복사하거나 바꾼다.
- 과거 정상 state bundle을 반복하고 신뢰되지 않은 witness 서명을 보탠다.
- 한 witness를 침해하거나 witness/node 일부를 중단한다.
- 다른 사용자의 승인 ID·opaque task ID를 자신의 세션에서 사용한다.
- 전사문에 prompt injection과 위험 요구를 넣는다.

공격자가 수신 브라우저의 신뢰된 JavaScript 자체를 바꿀 수 있다고 가정하지 않는다. 코드 배포 origin까지 장악한 공격은 잔여 위험이다.

## 방어

- 기관명만 있는 연락은 `UNVERIFIED`; 승인서가 있어도 recipient/nonce/session/epoch/delegation/purpose가 다르면 `REJECTED`.
- gateway는 자기 로컬 PeerConnection에서 생성한 fingerprint 문맥만 서명한다. 임의 외부 fingerprint 서명 API가 없다.
- authorizationId의 최초 binding을 DB unique constraint로 고정한다. 다른 binding은 409, 같은 binding은 멱등 재시도한다.
- 브라우저는 실제 remote certificate와 signed SDP fingerprint, datachannel 양방향 challenge를 대조한다.
- 서로 다른 고정 witness 3개가 같은 snapshot에 서명해야 한다. 하나의 거짓 응답, 중복 signer, 여러 block 혼합은 threshold를 만들지 못한다.
- 더 새로운 revoke를 안 뒤 이전 정상 snapshot으로 돌아갈 수 없다. stale/future/deadline 실패는 정상 표시를 숨긴다.
- `/official`은 별도 HttpOnly 세션과 task owner 조건을 사용하고 존재 여부를 숨기는 404를 반환한다.

## 보호하지 못하는 것

- 기관 승인 시스템과 gateway가 동시에 침해된 경우의 악성 승인 연락.
- 정상 인증된 상담원이 통화 중 위험한 요구를 하는 행위. 선택적 내용 분석은 읽기 전용 보조일 뿐이다.
- 정상 witness quorum이 모두 틀린 RPC 상태에 서명하거나 trust bundle·웹 앱 배포가 교체된 경우.
- 단일 호스트 Compose가 현실 조직의 운영 독립성을 보장한다는 주장.
- 실제 SIP 착신전환·회의·SFU·통신사 구간과 모바일 OS 표시.
- 미구현 P2 native QBFT header 및 storage proof 검증.
