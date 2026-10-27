# CallSign 본선 개발 통합 결과 보고서

- 작성 기준: 2026-10-26 개발 작업 및 저장소에 남은 검증 기록.
- 저장소: https://github.com/0u-Y/CallSign
- 작업 디렉터리: `/home/ana/Desktop/yyw/CallSign`
- 개발 시작 기준 커밋: `7aa26d90b9156c245e160283b1477360a6697cec`.
- Git 상태: 개발 시작 시 작업 트리는 깨끗했다. 현재 개발 변경은 미커밋 상태이며 commit·push·배포는 하지 않았다.
- 개발 환경: 사용자가 지정한 RAM 64GB 서버컴. 검증 기록의 실행 환경은 Linux x64, Node.js `v22.22.2`, pnpm `11.27.0`이다. 이후 GCP VM 이전을 준비한다.

이 문서는 지금까지 수행한 개발을 한 번에 검토하기 위한 결과 보고서다. 구현 내용, 실제 검사, 미실행 항목, 남은 결함, 운영 준비와 다음 절차를 함께 담았다. 이번 보고서 작성 요청에서는 기능 코드를 변경하거나 테스트를 다시 실행하지 않았으며, 앞선 개발에서 저장한 검사 결과를 대조했다.

## 1. 현재 결과

**기존 스택을 유지하면서 본선 v2의 직접 WebRTC 경로를 구성하는 코드·설정·테스트·문서를 추가했다. 가벼운 검사는 통과했지만, 전체 서비스를 기동한 통합 검증과 본선 배포는 아직 수행하지 않았다.**

대표 시나리오는 **모의 금융기관의 이상거래 확인 연락**이다. 다음 세 판단을 분리한다.

1. 기관이 실제 업무 객체를 근거로 이 개별 연락을 승인했는가.
2. 위탁 발신자가 해당 업무를 수행할 권한을 갖고 있으며, 그 권한이 현재 통화 세션에 결합됐는가.
3. 상대 음성에서 업무 목적을 벗어난 요구가 발견되는가.

실제 금융기관·통신사와 연결된 서비스라는 주장은 하지 않는다. 기존 시청 사례, v1 fixture, 생성 음원 데모, 기획 PPTX/PDF와 과거 시험 증거는 보존했다.

| 구분 | 현재 결과 |
|---|---|
| 직접 통화 경로 | 업무·위임·승인·소비·수신 검증·마이크·분석 경로의 코드 작성 |
| 단위 검사 | 기존 회귀 포함 10개 파일, **44개 통과·0개 실패** |
| 정적 검사 | 소스 위생, 타입, 웹 번들, Compose 설정, 셸 문법 검사 통과 |
| PBX 경로 | 제어 adapter·매핑 검사 helper 작성. 실제 bridge와 PBX 수신 경로는 미완료 |
| 추가 미구현 | 공유·영속 quota, 영속 rollback 기준, 장시간 승인 연장·자동 복구, 대규모 저장 운영 정책 |
| 실환경 | DB·체인·서비스 연결·실통화·제공자·GCP 검증 대기 |

이하의 **구현 완료**는 해당 개발 코드가 작성됐다는 뜻이다. 운영 완료나 실환경 통과를 뜻하지 않으며, adapter helper만 있는 PBX 전체 경로는 구현 완료로 분류하지 않았다.

## 2. 실행 제한과 보존 사항

다음 작업은 실행하지 않았다.

- Besu·Anvil·Hardhat 등 블록체인 노드 또는 별도 체인 서버 기동.
- PostgreSQL·witness·Asterisk·TURN·Media Edge·API/웹 전체 서비스 스택 기동.
- Docker Compose 서비스 기동·정지, 이미지 pull·build.
- 체인 초기화·계약 배포·seed, DB migration 실제 적용.
- 외부 서비스 통합 시험, 실제 마이크 통화, 장애 주입, 부하·성능·장시간 시험.
- STT·LLM 실제 API 호출, Ollama 추론, 모델·브라우저 바이너리 다운로드.
- Terraform init·validate·plan·apply, GCP 자원 생성·배포·변경.
- 기존 프로세스·컨테이너 중단, 기존 DB·체인 볼륨·키·시험 증거 삭제 또는 초기화.
- 원격 서버나 CI를 통한 우회 실행.

허용된 Node.js 타입 검사·단위 테스트·웹 컴파일·정적 파서는 사용했다. `docker compose config`는 설정 파서만 사용한 것이며 컨테이너나 이미지를 실행한 것이 아니다.

제한은 `AGENTS.md`에 기록했다. 기본 테스트와 일반 push/PR CI는 light 경로로 분리했고, 무거운 경로는 명시적 실행 범주가 없으면 차단한다. 이번 개발에서는 차단을 해제하지 않았다.

Ponytail full을 적용해 기존 TypeScript/pnpm, React/Vite, Fastify, PostgreSQL/Drizzle, jose/JCS/zod/viem, Solidity/Besu 구성을 유지했다. 새 외부 프레임워크나 모델 의존성을 추가하지 않았으며 API에서 기존 verifier workspace를 참조하도록 연결했다.

## 3. 구성과 신뢰 경계

