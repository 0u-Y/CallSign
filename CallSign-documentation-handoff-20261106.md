# CallSign 문서 정리·구현 리뷰 통합 인계서

작성일: 2026-11-06(KST). 문서 정리 세션의 결과를 한 파일로 모은 인계서다. 아래 상태는 당시 코드·저장된 실행 증거의 대조 결과이며, 작성 이후 서비스 생존이나 개발 완료를 새로 확인한 보고서는 아니다.

## 1. 결과와 작업 위치

추적 Markdown 43개를 목록화하고 기존 감사와 대조해 문서 13개를 수정했다. 공개 API·로그인이 계속 미연결이라고 적힌 설명을 정정하고, 실행 상태를 하나의 현황표로 통합했다. 서비스 구조·역할별 사용·운영 준비를 보완했으며, 공개 통화 미완료 경계 1건과 화면 상태/로그인 복귀 문제 3건을 리뷰로 남겼다.

| 항목 | 값 |
|---|---|
| 원본 checkout | `/home/ana/Desktop/yyw/CallSign` |
| 문서 작업 worktree | `/home/ana/Desktop/yyw/CallSign-docs-review` |
| 작업 branch | `docs/submission-review-20261106` |
| 시작 main | `20cbd659783ab08791fbbb0abefc939a016391aa` |
| 정리 종료 시 재대조한 main | `1e6a090dace651c99140b8835597db34a24c8850` |
| 문서 정리 커밋 | `09af92b` — Consolidate service status and clarify operating documentation |
| 목록·리뷰 커밋 | `f0f4e4a` — Record Markdown inventory and prioritized implementation review |

원본 checkout의 branch·staging·미커밋 파일, AGENTS의 실행 권한·보존 조건, HTML/PDF 디자인·개인 메모를 변경하지 않았다. 제품 코드·시험·서비스·컨테이너·DB·체인·키·네트워크·Vercel을 변경하지 않았고 main 반영·push·PR·배포도 수행하지 않았다. 이 인계서는 위 두 커밋의 결과를 묶은 후속 문서다.

## 2. 서비스 구조와 사용자 흐름

CallSign은 기존 전화·콜센터 인프라 위에 **기관의 연락 권한과 현재 통화를 확인하는 계층**을 추가하려는 서비스다. 현재 구현 사례는 모의 금융기관의 이상거래 확인 연락이다. 실제 금융기관 고객정보·통신사·상용 전화망에 연동된 서비스로 설명하지 않는다.

현재 시연 통화는 상담원 웹 ↔ Asterisk 교환기 ↔ 수신자 웹이다. 브라우저의 WebRTC 음성을 교환기가 연결한다. 일반 전화 단말·PSTN(공중전화망)·상용 CTI(콜센터 시스템 연동)와 휴대전화 기본 발신 표시는 후속 확장이다.

### 역할과 인증

OIDC는 외부 계정으로 로그인하는 표준이다. 로그인 제공자의 issuer/subject를 제품 내부 계정·기관·권한에 연결하며, 이메일이나 표시 이름만으로 권한을 부여하지 않는다.

| 역할 | 수행하는 일 | 권한 경계 |
|---|---|---|
| 기관 담당자 | 업무·수신자·상담원 할당, 위임·개별 연락 승인, 업무 취소 | 자기 기관과 부여받은 permission 범위 |
| 상담원 | 배정 업무의 시도 생성·승인 요청·발신 | 위임 증서만으로 임의 고객에게 연락할 수 없음 |
| 수신자 | 연락 근거 확인·수락/거절/종료·음성 분석 동의/철회 | 고객 지갑이나 DID는 필수 아님 |
| 공동 승인자·기관 관리자 | 주요 관리 변경 검토·서명·제출·활성화 | 로그인 권한과 암호학적 승인키 소유는 별개 |
| 운영자 | 배포·감시·백업·복구 | 운영자라는 이유로 기관 연락 승인 권한을 얻지 않음 |

### 연락 승인부터 통화 종료까지

