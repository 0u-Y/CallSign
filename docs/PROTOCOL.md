# CallSign 통신·서명 규약

이 문서는 연락 승인과 현재 통화의 관계를 어떤 데이터와 서명으로 확인하는지 설명한다. **통신 형식 번호는 호환성을 검사하는 값**이며 서비스의 완성도·등급을 뜻하지 않는다. 소스·URL·서명에 들어가는 번호는 변경하지 않는다.

<a id="protocol-profiles"></a>

## 구현 경로와 통신 형식

| 문서에서 부르는 이름 | 실제 식별값·코드 | 차이와 현재 상태 |
|---|---|---|
| 초기 시연 경로 | `version=1`, [서명 형식 코드](../packages/protocol/src/index.ts) | 시청 사례·생성 음원·브라우저 직접 통화. 2026-09-14 증거와 회귀 시험을 보존한다. |
| 역할 분리 직접 통화 경로 | `version=2`, `/v2`, [직접 통화 형식](../packages/protocol/src/finals.ts) | 기관 승인자·발신 대행·플랫폼을 분리한 업무 화면. `/finals` 호환 화면에서만 사용한다. DID 조회와 짧은 승인 만료에 통화가 종속되는 제약이 남아 있다. |
| 통화 유지·PBX 경로 | `version=3`, `/v3`, [교환기·유지 형식](../packages/protocol/src/service.ts) | 등록 기관 주소·키, 최초 연결 시작과 통화 유지 허가 분리, Asterisk 교환기 증거. 기본 `/service` 화면·서버·SDK·PBX/worker·배포 코드에 연결했다. 선택한 실제 원장·DB·PBX 연결은 검증했고 외부 IdP/AI·AWS는 미검증이다. [실행 범위](guide/05-IMPLEMENTATION-STATUS.md)를 따른다. |

세 경로는 입력 형식을 엄격하게 구별하며 실패했다고 이전 형식으로 자동 전환하지 않는다. 모든 경로는 같은 기관·승인 ID의 이중 사용을 막는 공통 SQL 소비 namespace를 사용한다. 선택한 실제 PostgreSQL 경합·동일 binding 재시도는 검증했으며 [DB 증거](../artifacts/local-postgres-result-20261029.json)를 따른다.

`VC 2.0`의 숫자는 외부 자격 증명 표준의 버전이다. `SignedStateSnapshot`의 `version=1`은 상태 증언 형식이며 통화 형식 번호와 별개다. 기존 코드의 `p0-witness-v1`은 증언자 서명을 검사하는 방식을, `native-qbft`·P2는 아직 구현하지 않은 체인 자체 증명 확장을 가리킨다.

## 먼저 알아둘 용어

