# 현재 서비스 신뢰 경계

기본 신뢰는 등록 URI·키·원장 상태이며 DID는 선택이다. v3는120초 시작 승인·갱신 lease·별도 PBX 증거를 분리한다. Asterisk가 양측 웹 통화의 신뢰 종단이다. [현황](FINALS-IMPLEMENTATION-PLAN.md#service-20261027)의 미연결 UI·worker·철회/PBX 회수·복원 경계를 구현 완료로 보지 않는다.

## v2 신뢰 경계

소속 기관/수신자/할당 상담원/업무 목적을 바꾸는 IDOR, VC 복사, 폐기된 키/정책/epoch, 승인 재사용, 취소와 소비의 경합, 원장 RPC 하나의 거짓/지연, STT 수정과 늦은 LLM 응답을 방어 대상으로 둔다. 서버 객체 경계와 수신 SDK를 각각 검사한다. 테스트·코드는 [진행표](FINALS-IMPLEMENTATION-PLAN.md)에서 추적한다.

Platform 침해가 기관키·서비스키 파일 또는 issuer_v2 쓰기 권한으로 곧바로 이어져서는 안 된다. 다만 Platform이 전달하는 사용자 cookie/CSRF도 민감한 세션 자료다. 내부 service token은 사용자 인증을 대체하지 않는다. 내부망 감청/Issuer host 자체 침해는 현재 HTTPS/파일 권한/운영자 통제를 신뢰하며 HSM/mTLS를 구현했다고 주장하지 않는다.

전사문은 불신 데이터다. 외부 LLM에 도구를 주지 않고 JSON schema·정확한 근거 원문·현재 revision을 검사한다. 마이크 로컬 stream과 상대 stream을 구분하지만 악성 수신 클라이언트가 제출한 오디오의 진실성까지 서버가 증명하지는 않는다. 음성 원문을 기본 저장하지 않고 provider 자체 보관 조건은 별도 계정 설정/동의 검토가 필요하다.

PBX leg 매핑은 해당 Asterisk/채널·브리지의 연결 문맥만 뜻한다. 상담원 개인 신원을 증명하지 않는다. 미구현 PBX 경로는 정상 표시하지 않는다. 새 통화 코드의 실제 통합 결과나 규칙 정확도를 보장하지 않는다.

## v1 회귀 위협 모델

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