```text
역할별 브라우저 UI
    │ HTTPS/WSS + 로그인 세션·CSRF
    ▼
Platform API ────────────── Sender Agent
    │                      │ 서비스 장기키
    │                      │ 상담원·업무·시도·브라우저 공개키의 짧은 허가
    ▼                      ▼
Issuer Gateway ◀───────────┘
    ├─ 기관 승인키: 버전별 파일
    ├─ 업무·위임·승인·소비: issuer_v2 DB 권한
    ├─ 로그인 세션: 별도 auth DB 권한
    └─ witness 3-of-4 ── 같은 Besu QBFT 체인의 노드 4개

상담원 브라우저 ◀── 직접 WebRTC ──▶ 수신자 브라우저
                                      │ 수락·분석 동의
                                      ▼
상대 음성 → STT → segment/revision → 목적 정책·규칙·선택 LLM → 위험 근거
```

Platform, Issuer, Sender는 같은 소스의 실행 역할을 나누어 별도 프로세스/컨테이너로 구성했다. Platform 역할은 DB client나 기관·서비스 개인키를 열지 않는다. Sender는 서비스 장기키를 보유하고, 브라우저에는 짧은 세션키의 공개키에 대한 허가만 전달한다.

기관별 업무·위임·승인·소비는 PostgreSQL의 기관 JSONB 행에 묶었다. 해당 행의 `FOR UPDATE`를 취소·소비·키 회전의 공통 권위 경계로 사용하고, 감사 이벤트는 별도 테이블에 추가한다. 실제 잠금·권한 격리 보장은 PostgreSQL 시험 전까지 미검증이다.

수신 앱은 서버의 성공 문자열만으로 정상 표시하지 않는다. 고정한 trust bundle과 서명된 VC·허가·승인·영수증·현재 상태, SDP, DTLS/datachannel 문맥을 대조한다. 웹 코드와 trust bundle을 함께 교체할 수 있는 운영자는 여전히 신뢰 경계에 포함된다.

## 4. 구현 범위별 결과

### A. 업무·정책·권한

**구현 상태: 구현 완료. 검증 상태: 정적 검사 통과·단위 테스트 통과·실환경 검증 대기.**

`ContactIntent`, `PurposePolicy`, `DelegationCredential`, `CallAttempt`, `ContactAuthorization`과 소비·취소·감사 이벤트를 구분했다. 기관 소속, 역할, 수신자, 상담원 할당과 발신 서비스를 연결했다.

모의 CRM/FDS 입력으로 연락 업무를 만들고, 허용 질문·금지 요구·공식 후속 경로·정책 버전을 hash에 결합한다. 다른 기관의 객체 접근, 다른 상담원의 발신, 등록되지 않은 수신자, 임의 목적 추가, 만료·취소 업무 사용을 서버 객체 경계에서 거절한다. 실제 CRM/FDS 서비스에 접속하지 않는다.

주요 파일: `services/api/src/finals-model.ts`, `services/api/src/finals-authority.ts`.

### B. DID·위임 VC

**구현 상태: 선택한 프로파일 구현 완료. 검증 상태: 정적 검사 통과·단위 테스트 통과·실환경 검증 대기.**

기존 승인 JSON을 VC로 이름만 바꾸지 않고 VC 객체를 별도로 만들었다. issuer, credentialSubject, 유효기간, 상태와 서비스 키·목적·정책·epoch·승인키 버전을 결합한다. VC JSON 자체를 compact JWS payload로 서명하는 프로파일이다.

- VC 표현: VC 2.0 JSON, JOSE `alg=EdDSA`, `typ=vc+jwt`, `cty=vc`, 등록된 DID verification method의 `kid`.
- 검증: 등록 기관/서비스 키, DID controller 및 assertion/authentication 관계, 목적·기간·상태·키 버전의 일치 검사.
- 소유 증명: 복사한 VC만으로 발신하지 못하도록 Sender 장기키 허가와 브라우저 세션키의 서명을 요구.
- hash: policy 전체와 서명 전 VC payload 전체를 각각 JCS UTF-8 → SHA-256 → 소문자 hex로 계산. JWS 문자열의 hash와 구분.
- resolver: 사전 등록 문서 또는 고정된 did:web HTTPS URL만 사용. 원격 조회는 2초·32KiB·redirect 금지. 원격 did:web은 ASCII host/path 부분집합이며 포트/percent-encoding은 지원하지 않음.

정책/VC hash 고정 벡터를 별도 Python 표준 라이브러리 계산으로 만들었다. 외부 DID 조회와 범용 VC 상호운용·적합성 시험은 실행하지 않았다. 프로젝트 전용 status/vocabulary를 범용 W3C status-list 구현으로 표현하지 않는다.

주요 파일: `packages/protocol/src/finals.ts`, `services/api/src/did.ts`, `tests/fixtures/finals-policy-vector.json`, `tests/fixtures/finals-vc-vector.json`.

### C. Issuer Gateway·Sender Agent·로그인

**구현 상태: 구현 완료. 검증 상태: 정적 검사 통과·단위 테스트 통과·실환경 검증 대기.**

Issuer가 업무·위임·수신자·목적·시도 상태를 확인하고 기관키로 승인한다. Sender는 인증한 상담원의 할당 업무, 시도와 브라우저 세션 공개키를 결합해 최대 60초 허가를 서명한다. 장기 기관키·서비스키를 브라우저로 전달하지 않는다.

서비스별 token과 원래 사용자 세션을 함께 검사한다. 하나의 PostgreSQL을 쓰더라도 Platform/Sender와 issuer_v2 쓰기 계정, auth 계정을 구분하도록 migration과 배포 설정을 작성했다. 실제 계정 생성·GRANT 적용은 하지 않았다.

