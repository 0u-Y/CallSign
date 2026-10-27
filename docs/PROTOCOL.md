# CallSign protocol

## v3 서비스 프로파일 — 코드 이행 중

확정 기본은 등록 기관 URI/콜센터 URI·등록 Ed25519 키이며 DID 조회는 필수가 아니다. `protocol/service.ts`는 업무 위임 `CallCenterDelegation` VC2/JOSE(typ=vc+jwt/cty=vc), 요청별 `CallCenterProof`, `ContactStartAuthorization`, `ServiceSessionBinding`, 양측 `ServicePossession`, `ServiceConsumptionReceipt`, `CallLease`, PBX browser report/증거를 strict schema로 분리한다. 정책/VC digest는 전체 payload JCS SHA-256이며 기존 계약 digest→delegation ID 규칙을 유지한다.

시작 승인은 firstConsumeBy≤발급 후120초다. receipt는 그 안에 고정한 binding의 소비 증거이며 동일 binding 재시도는 저장된 JWS를 돌려준다. 이미 연결된 통화에서는 원 permit/auth/binding의 시작 창 대신30초 lease의 현재 nonce/순번·binding·generation·세대·키·업무·VC를 검사한다. 초기 authority unavailable은 거절하고, 기존 accepted의 unavailable만 명시적 계속/정지 선택으로 분리한다. 현재 코드의4시간 최대 통화 cap은 임시 정책이며 확정 SLA가 아니다. 양측 갱신/수락 UI·PBX 지속 회수는 미구현이다.

PBX는 양측 웹↔Asterisk PJSIP/WSS+ARI↔웹이다. browser report는 각 세션키, AsteriskSessionEvidence는 별도 PBX 키가 서명한다. Call-ID·실제 ARI channel/bridge·SDP hash·브라우저 및 PBX fingerprint·수신 nonce·binding·세션·generation·상태·시각을 결합한다. prepared 증거 없이 consume하지 않고 bridged 증거·실제 관측 없이는 정상 표시하지 않는다. 기존 외부 Edge helper는 새 경로의 서버가 아니다.

v3 verifier는 Witness 관측 age<8초/미래 오차≤1초로 검사한다. 각 시계 오차≤1초일 때 최대10초를 목표로 하는 정책이며 미측정이다. `service-current.ts` checkpoint는 기관 transaction의 DB aggregate에 보존하고 낮은 높이/같은 높이 다른 hash/state/clock rollback을 거절한다. 복원 gate·공통 소비 namespace SQL은 작성만 했으며 독립 anchor/worker·실제 PG 원자성은 미완성/미검증이다.