| 용어·코드 이름 | 이 서비스에서의 뜻 |
|---|---|
| 업무 / 통화 시도 / 세션 | `ContactIntent`는 연락해야 할 일, `CallAttempt`는 한 번의 발신, `sessionId`는 그 연결의 식별자다. 부재 후 재시도에는 새 시도와 세션을 만든다. |
| VC / 개별 승인 | VC(검증 가능한 자격 증명)는 기관→콜센터의 재사용 업무 위임 증서다. 개별 승인은 특정 고객·업무·시도에 한정된다. |
| Issuer / Sender / Platform | 기관 승인 서명 서비스 / 콜센터 키로 요청을 서명하는 서비스 / 인증된 요청을 전달하는 플랫폼이다. |
| JWS / Ed25519 / EIP-712 | JWS는 JSON 데이터 서명 표현, Ed25519는 오프체인 서명 알고리즘이다. EIP-712는 체인 관리 명령의 구조화 서명에 사용한다. |
| nonce / challenge / 키 소유 증명(PoP) | 새 일회성 난수 / 그 값에 대한 서명 요청 / 해당 공개키에 대응하는 개인키를 실제로 보유했다는 증거다. |
| binding / hash·digest | 승인·양측 키·수신자·협상·연결을 결합한 데이터 / 데이터가 바뀌었는지 대조하는 고정 길이 내용 해시다. 해시는 암호화가 아니다. |
| epoch / generation / revision | 기관 권한 세대 / 개별 연결 또는 분석 동의의 세대 / 상태나 전사 내용의 수정 번호다. 서로 바꿔 쓰지 않는다. |
| lease / freshness | 같은 통화를 갱신하며 유지하는 짧은 허가 / 권한 증거를 최신으로 인정하는 시간 범위다. 120초 최초 연결 기한과 별개다. |
| Witness / snapshot / trust bundle | 원장 상태를 서명하는 증언자 / 특정 블록의 상태 묶음 / 미리 신뢰하기로 한 기관·키·체인 설정이다. |
| checkpoint / high-watermark | 검증해 저장한 기준 상태 / 과거 상태로 되돌아가지 않도록 기록한 최고 관측 상태다. 저장만으로 백업이 최신임을 증명하지는 못한다. |
| outbox / worker / quota | DB에 남기는 후속 작업 보관함 / 그 작업을 재처리하는 백그라운드 처리기 / 요청·비용 사용 한도다. |
| SDP / DTLS / datachannel | 통화 방식·인증서 지문을 협상하는 문서 / 실제 연결 종단의 전송 보안 / 같은 브라우저 연결의 데이터 채널이다. |
| SIP / PBX / ARI / RTP | 통화 제어 규약 / 교환기 / Asterisk 제어·사건 인터페이스 / 음성 패킷 전송이다. SIP 제어 성공만으로 음성 전달을 확인한 것은 아니다. |
| fixture / fake / 회귀 시험 | 고정 시험 데이터 / 메모리 대체 객체 / 기존 동작이 깨지지 않는지 확인하는 시험이다. 실제 기관·DB·통화 성공의 증거가 아니다. |

## 통화 유지·PBX 경로 서비스 프로파일

확정 기본은 등록 기관 URI/콜센터 URI·등록 Ed25519 키이며 DID 조회는 필수가 아니다. `protocol/service.ts`는 업무 위임 `CallCenterDelegation` VC Data Model 2.0/JOSE(`typ=vc+jwt`, `cty=vc`), 요청별 `CallCenterProof`, `ContactStartAuthorization`, `ServiceSessionBinding`, 양측 `ServicePossession`, `ServiceConsumptionReceipt`, `CallLease`, PBX browser report/증거를 strict schema로 분리한다. 정책/VC digest는 전체 payload JCS SHA-256이며 기존 계약 내용 해시→delegation ID 규칙을 유지한다.

시작 창은 시도 생성 시 현재 시각+120초와 업무 만료의 이른 값으로 정한다. 승인 발급 시 `firstConsumeBy`는 그 시작 창과 요청별 콜센터 증거의 만료 이내로 고정한다. 승인 발급 시점에 120초가 새로 추가되는 것이 아니다. 소비 영수증은 그 안에 고정한 세션 결합의 사용 증거이며 동일 결합 재시도는 저장된 JWS를 반환한다.

`CallLease`는 같은 연결·세대의 통화 유지 허가다. 현재 임시값은 30초이며 순번·난수·수신자 키 소유 증명과 업무/위임/키/현재 권한을 검사한다. 기존 시작 승인 기한이 지났다는 이유만으로 적법한 진행 통화를 거절하지 않는다. 양측 `LeaseRenewalProof`는 이전 lease/최초 영수증 hash·같은 binding·새 nonce·순번·기한에 서명하며 서버가 두 키를 검사한다. 최대 통화 4시간도 임시 정책이며 운영 보장이 아니다.

초기 권한 확인 불가는 거절한다. 이미 `accepted`인 통화에서 원장 조회만 불가하면, 기존 허가가 유효한 동안에만 `authority=unavailable`인 다음 허가와 `choice=pause|continue`를 저장할 수 있다. 미확인 계속은 정상 인증 복구가 아니며, 기관 승인 서비스에 닿지 않아 갱신하지 못하거나 유지 허가가 만료되면 사용자 선택만으로 연장·부활할 수 없다. 명시 철회는 종료 처리 대상이다. 양측 화면·마이크 송신·PBX/분석 회수 코드에 연결했다. lease/회수·자연 세션 만료의 선택 경계와 모든 장애/장시간 조합을 구별한다. [실행 범위](guide/05-IMPLEMENTATION-STATUS.md)를 따른다.

