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

기본 업무 화면은 `/service`이며 등록 기관 주소·키 기반 승인, 양측 브라우저의 서명 검증, Asterisk 교환기 연결, 통화 유지 허가와 원격 음성 분석 API에 코드로 연결했습니다. 기관 담당자는 업무·위임을 관리하고 상담원은 할당된 연락을 승인받으며, 수신자는 별도 상태로 승인·연결·분석·위험을 확인합니다. 이전 브라우저 직접 통화 화면은 `/finals` 호환 경로에 보존했습니다.

원장 작업 재처리·사건 cursor, PBX 사건/만료/로그아웃 회수, 공유 사용량 예약·정산, 독립 소비 이력 기준과 암호화 백업·복원 코드도 추가했습니다. **실제 DB·체인·교환기·브라우저·외부 AI·GCP 통합 검증은 하지 않았습니다.** 공동 정책·계정 관리의 이행 경계와 남은 코드·실행 대기 항목은 개발 기록에서 구분합니다.

문서에 남긴 통신 형식 번호는 이 구현 차이를 구별하는 값입니다. 사용자에게 보여주는 제품 등급이나 별도 서비스가 아닙니다. [통신 형식과 용어](docs/PROTOCOL.md#protocol-profiles)를 참고하세요.

- [구현·검증 현황](docs/guide/05-IMPLEMENTATION-STATUS.md): 코드·화면 연결·검증과 남은 작업
- [MASTER 개발 명세](docs/MASTER-DEVELOPMENT-SPEC.md): 전체 요구사항과 완료 조건
- [개발 기록](docs/FINALS-IMPLEMENTATION-PLAN.md): ID별 진행과 검증 이력

## 개발

TypeScript/pnpm, Fastify, React/Vite, PostgreSQL/Drizzle, Solidity/Foundry, Besu를 사용합니다. Node22와 pnpm11.27.0이 필요합니다.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm light
```

`light`는 소스 위생·JavaScript 문법, TypeScript, 네트워크 없는 단위 시험입니다. 시험 동시 실행은 최대 2개이며 DB 통합·브라우저·외부 API는 실행하지 않습니다. `lint`는 전체 ESLint 규칙 검사가 아닙니다. 웹 번들만 컴파일하려면 `pnpm --filter @callsign/web build`를 사용합니다.

실행 제한은 [AGENTS.md](AGENTS.md)를 따릅니다. 현재 단계에서 서비스·컨테이너·체인 기동, migration·계약 배포, 실제 통화·제공자 호출·GCP 변경을 실행하지 않습니다.

## 구성과 운영

- **Platform:** 인증된 요청 전달. 기관·콜센터 개인키와 소비 DB 쓰기 권한 없음
- **Issuer Gateway:** 업무·개별 승인·소비·취소와 기관 승인키
- **Sender Agent:** 콜센터 장기키와 요청별 세션 공개키 증명
- **PostgreSQL:** 업무·세션·소비 영수증·감사와 재처리 의도
- **Besu/Witness:** 권한 계약과 서로 다른 상태 증언자 4개 중 3개가 서명한 원장 상태
- **Asterisk:** 목표 웹 통화의 SIP/WSS·음성 종단과 브리지
- **음성 분석:** 상대 음성 → 스트리밍 STT(음성→문자 변환) → 전사 수정·정책 규칙/언어 모델 → 위험 근거

서버컴과 GCP는 같은 소스·이미지·배포 구조를 사용하도록 준비합니다. 설정은 [infra/deploy](infra/deploy/compose.yml), GCP 구성은 [infra/gcp](infra/gcp/main.tf), 실행·백업·복원·키 회전은 [RUNBOOK](docs/RUNBOOK.md)에 있습니다. 일반 재시작에 초기화·migration·키 재발급을 넣지 않습니다. 교환기 경유 통화의 코드·배포 구성을 연결했으며 실제 이미지·드라이버·통화 검증은 남아 있습니다.

통합·체인·미디어·성능 검증은 기본 차단되며 별도 실행 허가가 필요합니다. 일반 push/PR CI는 light만 실행합니다.

## 상세 문서

[아키텍처](docs/ARCHITECTURE.md) · [프로토콜](docs/PROTOCOL.md) · [위협 모델](docs/THREAT-MODEL.md) · [한계](docs/KNOWN-LIMITATIONS.md) · [표준](docs/STANDARDS.md) · [설계 결정](docs/adr/0002-finals-offline.md)

초기 시청 사례·고정 시험 데이터와 과거 시험·기획 자료는 보존합니다. 기본 화면은 `/service`이며 `/finals`는 보존한 역할별 직접 통화 호환 화면입니다. `/demo`는 고정 시험 데이터와 과거 증거를 사용하는 시연 화면입니다. `finals` 경로명은 기존 실행 설정과의 호환을 위해 유지합니다. [과거 시험 기록](docs/TEST-RESULTS.md)과 [보관 문서](docs/archive/2026-10-26/)는 해당 시점의 기록입니다.

공동 정책 변경·내부 계정 관리·복구 checkpoint·오프라인 실행 전 검사의 최신 범위는 [개발 기록](docs/FINALS-IMPLEMENTATION-PLAN.md#pre-execution-20261027)을 따릅니다. `pnpm preflight`는 서비스를 기동하지 않으며 설정 누락을 구체적으로 차단합니다. 실제 실행 준비/성공을 보증하는 검사는 아닙니다.

실행 준비는 [항목별 준비 결과](artifacts/execution-preparation-rechecked-20261029.json)와 [RUNBOOK](docs/RUNBOOK.md#단계별-검증과-판정)을 따른다. `pnpm prepare:execution --dry-run`은 설정의 생성 순서를, `pnpm validate --stage offline --environment infra/validation/offline.json --output artifacts/NEW.json --execute`는 현재 허용된 검사를 실행한다. 나머지 단계는 별도 실행 허가 전 dry-run만 허용하며 누락 설정과 수동 확인을 PASS로 바꾸지 않는다. 최신 검증 수치는 [개발 기록](docs/FINALS-IMPLEMENTATION-PLAN.md#execution-readiness-20261029)에 기록한다.