역할 로그인에는 OIDC authorization code, S256 PKCE, state/nonce, JWT 검증과 token 재사용 방지 기록을 구현했다. 공식 업무는 별도 client/audience와 cookie를 사용한다. 직접 ID token 로그인은 공개 배포 API에서 막고 개발 화면에서만 제공한다. 실제 IdP 접속은 미실행이다.

주요 파일: `services/api/src/finals-server.ts`, `finals-config.ts`, `oidc-flow.ts`, `services/api/drizzle/0001_finals_authority.sql`.

### D. 승인·소비·취소·수신 검증 SDK

**구현 상태: 구현 완료. 검증 상태: 정적 검사 통과·단위 테스트 통과·실환경 검증 대기.**

v2 strict schema를 추가하고 v1 schema/fixture는 보존했다. v1/v2 객체를 자동 혼용하거나 v1로 fallback하지 않는다.

승인은 업무·시도·수신자·정책·VC·발신 허가·브라우저 키·session·epoch·키 버전을 결합한다. binding에는 양측 SDP hash와 fingerprint, 수신자 nonce/키 hash, transport profile을 넣고 양측 세션키의 소유 증명을 검사한다.

소비 코드의 동작은 다음과 같다.

- 최초 binding을 기관 행 잠금 안에서 고정하고 서명 영수증까지 함께 저장.
- 동일 binding 재시도에는 저장된 동일 영수증 반환.
- 다른 binding으로 재사용하면 거절.
- 취소가 먼저 반영됐으면 소비 거절. 소비 뒤 취소되면 현재 상태 응답에서 철회 반영.
- commit 뒤 응답 유실은 같은 binding 재시도로 복구하도록 구성.
- 발급과 소비 시 권한·철회·키 버전 상태 재검사.

수신 SDK는 VC·허가·승인·영수증과 새 nonce에 대한 최대 5초 상태 서명을 검증한다. 실제 DTLS certificate와 datachannel 증거를 얻지 못하는 환경에서는 검증 완료로 표시하지 않는다.

메모리 테스트는 상태 전이와 서명 결합을 확인한 것이다. **PostgreSQL 동시 소비·취소 경합·crash 복구의 실제 보장은 아직 검증하지 않았다.**

주요 파일: `finals-authority.ts`, `finals-store.ts`, `packages/verifier/src/finals.ts`, `services/api/src/consumption.ts`.

### E. 원장·witness·공동 운영·키 회전

**구현 상태: 구현 완료. 검증 상태: 정적 검사 통과·단위 테스트 통과·실환경 검증 대기.**

재사용 위임과 개별 통화 승인을 분리했다. VC digest 문자열을 기존 계약의 위임 ID 입력에 연결하고, 정상 통화마다 새 위임 트랜잭션을 만들지 않는다.

각 witness는 자기 RPC에서 chain ID, genesis, 블록 hash와 기관/위임 관계를 확인한다. 집계기는 단일 RPC나 가장 낮은 높이에 의존하는 대신 witness별 후보 블록을 교차 검사하고, 동일 상태의 유효 서명 3개를 모으면 느린 나머지 요청을 취소한다.

중복 signer/같은 키의 별칭, 다른 snapshot 혼합, rollback, 같은 높이의 다른 hash/상태, stale 증거를 검사한다. freshness는 블록 timestamp와 최초 monotonic deadline에 근거하며 새 서명 시각으로 오래된 상태의 수명을 늘리지 않는다. quorum 부족과 유효하지만 오래된 quorum은 오류를 구분한다. 실제 체인 정지 원인 진단을 완료했다는 뜻은 아니다. 현재 rollback guard는 메모리 범위이며, cold restart 이후 연속성을 보장할 영속 high-watermark는 미구현이다.

공동 복구 2-of-3과 witness 상태 증언 3-of-4는 별개다. 승인자는 자기 환경에서 자기 키 하나로 EIP-712 요청에 서명한다. 새 epoch/승인키를 원장 증언과 대조한 뒤 활성화하고, 구 VC·승인·시도를 무효화한다. 새 trust bundle과 웹 pin도 함께 갱신해야 한다.

주요 파일: `witness-aggregate.ts`, `services/witness/src/server.ts`, `governance-v2.ts`, `scripts/sign-recovery.ts`, `packages/verifier/src/index.ts`.

### F. 마이크·TURN·PBX

**직접 경로 구현 상태: 구현 완료. PBX 전체 경로 구현 상태: 구현 중. 검증 상태: helper 단위 테스트 통과·실환경 검증 대기.**

직접 경로에는 마이크 준비, 수락 전 track 미부착, 수락 후 양방향 음성, 음소거, 거절/종료, 장치/연결 오류 정리를 구현했다. 새 PeerConnection이나 ICE 변경은 새 시도와 재검증을 요구한다. 서버의 단기 TURN credential 발급 코드와 HTTPS/WSS·외부 origin 설정을 준비했다.

PBX는 다음 부분까지만 작성했다.

- `AsteriskAdapter`: ARI originate 제어 요청.
- `MediaEdgeAdapter`: HTTPS leg 생성 요청과 응답 schema.
- `verifyPbxMapping`: edge·채널·시도·session·binding의 서버 간 매핑 검사.

**실제 Media Edge 제품/bridge, SIP·RTP 연결 및 PBX 수신 UI/검증 경로는 미완료다.** 예정된 WebRTC 신뢰 종단은 Media Edge이며 PBX leg 증거를 상담원 개인 신원으로 취급하지 않는다. 현재 v2 직접 경로는 PBX profile을 정상 인증으로 수락하지 않는다.