PBX는 양측 웹↔Asterisk PJSIP/WSS+ARI↔웹이다. browser report는 각 세션키, AsteriskSessionEvidence는 별도 PBX 키가 서명한다. Call-ID·실제 ARI channel/bridge·SDP hash·브라우저 및 PBX fingerprint·수신 일회성 난수·승인·세션 결합·세션·generation·상태·시각을 결합한다. prepared 증거 없이 consume하지 않고 bridged 증거·실제 관측 없이는 정상 표시하지 않는다. 기존 외부 Edge helper는 새 경로의 서버가 아니다.

통화 유지·PBX 경로 verifier는 Witness 관측 age<8초/미래 오차≤1초로 검사한다. 각 시계 오차≤1초일 때 최대10초를 목표로 하는 정책이며 미측정이다. `service-current.ts` checkpoint는 기관 transaction의 DB aggregate에 보존하고 낮은 높이/같은 높이 다른 hash/state/clock rollback을 거절한다. 복원 gate·공통 소비 식별 범위 SQL·독립 HTTPS Anchor/CAS·영속 worker를 연결했다. 선택한 실제 PG 경합·CAS·앱 복원은 검증했고 외부 CAS/DB의 분산 원자성이나 전체 체인 복원을 뜻하지 않는다.

초기 시연·역할 분리 직접 통화·통화 유지/PBX의 세 형식은 별도 strict 진입점이며 자동 downgrade하지 않는다. 추가 서버 API는 `/v3`이며, 기본 화면은 `/service`, 배포 설정과 서버 호출은 `/v3`를 사용한다. `/finals`만 이전 직접 통화 호환 경로다. SDK 파일 존재·타입 통과만으로 전체 연결 완료라고 보지 않는다. [현행 구현·검증 범위](guide/05-IMPLEMENTATION-STATUS.md).

## 공동 설정·정책과 상태 증언

기본 배포의 `ServiceRegistry`는 기존 단독 directory 변경을 거절한다. `ConfigurationRequest`는 기관·현재 epoch·기존/새 directoryHash와 version·기존/새 policyHash와 version·nonce·deadline을 포함한다. chainId/계약은 EIP-712 domain, 작업은 `UPDATE_CONFIGURATION` type/action에 결합한다. 등록된 세 EVM 키 중 서로 다른 두 키가 필요하며 세 번째 잘못된/중복 서명도 거절한다. low-S와 v=27/28만 허용한다. 등록/복구/콜센터 키 변경 서명을 대신 쓸 수 없다.

관리 화면/API는 제안→서명 대기→제출→확정/실패를 구별한다. worker receipt만으로 활성화하지 않고 nonce와 정확한 변경 event·해당 블록 상태를 대조한다. 정책 hash 변경은 epoch를 올려 이전 VC/승인/lease를 무효화한다. 새 정책은 최신 Witness와 새 trust/웹 pin을 확인한 뒤 활성화하고 새 업무·위임을 발급한다. 현재 허용 공식 경로는 `/official` 하나이며 그 표시명만 바뀌는 변경은 epoch를 유지한다.

기본 SDK는 `registryProfile`·`policyHash`가 포함된 서명 snapshot을 요구한다. 네트워크/registry/genesis·동일 block/hash·정책 버전/내용·기관/위임을 같이 검사한다. 필드가 없는 옛 snapshot으로 자동 강등하지 않는다. 옛 strict fixture는 호환 경로에만 남긴다. Witness는 여전히 별도 서명 신뢰 계층이며 native chain proof가 아니다.

## 계정·소비 이력과 복원 기준

