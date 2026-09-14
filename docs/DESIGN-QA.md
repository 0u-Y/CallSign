# Design QA

검수일: 2026-09-14 · Playwright Chromium 153 · Linux amd64

| 화면 | 390×844 | 768×1024 | 1440×900 | 검토와 수정 |
|---|---|---|---|---|
| 랜딩 | PASS | PASS | PASS | 핵심 CTA가 첫 화면에 있고 가로 스크롤 없음. 모바일에서 1열, 데스크톱에서 설명/검증 경로 2열. |
| 데모 시작 | PASS 후 수정 | PASS | PASS | 첫 모바일 캡처에서 장면 rail 4번째 항목이 잘려 보여 2×2 grid로 변경. 실행 CTA와 이유 panel 유지. |
| 수신 전화 | PASS | PASS | PASS | 설정을 전화 밖에 두고 44px 이상 버튼, 색+아이콘+상태 텍스트 사용. |
| LIVE 연결 확인 | PASS(1280) | — | PASS(1280) | 실제 witness 수와 Chromium 관측 프로파일, 수락 전 0 audio bytes가 화면에 표시됨. |
| LIVE 권한 취소 | PASS(1280) | — | PASS(1280) | 적색 배지와 `DELEGATION_NOT_ACTIVE`, 통화 유지 정책을 텍스트로 표시. |
| 검증 근거 | — | — | PASS | API가 실제 4/4 node, 동일 block, 4/4 witness를 관측한 화면을 캡처. 저장 결과와 실시간 준비 상태를 구분. |

실행 증거는 `artifacts/screenshots/`의 12개 PNG와 `artifacts/playwright-results.json`이다. 레이아웃 테스트 390/768/1440에서 `/`, `/demo`, `/receiver`의 `scrollWidth-clientWidth <= 1`을 확인했다. 실제 캡처를 모두 열어 서체 대체, 겹침, 잘림, 상태 구분을 검토했다. 수신 화면의 위험 안내는 전화 인증 카드와 분리된 호박색 패널이며, 분석 전·규칙 분석·오류 상태를 텍스트로 구분한다.

`artifacts/demo-video/CallSign-live-demo.webm`을 다시 녹화하고 1·8·12·16·18·23·28초 프레임을 직접 확인했다. 16초에는 실제 연결 확인, 28초에는 원장 위임 취소 뒤 인증 철회와 통화 유지가 보인다. 이 파일은 자동 시험의 약 30초 원본 증거이며 제출용 3분 내레이션 영상은 아니다.

키보드 기본 focus는 native button/link와 Radix dialog가 제공하고, `:focus-visible` outline을 공통 적용했다. 모든 주요 버튼은 최소 44px다. loading/error/empty 상태는 각 운영 화면과 상태 카드에 있다. Chromium page scale 200%에서 핵심 CTA를 키보드로 focus하고 실행하는 자동 시험이 PASS했다.