주요 파일: `apps/web/src/lib/liveMedia.ts`, `finalsCall.ts`, `services/api/src/media.ts`.

### G. 스트리밍 STT·목적 기반 위험 분석

**구현 상태: 구현 완료. 검증 상태: 정적 검사 통과·단위 테스트 통과·실환경 검증 대기.**

상대방 수신 stream만 동의 후 ingestion으로 보내고, Deepgram WSS → segment/revision → 목적 정책·규칙·선택 Anthropic 분석 → 근거 있는 위험 이벤트로 연결하는 코드를 작성했다. 기존 Ollama adapter도 보존했다.

partial/final, segment ID, revision, 중복·역순 이벤트, 수정에 따른 경고 교체/철회, 늦은 LLM 응답, timeout·취소·backpressure와 요청 수 상한을 처리한다. 규칙 시험에는 “OTP를 알려주지 마세요”, 인용·자기정정과 비밀 유지 강요의 구분을 포함했다. 모든 한국어 표현이나 문맥을 해결한 것은 아니다.

분석 결과의 근거가 해당 입력 원문에 있는지, 현재 revision인지 검사한다. LLM에 도구를 제공하지 않고 전사문을 불신 데이터로 전달한다. 동의 철회/연결 종료 때 분석을 중단하며 서버의 음성 영구 저장은 기본 비활성이다.

키·모델 미설정이나 제공자 실패는 분석 불가 또는 명시적인 규칙 fallback으로 표시한다. 경고가 없다는 결과는 안전 판정이 아니다. 실제 STT/LLM/Ollama를 호출하거나 탐지 정확도를 측정하지 않았다.

주요 파일: `services/api/src/transcription.ts`, `risk.ts`, `finals-server.ts`의 audio 경로, `apps/web/src/lib/liveMedia.ts`.

### H. 역할별 제품 화면

**구현 상태: 직접 경로 구현 완료. 검증 상태: 타입·번들·UI 정적 검사 통과·브라우저 검증 대기.**

`/finals`에 기관 담당자의 모의 업무 생성·할당·위임 관리, 상담원의 시도·허가·발신, 수신자의 검증·수락·음소거·종료·분석 동의, 공동 운영의 정지·복구·키 활성화를 API에 연결했다. `/official`은 본선 profile에서 별도 로그인·업무 소유권 검사 경로를 사용한다.

인증/승인, 세션 결합, 분석 가능 여부와 위험 상태를 구분한다. 로딩·빈 목록·실패·재시도·권한 부족을 처리하고, API 미연결을 fixture 성공으로 대체하지 않는다. 기존 `/demo`는 명시적인 fixture·브라우저 loopback·과거 증거용으로 보존했다.

주요 파일: `apps/web/src/pages/Finals.tsx`, `App.tsx`, `config.ts`, `lib/api.ts`, `styles.css`.

### I. 서버컴 → GCP 배포 준비

**구현 상태: 직접 경로 구성 작성 완료. 검증 상태: Compose/셸 정적 검사 통과·이미지/GCP 검증 대기.**

공통 소스의 app/web Dockerfile, 전체 Compose, 선택 HTTPS/TURN·PBX overlay, nginx/Caddy 설정, 비밀값 없는 `.env.example`, 환경 schema, GCP VM/디스크/방화벽 Terraform과 systemd 구성을 작성했다.

DB·체인 데이터·키·trust의 영속 경로를 구분했다. Platform의 DB/개인키/ledger network 접근, DB/RPC host port 공개, validator/witness의 다른 개인키 접근을 줄이도록 구성했다. 외부 origin은 명시적인 public 모드와 HTTPS를 요구하며 공개 demo 설정을 거절한다.

기동·재시작에 migration·seed·계약 배포·키 재발급을 넣지 않았다. 준비된 이미지로 `--no-build --pull never`를 사용한다. 새 배포 키 준비와 같은 배포의 복원을 구분하고, 기존 디렉터리에 새 키를 자동 생성하지 않도록 했다.

DB backup·새 빈 DB restore·rollback 절차를 작성했다. **backup helper는 DB dump만 만들며, 체인·키까지 포함한 일관된 전체 배포 backup 자동화는 아니다.** 같은 checkpoint의 전체 backup은 별도 운영 절차가 필요하다.

주요 파일: `infra/deploy/`, `infra/gcp/`, `scripts/{prepare-finals,provision-finals,migrate-finals}.ts`, `scripts/{deployment,backup,restore}.sh`.

### J. 테스트·CI·실행 차단

**구현 상태: 구현 완료. 검증 상태: 가벼운 검사 통과·실환경/CI 검증 대기.**

| 구분 | 경로 | 현재 정책 |
|---|---|---|
| light | `pnpm light`, `pnpm test:light` | 기본 허용. 최대 worker 2개. TCP/UDP/listen/fetch 실수 차단 |
| integration | `pnpm test:integration` | PostgreSQL 사용. 명시적 실행 승인 전 차단 |
| chain | 계약·witness 장애 시험 | 명시적 chain 실행 승인 전 차단 |
| media | `pnpm test:media`(v2), `test:e2e`(v1) | 명시적 media 실행 승인 전 차단 |
| performance | `pnpm test:benchmark` | 명시적 performance 실행 승인 전 차단 |

일반 push/PR workflow는 light만 수행하도록 바꿨다. integration은 수동 workflow와 별도 environment 승인으로 분리했다. GitHub environment의 required reviewer 설정 자체는 운영자가 해야 하며 이번 작업에서 CI를 실행하지 않았다. 기존 무거운 시험을 삭제하지 않았다.