기관·승인 ID는 모든 형식에서 하나의 SQL 소비 namespace를 쓴다. 새 배포는 소비뿐 아니라 계정/키/정책 변경과 취소/회수 사건을 권한 metadata checkpoint에 묶어 별도 수명 HTTPS anchor의 CAS(이전 값이 같을 때만 갱신)와 대조한다. 관리 API는 계정 SQL 함수와 checkpoint를 동일 DB transaction에서 처리하고 요청 안팎에서 membership generation을 검사한다. 외부 CAS와 DB는 분산 원자 transaction이 아니며 CAS 뒤 DB 응답/이력을 잃으면 gate를 닫는다. CAS 응답 유실은 정확한 next 값 readback만 복구한다.

최초 빈 DB도 검토한 새 기준·독립 zero anchor에 초기 metadata checkpoint를 기록한 뒤 준비 상태가 된다. 구 저널을 자동 새 기준으로 간주하지 않는다. 전체 journal 검사는 읽기 전용 snapshot으로 하고 마지막 짧은 잠금에서 head/metadata/검증 token을 다시 확인한다. 복원 뒤 로그인 세션은 모두 폐기한다. 실제 PG 경합·CAS·복원의 선택 검증과 남은 경계는 [현황표](guide/05-IMPLEMENTATION-STATUS.md), 실행 순서는 [RUNBOOK](RUNBOOK.md)을 따른다.

## 역할 분리 직접 통화의 서명 형식

역할 분리 직접 통화 경로 schema는 `packages/protocol/src/finals.ts`, 순수 수신 SDK는 `packages/verifier/src/finals.ts`다. 이 절의 통화 객체는 `protocol=callsign`, `version=2`, `type`, `networkId/registryAddress`를 엄격히 검사한다. 원장 상태 증언은 별도의 `version=1` 형식이다. VC만 W3C VC 2.0/JOSE 표현을 사용한다. 초기 시연 경로와 같은 type 이름이어도 버전/필드가 다르면 거절하고 fallback하지 않는다. 초기 시연 경로는 별도 로컬 고정 시험 데이터 경로로 보존한다.

### 객체와 결합

- `ContactIntent`: 기관·수신자·할당 상담원·서비스·목적·policyHash·만료·상태. 모의 CRM/FDS가 생성한다. 수정 요청으로 recipient/purpose를 바꾸는 endpoint는 없다.
- `PurposePolicy`: 허용 질문, 금지 요구, 버전과 고정 공식 `/official` 경로. hash는 strict parse한 전체 JCS payload의 UTF-8 SHA-256 lowercase hex. 배열 순서를 바꾸면 hash도 바뀐다.
- `DelegationCredential`: `@context=[credentials/v2,{@vocab:urn:callsign:v2:}]`, VC type·issuer DID·service subject/controller/public key·목적/정책·유효기간·등록 상태/epoch/키 버전. JSON 자체를 compact JWS(alg=EdDSA, typ=vc+jwt, cty=vc, kid=기관 DID verification method)로 서명한다. JWT `vc` wrapping/SD-JWT/COSE/범용 status-list 호환을 주장하지 않는다.
- VC digest는 VC payload 전체 JCS hash다. 기존 계약에 `keccak256(UTF8(vcDigest))`를 delegation key로 한 번 등록한다. 권한 mask는 금융 프로파일 4다. VC id는 별도 urn:uuid이며 상태 ID는 그 id다. 특정 블록의 상태 묶음 조회 키와 브라우저 expected delegation ID는 내용 해시 문자열이다. 원장은 digest와 키/epoch/범위를 결합한다.
- `CallAttempt`: 한 업무의 개별 시도, 상담원·새 sessionId·상태·만료. created→authorized→consumed→ended, 취소 시 cancelled. 할당/소속 검사를 상태 변경 경계 안에서 반복한다.
- `SenderSessionPermit`: Sender 장기키가 상담원·업무·시도·browserPublicKey·service keyVersion·VC 내용 해시·policyHash·sessionId를 최대60초 서명한다. VC 복사본만으로 이 서명과 브라우저 세션키 소유 증명을 만들 수 없다.
- `ContactAuthorization`: issuer가 목적·수신자·업무·시도·VC/정책/permit/browserKey hash·키 버전·권한 세대·session을 서명한다. 발급과 consume에서 위임/기관/키/취소 상태를 다시 검사한다.
- `SessionBinding`: authorizationHash, 양쪽 SDP SHA-256과 fingerprint, recipientKeyHash/nonce, session, transport profile. 양쪽 세션키의 `PossessionProof`가 같은 bindingHash를 서명한다. 수신자의 인증 세션으로 키를 최초 enrollment하고 교체를 거절한다.
- `ConsumptionReceipt`: 최초 binding을 transaction 안에서 고정하고 서명 JWS까지 함께 저장한다. 같은 binding은 같은 JWS를 반환하고 다른 binding은409다. 취소와 소비는 같은 기관 행 잠금으로 순서를 정한다. commit 뒤 응답 유실은 재시도로 복구한다. 이하 직접 통화 객체의 설계와 현재 공통 DB의 선택 경합 검증 범위는 [현황표](guide/05-IMPLEMENTATION-STATUS.md)에서 구분한다.
- `AuthorizationStatus`: 수신자가 만든 새 nonce에 대해 issuer가 소비/취소/종료 상태와 binding을 최대5초 서명한다. SDK는 서버의 성공 문자열 대신 이 서명을 검사한다. 회전·철회·정지·취소 후 정상 표시가 유지되지 않아야 한다.
- `ChannelChallenge`: 같은 datachannel에서 새 receiverNonce/gatewayNonce와 bindingHash를 양쪽 세션키가 서명한다. SDK의 transport evidence는 실제 certificate/getStats 관측과 함께 대조한다. 미지원 환경은 검증 불가다.