1. **업무와 위임:** 기관이 고객·목적·담당 상담원을 정한다. VC(검증 가능한 자격 증명)는 콜센터에 맡긴 재사용 가능한 업무 범위이며, 원장에 등록된 현재 위임 상태도 확인한다.
2. **개별 연락 승인:** 상담원은 배정 업무의 새 통화 시도와 단기 브라우저 키를 만든다. 콜센터 키 소유를 증명하고 특정 고객·업무·시도에 한정된 기관 승인을 받는다. 최초 연결 시작 창은 시도 생성부터 최대 120초다.
3. **실제 연결 결합:** binding은 승인·양측 키·수신자 난수·세션·실제 PBX 연결 근거를 같은 통화에 묶는 데이터다. 화면의 성공 문자열 대신 서명과 실제 연결 관측을 대조한다.
4. **일회 소비와 영수증:** 승인을 해당 binding에 한 번 사용했다고 PostgreSQL에 저장한다. 같은 binding 재시도는 저장한 동일 영수증을 돌려주고 다른 binding으로 재사용하면 거절한다. 소비는 수신자의 수락이나 실제 음성 개통과 다르다.
5. **수락과 Lease:** 수신자가 수락하고 양측 검증을 마쳐야 음성을 보낸다. Lease는 진행 통화를 짧은 기간 허용하고 갱신하는 유지 허가다. 120초 시작 창과 구별하며, 만료된 허가를 사용자 선택만으로 되살릴 수 없다.
6. **음성 분석:** 수신자의 별도 동의 후 상대방 수신 음성을 STT(음성→문자)로 전사한다. 규칙과 LLM(언어 모델)이 목적 정책·현재 전사를 분석하며, 근거 발화와 수정 번호를 화면에 연결한다. AI는 연락 권한을 발급하거나 통화를 자동 제어하지 않는다.
7. **철회와 종료:** 업무 취소·기관 정지·권한 세대 변경은 실제 통화/PBX·분석 회수 경로에 연결된다. 요청 접수, 서버 반영, 실제 음성 중단은 따로 확인한다. 단순 조회 실패는 사기 판정이 아니며, 동의 철회는 통화 종료와 별개다.

기관의 연락 승인은 통화 내용의 안전을 보장하지 않는다. 분석 불가·경고 없음 역시 안전 판정이 아니다. 민감한 후속 업무는 별도로 인증한 공식 업무 화면에서 확인한다.

### 서명·원장·공동 복구의 구분

| 구분 | 의미 |
|---|---|
| JWS / Ed25519 | 위임·개별 연락 승인·소비 영수증·Lease 등 오프체인 서명 |
| EIP-712 | 관리 명령의 대상·작업·내용·nonce·기한을 구조화한 서명 |
| 관리 승인 2-of-3 | Registry 전체의 고정 관리키 3개 중 서로 다른 2개. 특정 기관 대표의 필수 동의를 뜻하지 않음 |
| Besu QBFT | 검증자 노드의 블록 합의·계약 실행 |
| Witness 3-of-4 | 신뢰한 상태 증언자 4개 중 3개의 일치하는 서명. 체인 헤더·상태 직접 증명과 다름 |

공동 복구는 독립 승인 → 원장 확정 → Witness 증거 확인 → 서버의 새 키/권한 세대 적용 → 공개 trust 갱신 → 새 위임·새 연락 순서다. 서버 접수와 원장 확정은 다르며 구 승인·통화가 복구 후 다시 살아나면 안 된다. 후속 main `1e6a090`에는 공개 복구 요청·서명 파일을 가져와 로컬 검증하는 화면이 추가됐지만, 그 코드 추가만으로 공개 실행 성공을 선언하지 않았다.

### 저장·백업·복원

PostgreSQL은 업무·소비·영수증·세션·작업 이력을 보존한다. Anchor는 복원 대상과 분리된 수명의 최신성 기준이다. DB·체인·키를 모두 과거 백업으로 돌렸을 때 내부 일치만으로 최신이라고 믿지 않도록 독립 기준과 journal을 대조한다.

복원은 source의 쓰기 중단·일관된 암호화 백업·별도 target 복원·현재 Anchor 대조·단일 writer 확인을 거친다. 불일치하면 gate를 닫고 원본을 보존한다. 일반 재시작에 NEW·키 생성·seed·초기화를 반복하지 않으며 진행 통화의 무중단 복원을 보장하지 않는다.