신규 PostgreSQL 저장소 시험과 본선 Playwright 미디어 시험은 작성·타입 검사만 했다. 본선 미디어 설정에는 자동 서버 기동 hook이 없다. 필요한 실제 환경값이 없으면 NOT-RUN skip이며 PASS가 아니다.

주요 파일: `vitest*.config.ts`, `playwright.finals.config.ts`, `tests/unit/`, `tests/integration/finals-store.test.ts`, `tests/media/finals-call.spec.ts`, `scripts/restricted.mjs`, `.github/workflows/`.

### K. 문서·4회차 제출 준비

README, 아키텍처, 프로토콜, 위협 모델, 알려진 한계, 공식 표준, ADR, 요구 추적표, runbook과 4회차/최종 보고서 초안을 갱신했다. 멘토링 원문이 없는 항목은 **원문 확인 필요**로 두었고, 이번 개발 요구를 멘토 발언으로 바꾸지 않았다.

원본 기획 PPTX/PDF, 기존 녹화·스크린샷·시험 결과는 보존했다. 과거 PASS와 현재 검증을 구분하는 안내를 추가했다. 실환경 통합 전 본선 통화 성공·배포 이력·성능·장애 수치를 새로 만들지 않았다.

## 5. 실제 실행한 검사와 결과

아래는 앞선 개발에서 실제 실행하고 기록한 결과다. 이 보고서 작성 중 재실행한 결과는 아니다.

| 실행 명령/검사 | 결과 | 해석 범위 |
|---|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | 완료 | 기존 lockfile/cache 사용, lifecycle 생략. 모델/브라우저/이미지 다운로드 없음 |
| `pnpm light` | 통과 | 소스 위생·타입·외부 의존 없는 단위 테스트. 전체 ESLint 규칙 검사는 아님 |
| `pnpm test:light --reporter=verbose --reporter=json --outputFile.json=artifacts/finals-light-results.json` | **44/44 통과** | 기존 회귀를 포함한 총44개. 실제 서비스 통합 시험이 아님 |
| `VITE_PROTOCOL_PROFILE=finals pnpm --filter @callsign/web build` | 경고와 함께 통과 | 웹 번들/타입 검사. 브라우저 실행 결과는 아님 |
| `docker compose -f infra/deploy/compose.yml -f infra/deploy/compose.pbx.yml config --no-interpolate --no-env-resolution --format json` | 통과 | 설정 파싱만. 기본 Compose도 별도 파싱 확인 |
| Compose 파서 출력에 대한 Node assertion | 통과 | Platform 접근 경계, 내부 포트 비공개, validator/witness 키 mount 범위 |
| `bash -n scripts/*.sh` | 통과 | 셸 문법만 검사 |
| `git diff --check` | 통과 | diff 공백/충돌 관련 검사 |
| 기본 상태의 `node scripts/restricted.mjs chain node -e 'process.exit(99)'` | 예상대로 exit 78 | 실행 차단 확인. 하위 명령 미실행 |
| UI 소스 정적 detector | 지적 없음 | 실제 렌더링·접근성·반응형 검수는 아님 |

저장된 단위 시험의 시작 시각은 **2026-10-26 18:26:56 KST**이며, 검증 요약 기록 시각은 **18:28:05 KST**다. 재현 기준 커밋은 개발 시작점이고 변경은 미커밋이므로, 현재 상태를 확정된 새 Git 커밋으로 재현할 수 있는 단계는 아니다.

### 44개 단위 테스트의 구성

| 시험 파일 | 개수 | 결과 |
|---|---:|---|
| `tests/unit/finals.test.ts` | 12 | 통과 |
| `tests/unit/revisions.test.ts` | 11 | 통과 |
| `packages/protocol/src/index.test.ts` | 6 | 통과 |
| `packages/verifier/src/index.test.ts` | 4 | 통과 |
| `tests/integration/risk.test.ts` | 4 | 통과 — 디렉터리명과 달리 외부 서비스 없는 로직 시험 |
| `tests/unit/media.test.ts` | 3 | 통과 — fake track/TURN/PBX helper |
| `tests/unit/governance.test.ts` | 1 | 통과 |
| `tests/unit/oidc.test.ts` | 1 | 통과 |
| `tests/unit/platform.test.ts` | 1 | 통과 — 포트 없는 Fastify inject |
| `tests/unit/witness.test.ts` | 1 | 통과 — fake witness 응답 |
| **합계** | **44** | **실패 0** |

검사한 오류에는 객체 접근 위반, VC 복사/서명 위조, v1/v2 혼동, 같은/다른 binding 재사용, 취소 전후 전이, 키 회전, status/receipt 변조, 미지원 transport, 부정/인용/수정 전사, 늦은 응답·동의 철회, backpressure와 중복 witness 키가 포함된다.

### 경고와 증거 파일

웹 빌드에는 `punycode` deprecation/browser externalization, 효과 없는 dynamic import, 500KiB 이상 chunk 경고가 남았다. 빌드는 통과했지만 실제 브라우저에서 확인해야 한다.

- 이번 단위 시험 원본: `artifacts/finals-light-results.json`.
- 이번 검증 요약: `artifacts/finals-validation.json`.
- 기존 `artifacts/vitest-results.json`, 다른 과거 증거 및 `docs/TEST-RESULTS.md`는 2026-09-14 기록으로 보존.