### 신뢰와 상태

DID 문서는 controller와 assertion/authentication 관계를 확인하는 자료다. 등록 기관·서비스 키, 원장 approval/gateway key·권한 세대·purpose·기간 및 현재 VC 상태와 일치해야 한다. 원격 DID는 ASCII host/path(포트/percent-encoding 미지원) 부분집합으로 고정 HTTPS URL/2초/32KiB/redirect 금지, 로컬 fixture는 사전 등록 문서를 사용한다.

witness는 자기 chain ID/genesis와 지정 블록 hash를 검사하고 상태를 서명한다. 집계기의 RPC 판단을 수신자가 신뢰하지 않는다. 서로 다른 등록 키3개가 정확히 같은 chain/height/hash/state에 서명해야 한다. blockTimestamp로 freshness를 검사하고 같은 블록의 최초 monotonic deadline을 늘리지 않는다. 더 낮은 높이, 같은 높이의 다른 hash/상태, 알고 있는 철회 이전 상태는 거절한다. 유효한 오래된 quorum은 `STALE_WITNESS_QUORUM_CHAIN_PROGRESS_UNAVAILABLE`로, 정족수 부족은 `WITNESS_THRESHOLD_UNAVAILABLE`로 구분한다. 이는 체인의 진행을 확증할 수 없다는 뜻이며 실제 QBFT 정지 원인 진단은 아니다. 서명을 새로 만들었다는 이유만으로 오래된 블록을 최신으로 취급하지 않는다. 수신/issuer 프로세스 재시작을 넘는 영속 high-watermark는 아직 없으며 신뢰된 시계/freshness에 의존한다.

프로토콜 시간은 초 단위다. 승인·허가·승인·세션 결합 만료 후에는 새 시도를 요구한다. 현재 역할 분리 직접 통화 경로 UI는 짧은 승인 수명에 따라 통화 중 검증/연결을 종료하는 보수적 구현이며 장시간 세션 연장 프로토콜은 없다.

### 해시 시험값과 표준

