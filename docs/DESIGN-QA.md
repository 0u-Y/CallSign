# Design QA

검수일: 2026-09-14 · Playwright Chromium 153 · Linux amd64

| 화면 | 390×844 | 768×1024 | 1440×900 | 검토와 수정 |
|---|---|---|---|---|
| 랜딩 | PASS | PASS | PASS | 핵심 CTA가 첫 화면에 있고 가로 스크롤 없음. 모바일에서 1열, 데스크톱에서 설명/검증 경로 2열. |
| 발표 데모 | PASS 후 재설계 | PASS | PASS | 단일 버튼 즉시 결과가 발표 흐름을 보여주지 못한다는 피드백 뒤 전면 재설계. 기관·위탁센터·수신자·공동 운영과 사건 stream을 동시에 배치하고 장면별 2–5개 실제 단계를 발표자가 진행. 1440×900에서 다음 단계 CTA까지 첫 viewport에 접근 가능. |
| 수신 전화 | PASS | PASS | PASS | 설정을 전화 밖에 두고 44px 이상 버튼, 색+아이콘+상태 텍스트 사용. |
| LIVE 연결 확인 | PASS(1280) | — | PASS(1280) | 실제 witness 수와 Chromium 관측 프로파일, 수락 전 0 audio bytes가 화면에 표시됨. |
| LIVE 권한 취소 | PASS(1280) | — | PASS(1280) | 적색 배지와 `DELEGATION_NOT_ACTIVE`, 통화 유지 정책을 텍스트로 표시. |
| 공동 정지·복구 | PASS | — | PASS | 실제 Besu 정지·복구 뒤 Active/epoch, 승인자별 서명, transaction을 텍스트로 표시. 390px에서 버튼 1열·hash 줄바꿈·가로 overflow 없음. |
| 검증 근거 | — | — | PASS | API가 실제 4/4 node, 동일 block, 4/4 witness를 관측한 화면을 캡처. 저장 결과와 실시간 준비 상태를 구분. |
| Vercel 공개 preview | PASS | — | PASS | 공개 범위 배너, UI PREVIEW/RECORDED 표기, 모바일 탐색 2개, 깊은 링크를 확인. 390px에서 `scrollWidth=viewportWidth=390`, 콘솔 오류 0건. |

실행 증거는 `artifacts/screenshots/`의 PNG와 `artifacts/playwright-results.json`이다. 레이아웃 테스트 390/768/1440에서 `/`, `/demo`, `/receiver`의 `scrollWidth-clientWidth <= 1`을 확인했고, 공동 복구 완료 화면도 390px에서 같은 검사를 수행했다. 실제 캡처를 모두 열어 서체 대체, 겹침, 잘림, 상태 구분을 검토했다. 수신 화면의 위험 안내는 전화 인증 카드와 분리된 호박색 패널이며, 분석 전·규칙 분석·오류 상태를 텍스트로 구분한다.

사용자 피드백으로 `/demo`를 다중 단계 콘솔에서 버튼 하나로 연속 실행되는 신호 흐름 화면으로 다시 교체했다. `presentation-demo-1440x900.png`에서는 기관 → 개별 승인서 → 위탁센터 → WebRTC → 수신자 → 공식 업무의 수평 경로, 아래 공동 인증망, 사칭 증명의 `RECIPIENT_MISMATCH` 차단 지점을 동시에 확인했다. `presentation-flow-390x844.png`에서는 같은 경로가 세로로 이어지고 주요 시작 버튼이 첫 화면에 노출되는지 검토했다. 데스크톱·모바일 모두 `scrollWidth=viewportWidth`, 브라우저 콘솔 오류 0건이다. witness는 실제 임계값과 맞게 W1–W3만 서명 상태, W4는 대기 상태로 표시한다.

추가 피드백에서 상단 1–4가 하나의 업무 절차처럼 읽히는 문제를 확인했다. 이를 `4개 독립 시나리오` 개요로 명명하고 “한 업무의 4단계가 아님”을 직접 설명했다. 각 항목은 `시나리오 N`·상황·예상 결과·대기/진행 중/완료를 함께 표시하며, 완료 뒤에도 번호 1–4를 유지한다. 내부의 14개 동작은 버튼에서 `검증 N/14`로만 표시해 시나리오 수와 분리했다. 기본 자동 재생은 발표자가 설명할 수 있는 약 50초, 자동 시험과 개발 확인은 약 15초로 분리했다. 1440×900에서 전체 신호도까지 한 viewport에 보이고, 390×844에서는 시나리오가 2×2로 배치되며 가로 넘침이 없음을 실제 캡처로 확인했다.

`artifacts/demo-video/CallSign-live-demo.webm`을 다시 녹화하고 1·8·12·16·18·23·28초 프레임을 직접 확인했다. 16초에는 실제 연결 확인, 28초에는 원장 위임 취소 뒤 인증 철회와 통화 유지가 보인다. 이 파일은 자동 시험의 약 30초 원본 증거이며 제출용 3분 내레이션 영상은 아니다.

키보드 기본 focus는 native button/link와 Radix dialog가 제공하고, `:focus-visible` outline을 공통 적용했다. 모든 주요 버튼은 최소 44px다. loading/error/empty 상태는 각 운영 화면과 상태 카드에 있다. Chromium page scale 200%에서 핵심 CTA를 키보드로 focus하고 실행하는 자동 시험이 PASS했다.

Vercel 프로덕션 `https://callsign-rouge.vercel.app`을 익명 Chromium으로 다시 열었다. `/demo`의 네 장면은 각각 `APPROVAL_VERIFIED`, `REJECTED`, `REJECTED`, `APPROVAL_VERIFIED`를 verifier 결과로 표시했고 콘솔 오류는 없었다. `/receiver` 등 로컬 전용 route는 공개 환경에서 `/demo`로 이동한다. 캡처는 `artifacts/screenshots/vercel-production-demo-1440.png`, `artifacts/screenshots/vercel-production-evidence-390.png`이다.