단위 테스트의 fake는 PostgreSQL 원자성, 실제 통화 성공, QBFT 장애 내성이나 AI 정확도의 독립 증거가 아니다. 이 보고서에는 해당 성능·성공 수치를 넣지 않았다.

## 6. 주요 설계 선택

| 선택 | 이유와 한계 |
|---|---|
| 기존 스택·의존성 재사용 | 전면 재작성과 불필요한 프레임워크 도입을 피함 |
| 기관 단위 JSONB 권위 경계 | 취소·소비·회전을 같은 잠금 경계로 단순화. 대규모 운영의 정규화·retention 설계는 별도 필요 |
| Platform/Issuer/Sender 역할 분리 | 기관·서비스 개인키와 issuer 쓰기 권한의 접근 범위를 구분 |
| VC와 개별 연락 승인 분리 | 재사용 위임과 1회 통화 권한을 혼동하지 않고 통화별 온체인 위임 생성 방지 |
| v2 strict schema, 자동 fallback 없음 | v1 증거를 보존하면서 버전 혼동·다운그레이드 방지 |
| 영수증까지 transaction에 저장 | commit 후 응답 유실 시 같은 결과 복구를 준비. 실제 DB 검증은 대기 |
| 분산 witness 후보 + 최초 deadline | 단일 RPC/가장 느린 노드 의존을 줄이고 오래된 상태 재서명에 의한 연장 방지 |
| 새 연결은 새 승인·재검증 | 재접속을 기존 연결 증거로 인증하는 오류 방지. 장시간 세션 연장은 미구현 |
| 음성 분석과 인증 분리 | 내용 분석을 발신 인증이나 안전 보장으로 오해하지 않도록 구성 |
| startup과 초기화 분리 | 재시작·복원 때 체인/계약/키가 자동 초기화되지 않도록 구성 |

이 선택의 상세 기록은 `docs/adr/0002-finals-offline.md`에 있다.

## 7. 남은 구현 결함과 제약

| 항목 | 현재 상태 | 다음에 필요한 작업 |
|---|---|---|
| 실제 PBX 통화 | **구현 중** | Media Edge/bridge 선정, SIP·RTP·signaling 연결, 별도 PBX 수신 검증과 UI |
| 공유·영속 quota | **미착수** | 프로세스/재접속을 넘는 요청·비용 한도와 보관 정책. 현재 개별 제한만 있음 |
| 영속 high-watermark | **미착수** | cold restart 뒤 rollback 방어 연속성 설계. 현재 메모리 guard와 시계/freshness에 의존 |
| 장시간 승인 연장·자동 복구 | **미착수** | 현재 짧은 승인 만료 후 새 시도 필요. 연결 증거를 보존하는 연장/재검증 프로토콜 필요 |
| 대규모 저장소 운영 | **미착수** | JSONB 행 크기·보관·감사 retention·잠금 대기·정규화 정책 |
| 범용 VC/네이티브 QBFT 증명 | **미착수/현재 프로파일 밖** | 범용 적합성·상호운용 시험, native header/storage proof는 별도 확장 |
| OIDC·서비스·DB·체인·미디어 | **실환경 검증 대기** | 배포 환경과 계정으로 실제 동작/거절/장애 경로 확인 |
| UI runtime·접근성 | **실환경 검증 대기** | 브라우저/모바일/반응형/키보드 및 실제 미디어 검사 |
| GCP·이미지·복구 | **실환경 검증 대기** | 이미지 존재/기동, Terraform 검사, 재시작·일관 backup/restore·rollback |
| 멘토링 원문·최종 제출 형식 | **외부 정보 필요** | 실제 원문/양식에 근거해 반영표·제출물 확정 |

한국어 규칙은 일부 표현을 보수적으로 처리하는 수준이다. STT 품질, 오탐/미탐, 제공자 응답의 의미 정확도는 측정하지 않았다. 분석 불가나 경고 없음은 안전을 뜻하지 않는다.

## 8. 이후 필요한 설정과 자격 증명

실제 비밀값을 채팅이나 Git에 넣지 않고 운영자가 별도 보관해야 한다.

| 분류 | 준비할 종류 |
|---|---|
| 도메인/신뢰 | 소유 HTTPS/DID 도메인, DNS/TLS, issuer/service DID 문서, trust bundle와 웹 pin hash |
| 로그인 | OIDC issuer/JWKS/authorization/token URL, 일반·공식 업무의 별도 client ID/audience, 사전 등록 역할 계정. 현재 code flow는 S256 PKCE public client의 token authentication method `none` 사용 |
| DB/서비스 인증 | migrator·issuer·auth LOGIN 계정과 권한, 서로 다른 서비스 token |
| 서명/공동 운영 | 기관 승인키 버전, Sender 서비스키, witness별 키, 기관 관리자/정지키, 승인자별 개별 키 |
| 원장/이미지 | 실제 network ID/genesis/registry/기관 metadata, 같은 소스 revision의 app/web image tag 또는 digest |
| TURN/PBX | TURN 주소·secret·공인 IP·인증서·relay 범위, 실제 Asterisk/Media Edge 이미지·계정·종단 구성 |
| STT/LLM | 선택 provider 계정/API key/model, 데이터 처리 동의·보관 설정, 과금 상한 |
| GCP | 프로젝트·IAM/service account·zone·VM·VPC·디스크·운영자 CIDR·정확한 OS image |