`tests/fixtures/finals-policy-vector.json`, `finals-vc-vector.json`은 Python 표준 JSON 정렬/UTF-8 SHA-256로 독립 계산한 고정 벡터다. 정수·문자열만 있는 해당 입력 범위에서 JCS와 대응한다. 범용 JCS 적합성 시험은 아니다. VC JOSE 서명·version 혼동·정책 수정·철회·양측 키 소유 증명·수신 package 검사는 `tests/unit/finals.test.ts`에 있다. [표준 원문과 적용 범위](STANDARDS.md).

## 초기 시연을 보존하는 서명 형식

아래는 기존 회귀용 프로토콜이다. 역할 분리 직접 통화 경로와 자동 혼용하지 않는다.


구현 기준은 `packages/protocol`과 `packages/verifier`다. JSON은 RFC 8785 JCS로 canonicalize하고 Ed25519 compact JWS(`alg=EdDSA`)로 서명한다. protected `typ=callsign/<type>+jws`, `kid`, payload의 `protocol=callsign`, `version=1`, `type`, `networkId`, `registryAddress`를 모두 검사한다. `none`, 알 수 없는 필드, 중복 JSON key, 32KiB 초과, 비 UTF-8 입력을 거절한다.

### 초기 시연의 객체

- `ContactAuthorization`: 기관 승인키가 authorization/institution/epoch/delegation/recipient/purpose/opaque task/time을 서명. 기본 10분.
- `EnrollmentProof`: enrollment 서비스가 recipient와 세션 공개키를 5분 동안 연결.
- `RecipientChallenge`: recipient 세션키가 enrollment proof, session, 새 nonce를 서명. 60초.
- `SessionBinding`: authorization hash, 양측 identity/nonce/key hash, gateway·receiver fingerprint, 정규화한 offer/answer 원문 바이트의 SHA-256, `webrtc-bundle-v1`. 60초.
- `ConsumptionReceipt`: issuer가 PostgreSQL transaction과 authorizationId unique constraint로 최초 승인·세션 결합 hash를 고정한 후 서명. 같은 승인·세션 결합 재시도는 같은 record, 다른 binding은 409.
- `SessionProof`: gateway 로컬키가 전체 binding과 receipt hash, gateway 역할을 서명.
- `TransportTranscript`: 같은 datachannel에서 양측 새 일회성 난수·승인·세션 결합 hash·역할을 각 세션키로 서명.
- `SignedStateSnapshot`: 각 witness가 자기 노드의 제안된 block number/hash를 직접 확인하고, 그 블록에 고정한 institution/delegation 조회 결과를 동일 JCS payload로 서명.

### 초기 시연의 상태 증언과 시간

브라우저는 고정된 4개 witness public key 중 서로 다른 3개 이상이 **완전히 같은 payload**를 서명했는지 확인한다. block height가 같아도 hash/payload가 다르면 합치지 않는다. 요청 institution/delegation ID, genesis, registry, policy version도 고정 trust bundle과 대조한다.

초기 수락은 `localNow - blockTimestamp <= W + ε = 12초`, `blockTimestamp <= localNow + ε = 2초`다. 상대 시계 오차가 각각 ε 이하면 실제 특정 블록의 상태 묶음 age 상한은 보수적으로 `W + 2ε = 14초`일 수 있다. 최초 남은 시간을 monotonic deadline으로 고정하며 같은 block을 다시 받아 deadline을 늘리지 않는다. 더 낮은 높이와 알려진 revoke 이전 정상 상태로 rollback하지 않는다. 활성 화면 polling은 3초, 별도 deadline timer로 만료 뒤 최대 1초 이내 표시 철회를 목표로 한다. 백그라운드 복귀 시 정상 표시를 먼저 숨긴다.

### 초기 시연의 협상·실제 전송 검증

SDP는 수신 문자열의 LF를 CRLF로 바꾼 UTF-8 bytes를 hash한다. `a=fingerprint:sha-256`은 대문자 콜론 형식으로 정규화하며 0개 또는 상충하는 복수 값은 거절한다. 전체 SDP는 감사 로그에 남기지 않는다. Chromium 프로파일은 `getStats()`의 connected DTLS transport와 `RTCDtlsTransport.getRemoteCertificates()`에서 얻은 실제 원격 인증서 SHA-256을 signed fingerprint와 비교한다.