v1/v2/v3는 별도 strict 진입점이며 자동 downgrade하지 않는다. 새 API는 `/v3`, UI/배포는 아직 v2다. SDK 파일 존재·타입 통과만으로 전체 연결 완료라고 보지 않는다. [현행 구현·검증 기록](FINALS-IMPLEMENTATION-PLAN.md#service-20261027).

## v2 프로파일

v2 schema는 `packages/protocol/src/finals.ts`, 순수 수신 SDK는 `packages/verifier/src/finals.ts`다. 모든 CallSign 객체는 protocol=callsign/version=2/type와 networkId/registryAddress를 strict 검사한다. VC만 W3C VC 2.0/JOSE 표현을 사용한다. v1과 같은 type 이름이어도 버전/필드가 다르면 거절하고 fallback하지 않는다. v1은 별도 로컬 fixture 경로로 보존한다.

### 객체와 결합

- `ContactIntent`: 기관·수신자·할당 상담원·서비스·목적·policyHash·만료·상태. 모의 CRM/FDS가 생성한다. 수정 요청으로 recipient/purpose를 바꾸는 endpoint는 없다.
- `PurposePolicy`: 허용 질문, 금지 요구, 버전과 고정 공식 `/official` 경로. hash는 strict parse한 전체 JCS payload의 UTF-8 SHA-256 lowercase hex. 배열 순서를 바꾸면 hash도 바뀐다.
- `DelegationCredential`: `@context=[credentials/v2,{@vocab:urn:callsign:v2:}]`, VC type·issuer DID·service subject/controller/public key·목적/정책·유효기간·등록 상태/epoch/키 버전. JSON 자체를 compact JWS(alg=EdDSA, typ=vc+jwt, cty=vc, kid=기관 DID verification method)로 서명한다. JWT `vc` wrapping/SD-JWT/COSE/범용 status-list 호환을 주장하지 않는다.
- VC digest는 VC payload 전체 JCS hash다. 기존 계약에 `keccak256(UTF8(vcDigest))`를 delegation key로 한 번 등록한다. 권한 mask는 금융 프로파일 4다. VC id는 별도 urn:uuid이며 상태 ID는 그 id다. snapshot 조회 키와 브라우저 expected delegation ID는 digest 문자열이다. 원장은 digest와 키/epoch/범위를 결합한다.
- `CallAttempt`: 한 업무의 개별 시도, 상담원·새 sessionId·상태·만료. created→authorized→consumed→ended, 취소 시 cancelled. 할당/소속 검사를 상태 변경 경계 안에서 반복한다.
- `SenderSessionPermit`: Sender 장기키가 상담원·업무·시도·browserPublicKey·service keyVersion·VC digest·policyHash·sessionId를 최대60초 서명한다. VC 복사본만으로 이 서명과 브라우저 세션키 소유 증명을 만들 수 없다.
- `ContactAuthorization`: issuer가 목적·수신자·업무·시도·VC/정책/permit/browserKey hash·키 버전·epoch·session을 서명한다. 발급과 consume에서 위임/기관/키/취소 상태를 다시 검사한다.
- `SessionBinding`: authorizationHash, 양쪽 SDP SHA-256과 fingerprint, recipientKeyHash/nonce, session, transport profile. 양쪽 세션키의 `PossessionProof`가 같은 bindingHash를 서명한다. 수신자의 인증 세션으로 키를 최초 enrollment하고 교체를 거절한다.
- `ConsumptionReceipt`: 최초 binding을 transaction 안에서 고정하고 서명 JWS까지 함께 저장한다. 같은 binding은 같은 JWS를 반환하고 다른 binding은409다. 취소와 소비는 같은 기관 행 잠금으로 순서를 정한다. commit 뒤 응답 유실은 재시도로 복구한다. 이 DB 보장은 아직 실제 PostgreSQL에서 검증하지 않았다.
- `AuthorizationStatus`: 수신자가 만든 새 nonce에 대해 issuer가 소비/취소/종료 상태와 binding을 최대5초 서명한다. SDK는 서버의 성공 문자열 대신 이 서명을 검사한다. 회전·철회·정지·취소 후 정상 표시가 유지되지 않아야 한다.
- `ChannelChallenge`: 같은 datachannel에서 새 receiverNonce/gatewayNonce와 bindingHash를 양쪽 세션키가 서명한다. SDK의 transport evidence는 실제 certificate/getStats 관측과 함께 대조한다. 미지원 환경은 검증 불가다.

### 신뢰와 상태

DID 문서는 controller와 assertion/authentication 관계를 확인하는 자료다. 등록 기관·서비스 키, 원장 approval/gateway key·epoch·purpose·기간 및 현재 VC 상태와 일치해야 한다. 원격 DID는 ASCII host/path(포트/percent-encoding 미지원) 부분집합으로 고정 HTTPS URL/2초/32KiB/redirect 금지, 로컬 fixture는 사전 등록 문서를 사용한다.

witness는 자기 chain ID/genesis와 지정 블록 hash를 검사하고 상태를 서명한다. 집계기의 RPC 판단을 수신자가 신뢰하지 않는다. 서로 다른 등록 키3개가 정확히 같은 chain/height/hash/state에 서명해야 한다. blockTimestamp로 freshness를 검사하고 같은 블록의 최초 monotonic deadline을 늘리지 않는다. 더 낮은 높이, 같은 높이의 다른 hash/상태, 알고 있는 철회 이전 상태는 거절한다. 유효한 오래된 quorum은 `STALE_WITNESS_QUORUM_CHAIN_PROGRESS_UNAVAILABLE`로, quorum 부족은 `WITNESS_THRESHOLD_UNAVAILABLE`로 구분한다. 이는 체인의 진행을 확증할 수 없다는 뜻이며 실제 QBFT 정지 원인 진단은 아니다. 서명을 새로 만들었다는 이유만으로 오래된 블록을 최신으로 취급하지 않는다. 수신/issuer 프로세스 재시작을 넘는 영속 high-watermark는 아직 없으며 신뢰된 시계/freshness에 의존한다.

프로토콜 시간은 초 단위다. 승인·허가·binding 만료 후에는 새 시도를 요구한다. 현재 v2 UI는 짧은 승인 수명에 따라 통화 중 검증/연결을 종료하는 보수적 구현이며 장시간 세션 연장 프로토콜은 없다.

### 해시 벡터와 표준

`tests/fixtures/finals-policy-vector.json`, `finals-vc-vector.json`은 Python 표준 JSON 정렬/UTF-8 SHA-256로 독립 계산한 고정 벡터다. 정수·문자열만 있는 해당 입력 범위에서 JCS와 대응한다. 범용 JCS 적합성 시험은 아니다. VC JOSE 서명·version 혼동·정책 수정·철회·양측 PoP·수신 package 검사는 `tests/unit/finals.test.ts`에 있다. [표준 원문과 적용 범위](STANDARDS.md).

## v1 회귀 프로파일

아래는 기존 회귀용 프로토콜이다. v2와 자동 혼용하지 않는다.


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