## 3. 확인된 범위와 남은 경계

아래는 시작 SHA에 저장된 기록과 마지막 main 소스 대조를 구분한 현황이다. 현재 서버 운영 목표와 후속 AWS 이전을 혼동하지 않는다.


| 영역·요구 ID | 구현과 저장된 실행 근거 | 남은 확인 |
|---|---|---|
| 역할별 로그인·업무 API — AUTH-001/002, UI-001~004 | 공개 Vercel에서 기관·상담원·수신자·승인자의 실제 IdP 로그인, 업무 조회, 로그아웃 후 401 확인. 기관 업무 생성과 상담원 생성 거절은 공개 HTTP에서 확인 | 공개 인증 성공을 통화·분석 성공으로 확대하지 않음. 계정은 합성 계정이며 실제 금융기관 고객 연계가 아님 |
| 공개 통화 — MEDIA-001~004, PBX-001~003 | 실제 지속 API·원장·Witness·PBX·TLS TURN 연결 조사. SIP 등록·INVITE·ICE 완료·ACK를 관측한 시도 있음 | 저장된 공개 조사에서 완료 통화 **0**. 수락 후 검증 실패·간헐 ICE timeout의 원인 확정과 양방향 음성 디코딩은 개발 세션 담당 |
| 내부 격리 통화·회수 — CALL-005/006 | 같은 호스트의 실제 ServiceCall/PBX와 합성 음원에서 정상 통화·업무 취소·기관 정지·종료를 선택 검증 | 공개망·다른 단말·사람 마이크·모든 실패 조합의 증거가 아님 |
| 음성·분석 — AI-001~005 | 상대 remote track→인증 WS→전사/분석 UI·동의 철회는 내부 fixture 제공자로 검증. 실제 OpenAI 텍스트·Deepgram 직접 합성 음원 호출 기록 별도 존재 | 실제 공개 통화 음성→STT→규칙/LLM→화면 전체 경로 미확인. 빈 전사·오인식·목적 label 불일치가 있어 모델 품질 PASS 아님 |
| 공동 승인·복구 — GOVERNANCE-001/002 | 고정 관리키 2-of-3, 원장 확정·Witness 확인·키 활성화 코드. 내부 선택 실행에서 정지·공동 복구·새 연락과 구 권한 무효 유지 확인 | 현재 공개 지속 환경의 동일 흐름은 미확인. 단독 복구 HTTP 400을 EVM 정족수 거절 증거로 쓰지 않음 |
| 백업·복원 — DB-003, OPS-005 | 일반 entrypoint의 암호화 전체 백업, 별도 DB/정지 chain 복원, 현재 Anchor 대조, 복원 후 통화·SQL 감사 기록 | 같은 호스트의 선택 경계. 독립 장애 영역·장기 부하·모든 crash 지점은 미검증 |
| 지속 운영 — OPS-004/006 | 소유 identity·DB/volume 보존, 감시·중단 latch·명시 재개 코드와 중단/재개 기록 | 24시간 승인 조건은 무기한 운영 허가가 아님. 기록 이후 현재 monitor/서비스 생존은 이 세션에서 확인하지 않음 |
| 전달·이전 — OPS-003/007 | 고정 Release/GHCR와 원격 수령 기록 보존 | 과거 이미지가 현재 main/backend/frontend와 같다고 추정하지 않음. AWS 실행·독립 reader는 후속 |

실행 근거는 `artifacts/persistent-idp-start-20261105.json`의 공개 인증/미디어 후속 항목, `artifacts/restore-audit-20261105.json`의 내부 통화/복원 후속, `artifacts/product-candidate-20261104.json`의 후보·직접 제공자 기록이다. 파일 이름이 과거 날짜여도 내부의 후속 항목과 source를 확인한다.

