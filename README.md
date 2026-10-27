# CallSign · 기관 연락 승인과 통화 세션 검증

CallSign은 **기관의 업무에 근거한 개별 연락 승인**, **위탁 발신자의 권한과 현재 통화 연결**, **음성에서 드러난 위험 요구**를 따로 검증하는 TEAM Signal의 개념검증입니다. 본선 대표 사례는 **모의 금융기관의 이상거래 확인 연락**입니다. 실제 금융기관·정부·통신사 연동 서비스가 아닙니다.

멘토링 검토는 [서비스 개요·구조·통화 흐름·보안·현황](docs/mentoring/README.md)에서 시작합니다.

## 현재 개발 상태

2026-10-27 현재 인프라를 실행하지 않는 개발 단계입니다. 업무·위임 VC·분리 Issuer/Sender·v2 승인/소비·수신 SDK·마이크/STT·역할 화면·배포 코드를 추가했습니다. **전체 서비스가 통합 검증되거나 본선용으로 배포된 상태는 아닙니다.** 세부 구현 상태와 검증 결과는 [본선 진행·추적표](docs/FINALS-IMPLEMENTATION-PLAN.md)가 기준입니다.

전체 목표와 완료 조건은 [개발 명세](docs/MASTER-DEVELOPMENT-SPEC.md)에서 관리합니다. 후속 구현에는 DB 세션의 용도 분리·로그아웃·토큰 재사용 차단, 업무/VC 반환 범위, 연결 권한 재검사와 분석 정리를 보완했습니다. 새 migration은 작성만 했으며 실제 DB·통화·제공자 검증은 대기입니다.

- `/finals`: 모의 CRM/FDS 업무 생성 → 상담원 할당 → 재사용 위임 → 짧은 발신 세션 허가 → 개별 승인 → 수신자의 서명·현재 연결 검증 → 수락 후 양방향 마이크 → 동의한 상대 음성 분석. 실제 API가 없으면 오류를 표시합니다.
- `/demo`: 기존 발표용 브라우저 암호/WebRTC fixture와 저장된 과거 LIVE 증거. 본선 서비스의 성공 증거로 사용하지 않습니다.
- 기존 시청 사례, v1 schema와 fixture, 제출 PPTX/PDF, `artifacts/`의 과거 증거는 보존합니다.
- 확정 기본 경로는 양측 웹↔Asterisk PJSIP/WSS+ARI↔웹입니다. URI 기반 v3 승인/lease·PBX 제어/증거·SIP 모듈은 추가했지만 기존 v2 화면·배포에서 전환 중입니다. 전체 PBX 연결·자동 회수·원장 worker는 미완성입니다. 본선 v2 수신 SDK는 PBX를 직접 WebRTC 인증으로 승인하지 않습니다.
- 최신 light는 18개 파일82개 테스트 통과입니다. 단위·정적 범위이며 실제 DB·체인·통화·AI·GCP 성공을 뜻하지 않습니다. [현재 근거](artifacts/master-implementation-20261027-service.json).

## 가벼운 개발 절차

Node 22, pnpm 11.27.0을 사용합니다. lifecycle script를 생략하면 브라우저·모델·컨테이너 설치를 시작하지 않습니다.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm light
```

`light`는 소스 충돌 표시·JavaScript 문법 검사(`lint`), TypeScript 검사, 네트워크 없는 단위 테스트입니다. ESLint 전체 규칙 검사는 도입하지 않았습니다. Vitest는 최대 worker 2개이고 DB 통합 테스트와 Playwright를 포함하지 않습니다. Fastify `inject`는 포트 없이 fake 요청을 처리합니다. 기존 시험 결과 파일은 덮어쓰지 않습니다.

웹 번들 컴파일만 확인하려면 `pnpm --filter @callsign/web build`를 사용합니다. 서버는 실행하지 않습니다.

## 구조와 실행 경계

```text
React/Vite 수신자·기관·상담원·공동 운영 화면
       │ HTTPS/WSS + 역할 세션/CSRF
       ▼
Platform API (기관·서비스 개인키와 DB 계정 없음)
       ├── Issuer Gateway (업무/승인/소비 DB, 기관 승인키)
       └── Sender Agent (서비스 장기키, 브라우저 세션 공개키 허가)
Issuer ── 서로 다른 3-of-4 witness ── Besu QBFT 4개
브라우저 ↔ 직접 WebRTC (수락 전 track 미부착)
상대 음성 → 동의 → Deepgram → revision → 정책/규칙/선택 LLM → 위험 근거
```

TypeScript/pnpm, React/Vite, Fastify, PostgreSQL/Drizzle, Ed25519/JWS, Solidity/Besu를 유지합니다. 정상 연락마다 새 온체인 위임을 만들지 않습니다. 위임 VC digest를 한 번 원장 위임 ID에 연결하고 개별 통화는 오프체인 승인으로 처리합니다.

## 이후 별도 승인 뒤 실행

현재 `setup`, `dev`, `demo:*`, 통합·체인·미디어·성능 시험은 기본 차단됩니다. 실행 범주별 명시적 환경값과 절차는 [runbook](docs/RUNBOOK.md)에 있습니다. 이번 개발 중 차단을 해제하지 않았습니다.

| 경로 | 내용 | 자동 실행 |
|---|---|---|
| `pnpm light` | 타입·소스·작은 단위 테스트 | 일반 PR/push CI |
| `pnpm test:integration` | PostgreSQL·API/권한·저장소 트랜잭션 | 승인된 수동 workflow만 |
| `pnpm test:contracts`, `test:witness-failover` | 계약·Besu/witness/장애 | 별도 `chain` 승인 |
| `pnpm test:media`, `test:e2e`, `demo:record` | 본선 v2/기존 v1 브라우저·미디어 후속 검증 | 별도 `media` 승인 |
| `pnpm test:benchmark` | 성능 표본 | 별도 `performance` 승인 |

본선 배포는 `infra/deploy/compose.yml`, GCP 준비는 `infra/gcp/`입니다. `.env.example`에는 비밀값이 없습니다. 사전 준비된 이미지·키·trust bundle·기존 체인 데이터로 기동하며 재시작 시 초기화·배포·seed를 실행하지 않습니다. PBX 선택 구성은 `compose.pbx.yml`에 따로 있습니다.

## 문서와 증거

[아키텍처](docs/ARCHITECTURE.md) · [프로토콜](docs/PROTOCOL.md) · [설계 결정](docs/adr/0002-finals-offline.md) · [위협 모델](docs/THREAT-MODEL.md) · [한계](docs/KNOWN-LIMITATIONS.md) · [공식 표준](docs/STANDARDS.md) · [본선 추적표](docs/FINALS-IMPLEMENTATION-PLAN.md) · [멘토링 검토 자료](docs/mentoring/README.md).

[2026-09-14 과거 시험 기록](docs/TEST-RESULTS.md)과 [기존 공개 발표 자료](submission/SELECTED-EVIDENCE.md)는 해당 시점의 환경에 한정됩니다. 과거 공개 URL의 현재 접근 여부, 현재 배포, 통화 성공, 처리량·장애 내성을 이번 개발에서 확인하지 않았습니다. 원격 저장소는 [0u-Y/CallSign](https://github.com/0u-Y/CallSign)입니다.