아래 오디오 관측은 2026-09-14 초기 시연 기록이며 현재 실통화 검증 결과가 아니다. 초기 offer에는 audio transceiver와 datachannel을 같은 BUNDLE PeerConnection에 둔다. 수락 전 sender track은 `null`이며 E2E에서 inbound audio bytes 0을 확인했다. 수락 후 `replaceTrack()`으로 생성 음원을 연결해 재협상 없이 RTP 증가를 측정한다.

### 계약 저장 구조와 값 인코딩

사람이 읽는 ID는 `keccak256(UTF-8 string)`으로 bytes32 key를 만든다. Foundry 산출물 `contracts/out/InstitutionRegistry.sol/InstitutionRegistry.json`의 `storageLayout`이 기준이다.

- inherited EIP-712 name/version: slots 0–1
- `institutions`: mapping base slot 2. struct는 5 slots이며 status/epoch/administrator가 첫 slot에 packed된다.
- `delegations`: mapping base slot 3. struct는 5 slots이며 validFrom/validUntil/revoked/exists가 마지막 slot에 packed된다.
- `delegationIdUsed`, `nonceUsed`, `registrationApprovers`: slots 4, 5, 6
- `approvers[3]`: slot 7부터 3 slots

후속 EIP-1186 계정·저장 상태 증명는 이 layout과 `keccak256(abi.encode(key, mappingSlot))`을 사용해야 하나 아직 구현하지 않았다.


## 기본 경로의 PBX·복구 추가 계약

`AsteriskSessionEvidence.pbxFingerprintSource`는 `configured-certificate`다. 서버는 설정한 Asterisk 인증서 지문을 고정하고 ARI의 실제 채널·Call-ID·bridge를 조회한다. 브라우저는 자신의 실제 DTLS 인증서/SDP·SIP Call-ID와 서명 증거를 대조한다. 이는 서버가 DTLS handshake를 직접 수집했다는 의미가 아니다. 준비 상태 검증 후 양측 `media-ready:<bindingHash>` 서명을 저장하고, 현재 권한과 양측 준비가 있을 때만 최초 bridge를 허용한다. 이후에도 SDK가 연결 상태 증거를 검사한 뒤 마이크를 허용한다.

이 strict 필드와 양측 갱신 proof는 현재 미배포 기본 경로의 계약을 완성한 것이며 이전 교환기 초안 증거를 자동 수락하지 않는다. 초기 시연/직접 통화 fixture는 변경하지 않는다. 실제 배포 전 새 trust pin·서버·브라우저·migration을 같은 릴리스로 맞춘다.

소비 journal의 연속 hash는 `{institutionId,authorizationId,bindingHash,previousHash}`의 JCS SHA-256이다. 외부 anchor는 deployment/institution/sequence/hash/epoch를 비교 후 전진하며 DB/VM 백업 밖에 둔다. CAS가 전진하고 DB commit이 불명확하면 자동 성공/자동 rollback하지 않고 gate를 닫는다. 같은 오래된 백업 내부 비교는 해제 근거가 아니다. 키 세대 전진도 journal에 남긴다.

관리 EIP-712의 등록/복구와 오프체인 JWS 승인은 별개다. 콜센터 키 목록 활성화는 `ActivateServiceKeys`의 chain/registry/institution·이전/새 epoch·새 issuer JWK digest·정렬한 키 목록 digest·nonce/deadline에 별도 2-of-3 서명을 요구한다. 복구 서명을 이 키 목록 승인으로 확대하지 않는다.

복원 gate는 SQL 소비 식별 범위의 대응 관계와 journal 전체 순번·hash chain·세대 marker, 독립 anchor를 기관 행 잠금 안에서 대조한다. 마지막 root만 같은 것을 정상 복원으로 보지 않는다. 보관 기간이 지난 기본 경로의 영수증 payload는 내용 hash로 최소화하지만 기관/승인 ID·binding hash·journal은 유지하므로 같은 승인 ID를 다시 사용할 수 없다. 선택한 실제 PostgreSQL/application 복원과 전체 체인/독립 호스트 복원은 [현황표](guide/05-IMPLEMENTATION-STATUS.md)에서 구분한다.