공개 인증 웹 소스 `80a6df1`, 공개 미디어 조사 웹 소스 `2d3d718`, 해당 API runtime 소스 `0a62aef`는 서로 다르다. 저장된 공개 미디어 조사는 서버 호스트의 브라우저가 공개 주소를 사용한 범위이며 독립 외부망의 두 단말 성공이 아니다. 과거 Release/GHCR의 source/digest도 현재 main과 같다고 추정하지 않는다.

## 4. 문서 수정 내역

| 문서 | 변경 내용 |
|---|---|
| `DESIGN.md` | 공개 관람 상태를 현황표로 연결; HTML 배치·디자인 원칙 유지 |
| `README.md` | 오래된 API 미연결 단정 제거; 검증 현황 중복을 단일 표로 연결 |
| `docs/FINALS-IMPLEMENTATION-PLAN.md` | 중복 현재 표 통합; 읽기 전용 리뷰·검증·통합 안내 기록 |
| `docs/KNOWN-LIMITATIONS.md` | 반복된 실행 이력을 기존 archive로 옮기고 구현 제약 유지 |
| `docs/LOCAL-VALIDATION.md` | 과거 후보와 당시 Vercel 정책을 날짜로 한정; 현재 경로는 RUNBOOK 참조 |
| `docs/MASTER-DEVELOPMENT-SPEC.md` | 날짜별 메모의 역할과 서버컴 우선/AWS 후속 구분; 요구 ID·완료 조건 보존 |
| `docs/README.md` | 문서 권위·과거 전달물·신규 감사와 리뷰 진입점 연결 |
| `docs/RUNBOOK.md` | 역할별 준비·조작 보완; HTTP rewrite/분석 relay/SIP/TURN 정정; 보존·중단·복구 절차 유지 |
| `docs/archive/DEVELOPMENT-HISTORY-20261104.md` | 기준 SHA의 기존 현황/한계/진행표 원문 append 보존 및 상대 링크 보정 |
| `docs/guide/02-ARCHITECTURE.md` | 과거 전달물을 현재 배포 기준으로 부르는 링크 문구 수정 |
| `docs/guide/04-TRUST-AND-SECURITY.md` | Anchor 분리 수명 구현을 별도 호스트 실행 성공과 구분 |
| `docs/guide/05-IMPLEMENTATION-STATUS.md` | 기준 SHA·날짜·단일 현황표; 공개 인증/미디어/AI/복원 소스 분리; OPS ID 정정 |
| `docs/guide/README.md` | 공개 인증과 내부 fixture 검증을 현황표로 연결 |

실행 상태의 기준은 `docs/guide/05-IMPLEMENTATION-STATUS.md`, 절차의 기준은 `docs/RUNBOOK.md`, 요구 ID·완료 조건은 `docs/MASTER-DEVELOPMENT-SPEC.md`다. 과거 현황 문장은 기존 `docs/archive/DEVELOPMENT-HISTORY-20261104.md`로 옮겨 실패·중단·판정의 원문을 보존했다.

## 5. 전체 Markdown 검토 목록

아래 43개는 두 문서 커밋의 검토 대상이다. 이 후속 인계서 자체는 당시 43개에 포함되지 않는다. 기존 감사와 동일한 문서는 보존 판정을 재사용하고 링크·시점 표현·관련 현재 설명을 대조했다. 모든 문서를 새로운 실환경 시험으로 검증했다는 뜻은 아니다. 원본 hash와 감사 대비 변경 여부는 `artifacts/document-review-20261106.json`에 보존했다.

