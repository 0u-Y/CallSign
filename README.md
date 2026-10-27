# CallSign · 업무에 근거한 연락 승인과 통화 검증

CallSign은 기관과 위탁 콜센터의 연락 업무를 고객의 통화 세션에 연결하는 서비스입니다. 기관이 승인한 업무·수신자·목적과 발신 권한을 확인하고, 통화 중에는 동의한 상대 음성의 위험 요구를 별도로 안내합니다.

현재는 **모의 금융기관의 이상거래 확인 연락**을 기준으로 개발하고 있습니다. 실제 금융기관·통신사 연동은 없습니다. 기관 승인, 현재 연결, 내용 위험, 분석 상태는 구분해 표시합니다.

## 서비스 흐름

1. 기관이 연락 업무와 목적 정책을 만들고 상담원에게 할당합니다.
2. 콜센터는 위임 범위와 키 소유를 증명하고, 해당 고객에 대한 개별 연락 승인을 받습니다.
3. 수신자는 승인·현재 권한·세션 연결 근거를 확인하고 통화를 수락합니다.
4. 동의한 상대 음성에서 위험 요구를 분석하고 발화 근거와 대응 행동을 안내합니다.
5. 민감한 후속 업무는 별도 인증한 공식 화면에서 처리합니다.

[서비스 가이드](docs/guide/README.md)에서 사용자 흐름, 아키텍처, 통화 처리와 신뢰 경계를 볼 수 있습니다.

## 구현 상태

기존 v2 Direct WebRTC 경로에 역할별 업무 화면·승인·소비·검증·마이크·상대 음성 분석 코드를 연결했습니다. 새 v3에는 등록 URI 기반 위임,120초 연결 시작 승인과 진행 lease, Asterisk 채널·브리지 증거와 서버 오디오 경로를 추가했습니다.

**전체 서비스는 개발 중입니다.** 기본 목표인 양측 웹↔Asterisk 통화로 전환하려면 v3 화면·verifier·PBX 사건 처리·자원 회수·원장 worker·복구 절차를 완성해야 합니다. DB·체인·PBX·브라우저 통화·외부 AI·GCP의 현재 통합 검증은 미실행입니다.

- [구현·검증 현황](docs/guide/05-IMPLEMENTATION-STATUS.md): 코드·화면 연결·검증과 남은 작업
- [MASTER 개발 명세](docs/MASTER-DEVELOPMENT-SPEC.md): 전체 요구사항과 완료 조건
- [개발 기록](docs/FINALS-IMPLEMENTATION-PLAN.md): ID별 진행과 검증 이력

## 개발

TypeScript/pnpm, Fastify, React/Vite, PostgreSQL/Drizzle, Solidity/Foundry, Besu를 사용합니다. Node22와 pnpm11.27.0이 필요합니다.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm light
```

`light`는 소스 위생·JavaScript 문법, TypeScript, 네트워크 없는 단위 시험입니다. 최대 worker2이며 DB 통합·브라우저·외부 API는 실행하지 않습니다. `lint`는 전체 ESLint 규칙 검사가 아닙니다. 웹 번들만 컴파일하려면 `pnpm --filter @callsign/web build`를 사용합니다.

실행 제한은 [AGENTS.md](AGENTS.md)를 따릅니다. 현재 단계에서 서비스·컨테이너·체인 기동, migration·계약 배포, 실제 통화·제공자 호출·GCP 변경을 실행하지 않습니다.

## 구성과 운영

- **Platform:** 인증된 요청 전달. 기관·콜센터 개인키와 소비 DB 쓰기 권한 없음
- **Issuer Gateway:** 업무·개별 승인·소비·취소와 기관 승인키
- **Sender Agent:** 콜센터 장기키와 요청별 세션 공개키 증명
- **PostgreSQL:** 업무·세션·소비 영수증·감사와 재처리 의도
- **Besu/Witness:** 권한 계약과 서로 다른 Witness3-of-4의 상태 증언
- **Asterisk:** 목표 웹 통화의 SIP/WSS·음성 종단과 브리지
- **음성 분석:** 상대 stream → 스트리밍 STT → revision·정책 규칙/LLM → 위험 근거

서버컴과 GCP는 같은 소스·이미지·배포 구조를 사용하도록 준비합니다. 설정은 [infra/deploy](infra/deploy/compose.yml), GCP 구성은 [infra/gcp](infra/gcp/main.tf), 실행·백업·복원·키 회전은 [RUNBOOK](docs/RUNBOOK.md)에 있습니다. 일반 재시작에 초기화·migration·키 재발급을 넣지 않습니다. v3/PBX 배포 연결은 아직 남아 있습니다.

통합·체인·미디어·성능 검증은 기본 차단되며 별도 실행 허가가 필요합니다. 일반 push/PR CI는 light만 실행합니다.

## 상세 문서

[아키텍처](docs/ARCHITECTURE.md) · [프로토콜](docs/PROTOCOL.md) · [위협 모델](docs/THREAT-MODEL.md) · [한계](docs/KNOWN-LIMITATIONS.md) · [표준](docs/STANDARDS.md) · [설계 결정](docs/adr/0002-finals-offline.md)

기존 v1·시청 사례·fixture와 과거 시험·기획 자료는 보존합니다. `/finals`는 현재 v2 역할 화면이며 새 v3로 전환 중이고, `/demo`는 기존 fixture·시연 경로입니다. `finals` 경로명은 기존 실행 설정과의 호환을 위해 유지합니다. [과거 시험 기록](docs/TEST-RESULTS.md)과 [보관 문서](docs/archive/2026-10-26/)는 해당 시점의 기록입니다.