<a id="cti-boundary"></a>

## CTI 연동 경계: 현재 제품 API의 책임

현재는 Sender Agent·Asterisk·로그인한 상담원 웹을 연결한다. 임의 상용 CTI, PSTN/우회 발신, 새 machine principal은 구현하지 않았다. 연동 adapter가 발신 이벤트를 받는다고 기관/상담원 권한을 얻지 않는다. 내부 PLATFORM/SENDER token을 외부 CTI에 제공하지 않는다.

| 외부 사건/식별값 | 현재 내부 계약·책임 | 실패/재시도 |
|---|---|---|
| 기관·콜센터·상담원·외부 업무 ID | 기관이 등록한 service URI와 OIDC issuer/subject·내부 membership/할당에 명시적으로 매핑. 이메일/표시명이나 body의 기관 ID로 소속 결정 금지 | 미등록/타 기관/소속 변경은 서버 거절. 외부 ID 중복 namespace는 adapter 운영자가 자기 기관 내 안정된 내부 업무 ID로 매핑 |
| 발신 준비 | 로그인/CSRF→할당 업무→원장 확정 VC→`/v3/attempts`→challenge→Sender proof→개별 authorization | 동일 논리 요청은 같은 idempotency-key와 같은 payload. 같은 key에 다른 payload는409. 승인 전 실제 발신 우회 금지 |
| 수신·협상 | 수신자 로그인·명시 선택/수락, 양측 공개키·nonce·SIP/SDP 관측·소유 증명→binding→consume→lease→ready/PBX evidence | 수신자 화면 없이 key/수락을 서버가 대신 만들어 주지 않음. endpoint/Call-ID/채널/bridge는 실제 같은 세션에 결합 |
| 응답 유실·중복 사건 | 저장된 동일 결과 재조회 후 `/v3/call-context`·workspace로 현재 상태 확인 | 과거 성공 응답은 현재 권한이 아님. 취소/만료/다른 binding이면 발신 중단. 새 key로 시작 창을 갱신하지 않음 |
| 취소·철회·늦은 PBX 사건 | `/v3/cancel`/revoke/outcome·권한 감시·영속 cleanup, terminal 상태를 재활성화하지 않음 | 생성 endpoint/채널·브리지를 정리하고 결과 불명은 retry/미확인으로 유지. 단순 API200을 실제 연결/음성 중단으로 보고하지 않음 |
| 운영 상태 | `/v3/management/recalls`는 기관 contact.manage, call-context는 할당된 당사자만 | 기관별 제한 목록·오류 코드.401 재로그인,403 소속/권한,409 stale/terminal/idempotency/binding 충돌,503 의존성/복구 gate/cleanup 불가. 숨긴 버튼은 서버 권한 검사의 대체가 아님 |

외부 CTI 검증은 실제 adapter 인증·식별 매핑·오류/응답 유실·중복/취소 경합·미디어 관측을 갖춘 환경에서 별도 수행해야 한다. 이번 재시도 회귀는 현재 API 경로의 단위/작성된 HTTP 시험이며 상용 CTI 연동 완료가 아니다.

## 현재 서비스 분석 이벤트

`packages/protocol/src/analysis.ts`는 연락 승인 JWS·VC·EIP-712와 별개의 보조 분석 결과 계약이다. 위험 signals와 purpose relation(suspected/not-detected/undetermined), 실행 status, policyHash/version, contextId/contextRevision·dependencies와 eventSequence를 분리한다. 같은 문맥의 늦은/역순 사건도 sequence로 걸러낸다. 확률이나 통화 전체 안전 값은 없으며 공식 경로는 제품의 `/official`로 고정한다. 문맥 제한·평가와 실제 실행 조건은 [운영 절차](RUNBOOK.md#mentoring-fourth-validation)를 따른다.