현재 STT adapter 기본 상한은 연결당 5분/12,000,000 bytes, 시도별 재연결 제한 3회이며 실제 시도 만료에도 묶인다. LLM은 analyzer당 20회·응답 최대 700 token이다. **계정 전체 월간 과금과 다중 프로세스 공유 quota는 이 코드만으로 보장하지 않는다.** 제공자 콘솔 한도 설정이 필요하다.

## 9. 실행 승인 뒤의 검증·이전 순서

아래는 미래 절차다. 현재 실행 요청으로 취급하지 않는다.

1. **배포 대상 확정:** 소스 revision, 로컬/GCP 대상, 새 배포인지 기존 배포 복원인지, 승인된 실행 범주를 정한다.
2. **DB:** migration·별도 LOGIN/GRANT를 적용하고 권한 거절, 동시 소비/취소, commit 후 재시도와 rollback을 실제 PostgreSQL에서 검증한다.
3. **서비스/로그인:** Issuer/Sender/Platform의 key mount·token·OIDC·할당 권한·공식 업무 별도 인증과 소유권을 확인한다.
4. **원장:** 같은 QBFT 체인의 노드 4개와 witness 4개의 chain/genesis/block/state, VC digest 등록·철회, quorum 부족/stale/rollback, 새 승인키 복구를 확인한다.
5. **직접 통화:** 별도 기기 HTTPS/WSS에서 실제 마이크, 수락 전 0 audio, 수락 후 양방향 음성, 음소거·거절·종료·장치 오류·TURN relay·만료·재연결 정책을 확인한다.
6. **음성 분석:** 별도 동의와 작은 예산으로 STT/LLM의 partial/final·수정·timeout·취소·동의 철회·지출/로그를 확인한다. 마이크 시험의 성공을 provider 시험 성공으로 보지 않는다.
7. **PBX:** 실제 bridge 종단부터 완성·검토한 뒤 SIP/Media Edge와 별도 수신 검증을 시험한다.
8. **운영:** 승인된 소규모 장애/부하, GCP 재시작, 일관 backup·새 환경 restore·호환 rollback을 검증한다.
9. **증거 갱신:** 실제 실행 커밋, 환경, image digest, DB/chain/키 버전, browser/provider/model과 raw 결과를 기록한 뒤 보고서·발표 자료를 갱신한다.

실행 범주는 `infrastructure`, `integration`, `chain`, `media`, `performance`로 구분하며 해당 사용자 승인 뒤에만 지정한다. 여러 범주는 명령별로 순서대로 적용한다. 운영 명령은 아래 원칙을 따른다.

- 재시작에 초기화·migration·seed·계약 배포·키 재발급을 넣지 않는다.
- 새 배포는 새 키/신뢰 설정을 준비한다. 로컬 demo 키를 GCP에 그대로 복사하지 않는다.
- 같은 배포 복원은 기존 키·chain/genesis/registry/epoch/trust를 대조하며 키를 재발급하지 않는다.
- backup helper만으로 전체 배포 일관성을 보장하지 않는다. 정지된 동일 checkpoint의 노드별 데이터·DB·키·trust/env를 함께 보관한다.
- rollback은 DB 호환성과 최신 철회/epoch를 확인한다. 과거 정상 상태로 되돌려 인증을 열지 않는다.
- 도메인 변경은 DID·VC·trust·OIDC·origin·TLS/TURN 설정에 함께 반영한다.

## 10. 4회차 멘토링·발표에서 사용할 내용

보고 흐름은 **모의 금융 업무 → 위임/개별 승인 → 현재 연결 검증 → 목적 기반 음성 분석 → 공동 운영/배포 경계 → 실제 증거와 남은 검증** 순서로 구성했다.

멘토링 원문은 제공되지 않았다. 업무 실체, DID/VC, 키 분리/공동 운영, 실제 통화/AI, 제출·성능 관련 항목은 모두 원문 확인이 필요하다. 현재 판단과 변경은 이번 사용자 개발 요구에 근거한 것이며 실제 멘토의 의견으로 인용하지 않는다.

발표 자료에서는 `/demo`의 fixture/생성 음원/과거 증거와 `/finals`의 신규 provider 코드를 구분한다. 본선용 실통화 성공 화면, 실제 배포 이력, 성능·장애·정확도 수치를 검증 전 채우지 않는다.

## 11. 근거 문서와 공식 참고자료

이 보고서는 결과 전달용 snapshot이다. 이후 진행 상태는 `docs/FINALS-IMPLEMENTATION-PLAN.md`, 실행 절차는 `docs/RUNBOOK.md`에서 이어 관리한다. 기존 문서를 삭제·병합하거나 원본 증거를 대체하지 않았다.

| 저장소 자료 | 용도 |
|---|---|
| `AGENTS.md` | 다음 세션에서도 유지할 실행 제한 |
| `docs/FINALS-IMPLEMENTATION-PLAN.md` | 요구 → 코드 → 시험 → 구현/검증 상태 |
| `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md` | 서비스·키·DB·통화 신뢰 경계, v1/v2 구분 |
| `docs/THREAT-MODEL.md`, `docs/KNOWN-LIMITATIONS.md` | 공격 경계, 미구현/미검증 사항 |
| `docs/adr/0002-finals-offline.md` | 설계 선택과 이유 |
| `docs/RUNBOOK.md` | 명령 인자/파일 위치, 승인 뒤 기동·키 회전·backup/restore·GCP 절차 |
| `docs/STANDARDS.md` | 공식 원문과 실제 적용 범위 |
| `submission/FINALS-ROUND4.md` | 4회차 구성, 멘토링 원문 확인 항목, 최종 보고서 초안 |
| `artifacts/finals-light-results.json`, `artifacts/finals-validation.json` | 이번 검사 원본과 요약 |