| 파일 | 독자 | 용도 | 처리 |
|---|---|---|---|
| `AGENTS.md` | 개발자/검증 실행자 | 실행 제한·한정 승인 | 보존 |
| `DESIGN.md` | UI developers | Current demo layout and data/permission mapping | 수정 |
| `PRODUCT.md` | 제품/웹 개발자 | 제품·UX 기준 | 보존 |
| `README.md` | 첫 방문자 | 서비스·개발·배포 진입 | 수정 |
| `THIRD_PARTY_NOTICES.md` | 배포자/기여자 | 제3자 고지 | 보존 |
| `docs/ARCHITECTURE.md` | 개발자/보안 검토자 | 구성·키·데이터·신뢰 경계 | 보존 |
| `docs/DESIGN-QA.md` | 과거 시연 검토자 | 2026-09-14 설계/실행/화면/사실 확인 | 보존 |
| `docs/DESIGN-REFERENCES.md` | 웹 개발자 | 현재 패턴 선택·이전 참고 | 보존 |
| `docs/FACT-CHECK.md` | 과거 시연 검토자 | 2026-09-14 설계/실행/화면/사실 확인 | 보존 |
| `docs/FINALS-IMPLEMENTATION-PLAN.md` | 개발/인계 담당자 | 현재 진행·원본 증거 연결 | 수정 |
| `docs/KNOWN-LIMITATIONS.md` | 운영/검토자 | 현재 남은 제약 | 수정 |
| `docs/LOCAL-VALIDATION.md` | 로컬 검증 실행자 | 환경별 검증·자원·정리 | 수정 |
| `docs/MASTER-DEVELOPMENT-SPEC.md` | 개발자/검토자 | 요구 ID·완료 조건 | 수정 |
| `docs/PRODUCT.md` | 과거 시연 검토자 | 2026-09-14 설계/실행/화면/사실 확인 | 보존 |
| `docs/PROGRESS.md` | 과거 시연 검토자 | 2026-09-14 설계/실행/화면/사실 확인 | 보존 |
| `docs/PROTOCOL.md` | API/검증 모듈 개발자 | 데이터·서명 계약 | 보존 |
| `docs/README.md` | 문서 독자 | 기준 문서의 책임·탐색 | 수정 |
| `docs/RUNBOOK.md` | AWS 배포/운영자 | 수령·NEW·재개·복구 | 수정 |
| `docs/STANDARDS.md` | 프로토콜 검토자 | 채택 표준·적용 한계 | 보존 |
| `docs/TEST-RESULTS.md` | 과거 시연 검토자 | 2026-09-14 설계/실행/화면/사실 확인 | 보존 |
| `docs/THREAT-MODEL.md` | 보안/운영 검토자 | 공격자·신뢰 가정 | 보존 |
| `docs/WHY-BLOCKCHAIN.md` | 서비스/아키텍처 검토자 | 원장 선택의 가설·대안 | 보존 |
| `docs/adr/0001-foundation.md` | 설계 검토자 | 날짜가 있는 설계 결정 | 보존 |
| `docs/adr/0002-finals-offline.md` | 설계 검토자 | 날짜가 있는 설계 결정 | 보존 |
| `docs/archive/2026-10-26/FINALS-DEVELOPMENT-REPORT.md` | 이력 검토자 | 당시 개발·설계·검증 이력 | 보존 |
| `docs/archive/2026-10-26/FINALS-ROUND4.md` | 이력 검토자 | 당시 개발·설계·검증 이력 | 보존 |
| `docs/archive/DEVELOPMENT-HISTORY-20261104.md` | 이력 검토자 | 당시 개발·설계·검증 이력 | 수정 |
| `docs/guide/01-SERVICE-OVERVIEW.md` | 기관/상담원/고객 | 사용자·문제·흐름 | 보존 |
| `docs/guide/02-ARCHITECTURE.md` | 서비스/개발 독자 | 사용자 관점의 구성 설명 | 수정 |
| `docs/guide/03-CALL-FLOW.md` | 서비스/개발 독자 | 승인→소비→통화→회수 | 보존 |
| `docs/guide/04-TRUST-AND-SECURITY.md` | 서비스/보안 독자 | 신뢰·재사용 방지·정족수 | 수정 |
| `docs/guide/05-IMPLEMENTATION-STATUS.md` | 개발/운영/검토자 | 현재 코드/실행/fixture 상태 | 수정 |
| `docs/guide/README.md` | 서비스 이용/개발 독자 | 가이드 순서 | 수정 |
| `docs/mentoring/README.md` | 멘토링/개발 담당자 | 채택 결정과 후속 조건 | 보존 |
| `submission/REQUIREMENTS-CHECK.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |
| `submission/SELECTED-EVIDENCE.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |
| `submission/TEAM-INPUTS.md` | 제출 담당자 | 사용자 제공 팀 원본 | 보존 |
| `submission/application-ko.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |
| `submission/demo-3min.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |
| `submission/judge-qa.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |
| `submission/pitch-10min.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |
| `submission/pitch-8min.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |
| `submission/slides.md` | 제출 담당자 | 2026-09-14 제출/발표 원본 | 보존 |

## 6. 우선순위 구현 리뷰


P1은 공개 시연의 핵심 미완료 경계, P2는 잘못된 상태 표시나 실패 후 복귀 문제다. 아래 위치는 **기준 SHA의 줄 번호**다. 제품 코드·시험은 수정하거나 실행하지 않았으며, “코드상 확정”도 브라우저 재현 완료를 뜻하지 않는다.

### R1 · P1 · 공개 통화 완료 증거 없음 — 기존 개발 세션 소관

- **문제:** 공개 인증 성공을 공개 통화·회수·분석까지 성공한 것으로 제출할 수 없다.
- **근거:** [공개 조사 기록](artifacts/persistent-idp-start-20261105.json)의 `publicMediaInvestigation20261106`(468행 이후), `completeCalls: 0`; [통화 controller](apps/web/src/lib/serviceCall.ts)의 검증/lease/연결 단계(64~116행).
- **발생 조건:** 공개 주소를 사용하는 SIP/ICE 협상과 수락 후 실제 연결 검증. 원래 기록에는 ICE timeout과 수락 뒤 verification-unavailable이 각각 남아 있다.
- **사용자 영향:** 통화가 종료되거나 실제 양방향 음성 확인까지 도달하지 못한다. 후속 분석·회수의 공개 성공도 이 근거만으로 주장할 수 없다.
- **판정:** 미완료 실행은 확정. 단일 원인·현재 수정 후 재현 여부는 미확정. 상대 측 PBX_BINDING_CONTEXT_INVALID를 최초 원인으로 확정하지 않는다.
- **최소 수정안:** 새 구현을 중복하지 않고 기존 세션의 첫 오류 진단·수정 결과를 받아 현황표의 해당 행만 갱신한다.
- **필요 검증:** 기존 세션이 승인된 범위에서 같은 후보의 양방향 음성 디코딩과 종료/회수·분석을 각각 확인. 이 문서 세션에서 재현하지 않음.

### R2 · P2 · 수동 관리 조회 실패 뒤 이전 결과가 남음

- **문제:** ‘관리 상태 기술 상세’는 다음 조회가 실패해도 마지막 성공 JSON을 그대로 유지한다. 어떤 종류의 조회·언제의 결과인지 표시하지 않는다.
- **근거:** [ServiceManagement](apps/web/src/pages/Service.tsx) 105~112행의 `state`와 `setState(await api(...))`; 같은 파일 48행 `action`의 오류 처리. 별도 [ServiceAdministration](apps/web/src/components/ServiceAdministration.tsx) 9행은 실패 시 state를 지우므로 두 영역의 처리가 다르다.
- **발생 조건:** 관리 상태/작업/health 중 하나를 성공 조회한 뒤 다른 조회가 5xx·네트워크 오류로 실패하고, workspace 조회 자체는 정상인 경우.
- **사용자 영향:** 이전 활성 상태·노드/작업 결과를 새 조회의 결과로 오해할 수 있다. 서버 권한 우회가 확인된 것은 아니다.
- **판정:** 코드상 확정된 표시 결함. 실제 공개 브라우저 재현은 미실행.
- **최소 수정안:** 수동 조회 시작/실패 시 상세 결과를 비우거나 조회 종류·시각·실패 후 오래된 결과임을 명시한다. 기존 조회 상태 패턴을 재사용한다.
- **필요 검증:** 성공→다른 조회 실패의 작은 UI 회귀 1건. 전체 체인·PBX 재실행 불필요. Service.tsx가 개발 중이므로 통합 시 재확인.

### R3 · P2 · 관리 조회 불가를 ‘공동 변경 요청 없음’으로 표시

- **문제:** 관리 state가 아직 없거나 조회에 실패했을 때 빈 요청 안내가 표시된다.
- **근거:** [ConfigurationReviewPanel](apps/web/src/components/ConfigurationReviewPanel.tsx) 25행의 `!state?.configurationProposals.length`; [ServiceAdministration](apps/web/src/components/ServiceAdministration.tsx) 9행은 조회 실패 시 `setState(undefined)`를 호출한다.
- **발생 조건:** 최초 조회 대기 또는 `/v3/management`/jobs 조회 실패.
- **사용자 영향:** 실패 안내와 ‘공동 변경 요청이 없습니다’가 함께 보이며 실제 제안이 없는 것으로 오해할 수 있다. 서버의 제안/서명은 삭제되지 않는다.
- **판정:** 코드상 확정된 표시 결함.
- **최소 수정안:** state가 있고 성공 응답의 배열이 비었을 때만 빈 상태를 표시한다. 미조회/실패는 기존 조회 실패 안내를 사용한다.
- **필요 검증:** state undefined와 성공 empty 배열을 구분하는 컴포넌트 렌더 검사. 기존 `configuration-review` 시험을 확장하면 충분하다.

### R4 · P2 · 실패한 로그인 callback Promise가 모듈에 남음

- **문제:** callback 실패 시 모듈 변수 `loginCompletion`이 비워지지 않는다. 전체 reload 없이 ServicePage가 다시 mount되면 이전 rejected Promise를 다시 await하고 `refresh()`에 도달하지 못한다.
- **근거:** [ServicePage](apps/web/src/pages/Service.tsx) 25·41행. URL의 code/state는 먼저 제거하고, `loginCompletion=undefined`는 await 성공 뒤에만 실행한다. catch/clearLocal에는 초기화가 없다.
- **발생 조건:** callback 요청이 실패한 뒤 SPA 내 다른 화면에서 업무 화면으로 복귀. 전체 페이지 reload를 동반한 새 로그인은 모듈을 초기화하므로 영향 범위가 다르다.
- **사용자 영향:** 복귀한 화면에서 과거 로그인 오류가 반복되고 현재 세션 확인이 생략된다. 새 로그인 자체가 영구 차단된다는 주장은 아니다.
- **판정:** 코드상 캐시 잔류 확정. 해당 사용자 이동의 브라우저 재현은 추가 확인 필요.
- **최소 수정안:** 완료/실패한 자신과 같은 callback Promise만 정리해 동시 mount 중 중복 교환 방지는 유지한다.
- **필요 검증:** callback 1회 실패→unmount/remount→auth/me 재조회와 중복 mount 시 callback 1회만 교환하는 UI 회귀. 외부 IdP 호출 없이 mock 응답으로 충분하다.

## 7. 검증 결과와 미실행 범위

- 추적 Markdown **43개**, MDX **0개**의 로컬 링크·GitHub식 heading/명시 anchor **723개** 확인: 누락 **0개**.
- 문서의 명시 소스 경로와 package.json 명령 이름을 대조했다. `contracts/out`는 생성 산출물 또는 예시 경로로 구분하고 생성하지 않았다.
- `git diff --check` 통과. 최종 감사 JSON의 43개 문서 hash와 실제 파일이 일치했다.
- 제품 변경 없이 문서 13개와 감사 JSON만 두 커밋에 포함됐고 AGENTS는 변경되지 않았다.
- 실제 명령·light·브라우저·통합·통화·AI 시험은 실행하지 않았다. 외부 URL 89개의 가용성도 재확인하지 않았다.

이 수치는 원래 문서 정리 결과다. 현재 인계서 생성은 기존 결과를 한 파일로 묶는 작업이며 실행 증거를 추가하지 않는다.

### 마지막 main 대조

시작 SHA 이후 `1e6a090`까지 5개 커밋, 제품/시험 23개 파일이 바뀌었다. 종료 중 검증 차단, 영속 유한 분석 예산, 공유 복구 서명 계약·검토 화면, 통화 UI 축약을 관련 경계별로 다시 읽었다. 해당 구간의 Markdown·기존 공개 실행 증거는 변경되지 않았다.

R2·R3·R4는 마지막 대조 SHA에도 남았다. 종료 중 검증 경합은 `5d130df`에서 별도 수정됐으므로 신규 미해결 결함으로 보고하지 않았다. 새 복구 파일 UI와 분석 예산 설명만 보완했고 제품 파일을 문서 branch에 병합하지 않았다. 원격 fetch 없이 공유 로컬 main을 대조했으며 이후 변경은 통합 담당자가 확인한다.

## 8. 시연 준비에서 보완한 안내

1. 기관·상담원·수신자·승인자별 독립 브라우저 프로필과 보호 계정 자료를 준비한다. 업무에는 이메일 대신 ‘내 계정 식별자’의 내부 ID를 입력한다.
2. 기관 업무 생성 후 위임이 원장에 등록됐는지 확인한다. 상담원은 해당 업무의 새 시도를 만들고 개별 연락 승인을 받는다.
3. 양측이 같은 시도를 고르고 마이크/PBX 등록을 마친 뒤 발신·수락한다. 승인한 상담원 브라우저를 새로고침해 단기키를 잃으면 새 시도를 만든다.
4. 공개 HTTPS/API, 분석 relay의 인증 WSS, PBX의 SIP WSS, ICE/TURN 음성 경로를 각각 확인한다. HTTP 성공을 음성 성공으로 사용하지 않는다.
5. 분석은 별도 동의와 제공자 준비·남은 승인 예산이 필요하다. 소진된 smoke 한도를 코드 추가나 자격 보유만으로 늘리지 않는다.
6. 취소/정지·복구는 접수·서버 적용·원장/Witness·PBX 회수·새 연락을 구분해 확인한다. 관측 중단 후 자동 재시작하거나 원본 latch·영속 자료를 지우지 않는다.

정확한 운영 명령·입력·보존 조건은 기존 RUNBOOK을 유지한다. 이 인계서는 서비스 기동이나 새로운 실행의 허가가 아니다.

## 9. 기존 개발 세션에 전달할 통합 안내

> `docs/submission-review-20261106` branch의 문서 커밋 `09af92b`, `f0f4e4a`를 순서대로 검토해 통합해 주세요. 제품 코드는 수정하지 않았습니다. 공개 로그인/API 미연결 설명을 정정하고 실행 상태를 현황표로 모았습니다. 공개 통화·분석·회수·복구의 최신 결과는 해당 표의 source와 근거만 갱신해 주세요. R1은 기존 진행 작업이며 R2~R4는 최신 소스에서 해결 여부를 먼저 확인해 주세요. 원본 checkout에 파일 전체를 덮어쓰지 말고 현재 수정과 diff 단위로 통합해 주세요.

문서 branch에서 main 병합·push·PR·배포는 하지 않았다. 검증한 문서의 최종 main 반영은 기존 개발 세션이 담당한다. 이 인계서까지 보존하려면 후속 인계 문서 커밋을 함께 검토한다.

### 충돌 가능성이 있는 문서

| 우선도 | 문서 | 통합 시 확인할 내용 |
|---|---|---|
| 높음 | `docs/RUNBOOK.md` | 원본에서 이미 수정 중. 실제 기동/재시작·예산·보존 조건과 문서 경로 정정을 함께 보존 |
| 높음 | `docs/FINALS-IMPLEMENTATION-PLAN.md` | 다른 세션의 날짜별 실행 기록과 이번 리뷰를 모두 보존 |
| 높음 | `docs/guide/05-IMPLEMENTATION-STATUS.md` | 새 실행 증거의 source·범위를 대조한 뒤 상태 갱신 |
| 높음 | `docs/KNOWN-LIMITATIONS.md` | 해결된 제약과 아직 미확정인 실패를 구분 |
| 중간 | `README.md`, `docs/README.md`, `DESIGN.md` | 공개 모드·서비스 소개·디자인 설명과 충돌 가능. HTML 원본은 변경하지 않음 |
| 낮음 | `docs/archive/DEVELOPMENT-HISTORY-20261104.md` | 기존 원문 유지, 이번 append 부분만 통합 |

AGENTS의 긴 과거 예외를 분리하는 방안은 제안만 남겼다. 사용자 지시·실행 권한·보존 조건은 임의 변경하지 않는다.
