# Protocol v1

구현 기준은 `packages/protocol`과 `packages/verifier`다. JSON은 RFC 8785 JCS로 canonicalize하고 Ed25519 compact JWS(`alg=EdDSA`)로 서명한다. protected `typ=callsign/<type>+jws`, `kid`, payload의 `protocol=callsign`, `version=1`, `type`, `networkId`, `registryAddress`를 모두 검사한다. `none`, 알 수 없는 필드, 중복 JSON key, 32KiB 초과, 비 UTF-8 입력을 거절한다.

## 객체

- `ContactAuthorization`: 기관 승인키가 authorization/institution/epoch/delegation/recipient/purpose/opaque task/time을 서명. 기본 10분.
- `EnrollmentProof`: enrollment 서비스가 recipient와 세션 공개키를 5분 동안 연결.
- `RecipientChallenge`: recipient 세션키가 enrollment proof, session, 새 nonce를 서명. 60초.
- `SessionBinding`: authorization hash, 양측 identity/nonce/key hash, gateway·receiver fingerprint, 정규화한 offer/answer 원문 바이트의 SHA-256, `webrtc-bundle-v1`. 60초.
- `ConsumptionReceipt`: issuer가 PostgreSQL transaction과 authorizationId unique constraint로 최초 binding hash를 고정한 후 서명. 같은 binding 재시도는 같은 record, 다른 binding은 409.
- `SessionProof`: gateway 로컬키가 전체 binding과 receipt hash, gateway 역할을 서명.
- `TransportTranscript`: 같은 datachannel에서 양측 새 nonce·binding hash·역할을 각 세션키로 서명.
- `SignedStateSnapshot`: 각 witness가 자기 노드의 제안된 block number/hash를 직접 확인하고, 그 블록에 고정한 institution/delegation 조회 결과를 동일 JCS payload로 서명.

## 상태 증언과 시간

브라우저는 고정된 4개 witness public key 중 서로 다른 3개 이상이 **완전히 같은 payload**를 서명했는지 확인한다. block height가 같아도 hash/payload가 다르면 합치지 않는다. 요청 institution/delegation ID, genesis, registry, policy version도 고정 trust bundle과 대조한다.

초기 수락은 `localNow - blockTimestamp <= W + ε = 12초`, `blockTimestamp <= localNow + ε = 2초`다. 상대 시계 오차가 각각 ε 이하면 실제 snapshot age 상한은 보수적으로 `W + 2ε = 14초`일 수 있다. 최초 남은 시간을 monotonic deadline으로 고정하며 같은 block을 다시 받아 deadline을 늘리지 않는다. 더 낮은 높이와 알려진 revoke 이전 정상 상태로 rollback하지 않는다. 활성 화면 polling은 3초, 별도 deadline timer로 만료 뒤 최대 1초 이내 표시 철회를 목표로 한다. 백그라운드 복귀 시 정상 표시를 먼저 숨긴다.

## SDP와 transport

SDP는 수신 문자열의 LF를 CRLF로 바꾼 UTF-8 bytes를 hash한다. `a=fingerprint:sha-256`은 대문자 콜론 형식으로 정규화하며 0개 또는 상충하는 복수 값은 거절한다. 전체 SDP는 감사 로그에 남기지 않는다. Chromium 프로파일은 `getStats()`의 connected DTLS transport와 `RTCDtlsTransport.getRemoteCertificates()`에서 얻은 실제 원격 인증서 SHA-256을 signed fingerprint와 비교한다.

초기 offer에는 audio transceiver와 datachannel을 같은 BUNDLE PeerConnection에 둔다. 수락 전 sender track은 `null`이며 E2E에서 inbound audio bytes 0을 확인했다. 수락 후 `replaceTrack()`으로 생성 음원을 연결해 재협상 없이 RTP 증가를 측정한다.

## 온체인 직렬화와 storage

사람이 읽는 ID는 `keccak256(UTF-8 string)`으로 bytes32 key를 만든다. Foundry 산출물 `contracts/out/InstitutionRegistry.sol/InstitutionRegistry.json`의 `storageLayout`이 기준이다.

- inherited EIP-712 name/version: slots 0–1
- `institutions`: mapping base slot 2. struct는 5 slots이며 status/epoch/administrator가 첫 slot에 packed된다.
- `delegations`: mapping base slot 3. struct는 5 slots이며 validFrom/validUntil/revoked/exists가 마지막 slot에 packed된다.
- `delegationIdUsed`, `nonceUsed`, `registrationApprovers`: slots 4, 5, 6
- `approvers[3]`: slot 7부터 3 slots

P2 EIP-1186 proof는 이 layout과 `keccak256(abi.encode(key, mappingSlot))`을 사용해야 하나 아직 구현하지 않았다.
