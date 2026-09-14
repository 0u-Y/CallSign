# Design QA

검수일: 2026-09-14 · Playwright Chromium 153 · Linux amd64

| 화면 | 390×844 | 768×1024 | 1440×900 | 검토와 수정 |
|---|---|---|---|---|
| 랜딩 | PASS | PASS | PASS | 핵심 CTA가 첫 화면에 있고 가로 스크롤 없음. 모바일에서 1열, 데스크톱에서 설명/검증 경로 2열. |
| 데모 시작·연락 흐름 | PASS 후 수정 | PASS | PASS | 첫 모바일 캡처에서 장면 rail 4번째 항목이 잘려 보여 2×2 grid로 변경. 기관→위탁 발신자→수신자→공식 업무 4단계를 결과보다 먼저 배치하고, 복사 공격은 `여기서 차단` 지점을 단계 안에 표시. |
| 수신 전화 | PASS | PASS | PASS | 설정을 전화 밖에 두고 44px 이상 버튼, 색+아이콘+상태 텍스트 사용. |
| LIVE 연결 확인 | PASS(1280) | — | PASS(1280) | 실제 witness 수와 Chromium 관측 프로파일, 수락 전 0 audio bytes가 화면에 표시됨. |
| LIVE 권한 취소 | PASS(1280) | — | PASS(1280) | 적색 배지와 `DELEGATION_NOT_ACTIVE`, 통화 유지 정책을 텍스트로 표시. |
| 공동 정지·복구 | PASS | — | PASS | 실제 Besu 정지·복구 뒤 Active/epoch, 승인자별 서명, transaction을 텍스트로 표시. 390px에서 버튼 1열·hash 줄바꿈·가로 overflow 없음. |
| 검증 근거 | — | — | PASS | API가 실제 4/4 node, 동일 block, 4/4 witness를 관측한 화면을 캡처. 저장 결과와 실시간 준비 상태를 구분. |
| Vercel 공개 preview | PASS | — | PASS | 공개 범위 배너, UI PREVIEW/RECORDED 표기, 모바일 탐색 2개, 깊은 링크를 확인. 390px에서 `scrollWidth=viewportWidth=390`, 콘솔 오류 0건. |

실행 증거는 `artifacts/screenshots/`의 PNG와 `artifacts/playwright-results.json`이다. 레이아웃 테스트 390/768/1440에서 `/`, `/demo`, `/receiver`의 `scrollWidth-clientWidth <= 1`을 확인했고, 공동 복구 완료 화면도 390px에서 같은 검사를 수행했다. 실제 캡처를 모두 열어 서체 대체, 겹침, 잘림, 상태 구분을 검토했다. 수신 화면의 위험 안내는 전화 인증 카드와 분리된 호박색 패널이며, 분석 전·규칙 분석·오류 상태를 텍스트로 구분한다.

사용자 피드백으로 `/demo`에서 역할별 흐름이 보이지 않는 문제를 재검토했다. `demo-flow-1440.png`와 `demo-flow-copy-390.png`를 직접 열어 정상 연락의 `확인됨 → 확인됨 → 확인됨 → 별도 권한`, 복사 공격의 `확인됨 → 여기서 차단 → 여기서 차단 → 별도 권한`이 색상뿐 아니라 텍스트·아이콘으로 구분되는지 확인했다. 모바일 측정값은 `scrollWidth=viewportWidth=390`, 브라우저 콘솔 오류 0건이다. 이 결과를 고정하는 Playwright 시험을 추가해 5/5 PASS했다.

`artifacts/demo-video/CallSign-live-demo.webm`을 다시 녹화하고 1·8·12·16·18·23·28초 프레임을 직접 확인했다. 16초에는 실제 연결 확인, 28초에는 원장 위임 취소 뒤 인증 철회와 통화 유지가 보인다. 이 파일은 자동 시험의 약 30초 원본 증거이며 제출용 3분 내레이션 영상은 아니다.

키보드 기본 focus는 native button/link와 Radix dialog가 제공하고, `:focus-visible` outline을 공통 적용했다. 모든 주요 버튼은 최소 44px다. loading/error/empty 상태는 각 운영 화면과 상태 카드에 있다. Chromium page scale 200%에서 핵심 CTA를 키보드로 focus하고 실행하는 자동 시험이 PASS했다.

Vercel 프로덕션 `https://callsign-rouge.vercel.app`을 익명 Chromium으로 다시 열었다. `/demo`의 네 장면은 각각 `APPROVAL_VERIFIED`, `REJECTED`, `REJECTED`, `APPROVAL_VERIFIED`를 verifier 결과로 표시했고 콘솔 오류는 없었다. `/receiver` 등 로컬 전용 route는 공개 환경에서 `/demo`로 이동한다. 캡처는 `artifacts/screenshots/vercel-production-demo-1440.png`, `artifacts/screenshots/vercel-production-evidence-390.png`이다.