공식 참고자료는 앞선 개발에서 확인해 프로파일 결정에 사용했다. 이 보고서 작성 중 표준 적합성 시험을 새로 수행하지 않았다.

- [W3C VC Data Model 2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/): 별도 VC 데이터 모델.
- [Securing VC using JOSE and COSE](https://www.w3.org/TR/2026/REC-vc-jose-cose-20261013/): 선택한 JSON VC/JOSE 표현.
- [DID Core 1.0](https://www.w3.org/TR/2022/REC-did-core-20220719/), [did:web method](https://w3c-ccg.github.io/did-method-web/): controller·키 관계와 제한된 resolver. did:web은 커뮤니티 사양이다.
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), [EIP-712](https://eips.ethereum.org/EIPS/eip-712): canonical JSON과 공동 복구 서명.
- [TURN REST 초안](https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00): 단기 credential 방식 참고. 정식 RFC라고 표현하지 않는다.
- [Deepgram Listen streaming](https://developers.deepgram.com/reference/speech-to-text/listen-streaming), [Anthropic Messages](https://platform.claude.com/docs/en/api/beta/messages/create): 실제 provider adapter의 참고 API. 호출 검증은 대기다.

## 부록. 기준 커밋 이후 변경 파일

아래 목록은 이 보고서 작성 시 Git에서 확인한 변경/신규 파일이다. 신규 파일은 아직 추적되지 않은 상태일 수 있다. 파일이 존재한다는 사실을 실제 서비스 검증의 증거로 해석하지 않는다.

### 기존 파일 수정

```text
.env.example
.github/workflows/ci.yml
README.md
apps/web/src/App.tsx
apps/web/src/components/Shell.tsx
apps/web/src/config.ts
apps/web/src/lib/api.ts
apps/web/src/pages/Experience.tsx
apps/web/src/styles.css
apps/web/vite.config.ts
docs/ARCHITECTURE.md
docs/KNOWN-LIMITATIONS.md
docs/PROGRESS.md
docs/PROTOCOL.md
docs/TEST-RESULTS.md
docs/THREAT-MODEL.md
infra/compose/docker-compose.yml
package.json
packages/protocol/src/index.ts
packages/verifier/src/index.ts
playwright.config.ts
pnpm-lock.yaml
scripts/benchmark-verifier.ts
scripts/check-ledger.ts
scripts/demo-up.sh
scripts/deploy-registry.ts
scripts/generate-besu.sh
scripts/generate-web-trust.ts
scripts/init-demo-keys.ts
scripts/latest-state-query.ts
scripts/migrate.ts
scripts/seed.ts
scripts/setup.sh
scripts/test-integration.sh
scripts/test-witness-failover.sh
scripts/wait-postgres.sh
services/api/package.json
services/api/src/auth.ts
services/api/src/consumption.ts
services/api/src/risk.ts
services/api/src/server.ts
services/witness/src/server.ts
tests/integration/api-auth.test.ts
tests/integration/consumption.test.ts
tests/integration/governance.test.ts
vitest.config.ts
```

### 신규 파일

```text
.dockerignore
.github/workflows/integration-manual.yml
AGENTS.md
apps/web/src/lib/finalsCall.ts
apps/web/src/lib/liveMedia.ts
apps/web/src/pages/Finals.tsx
artifacts/finals-light-results.json
artifacts/finals-validation.json
docs/FINALS-DEVELOPMENT-REPORT.md
docs/FINALS-IMPLEMENTATION-PLAN.md
docs/RUNBOOK.md
docs/STANDARDS.md
docs/adr/0002-finals-offline.md
infra/deploy/Caddyfile
infra/deploy/app.Dockerfile
infra/deploy/compose.pbx.yml
infra/deploy/compose.yml
infra/deploy/nginx.conf
infra/deploy/turnserver.conf.example
infra/gcp/callsign.service
infra/gcp/main.tf
packages/protocol/src/finals.ts
packages/verifier/src/finals.ts
playwright.finals.config.ts
scripts/backup.sh
scripts/check-source.mjs
scripts/deployment.sh
scripts/migrate-finals.ts
scripts/prepare-finals.ts
scripts/provision-finals.ts
scripts/restore.sh
scripts/restricted.mjs
scripts/sign-recovery.ts
services/api/drizzle/0001_finals_authority.sql
services/api/src/did.ts
services/api/src/finals-authority.ts
services/api/src/finals-config.ts
services/api/src/finals-model.ts
services/api/src/finals-server.ts
services/api/src/finals-store.ts
services/api/src/governance-v2.ts
services/api/src/media.ts
services/api/src/oidc-flow.ts
services/api/src/transcription.ts
services/api/src/witness-aggregate.ts
submission/FINALS-ROUND4.md
tests/fixtures/finals-policy-vector.json
tests/fixtures/finals-vc-vector.json
tests/integration/finals-store.test.ts
tests/media/finals-call.spec.ts
tests/unit/finals.test.ts
tests/unit/governance.test.ts
tests/unit/media.test.ts
tests/unit/offline.ts
tests/unit/oidc.test.ts
tests/unit/platform.test.ts
tests/unit/revisions.test.ts
tests/unit/witness.test.ts
tsconfig.light.json
vitest.integration.config.ts
```
