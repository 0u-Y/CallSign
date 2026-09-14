# Test results

생성 시각: 2026-09-14T13:59:09.318Z

요약: PASS 12 · FAIL 0 · BLOCKED 0 · NOT-RUN 3

| 항목 | 상태 | 실행 명령 | 관측 | 증거 |
|---|---|---|---|---|
| Solidity 권한·epoch 상태 기계 | PASS | `pnpm test:contracts` | 5건 통과, 실패 0 | `artifacts/foundry-results.log` |
| JCS/Ed25519 및 3-of-4 verifier | PASS | `pnpm test` | 20건 통과, 0건 실패 | `artifacts/vitest-results.json` |
| PostgreSQL consume·인증 권한 통합 | PASS | `pnpm test:integration` | 10건 통과, 0건 실패 | `artifacts/integration-results.json` |
| Besu QBFT 4노드 동일 상태·계약 코드 | PASS | `tsx scripts/check-ledger.ts` | 4노드 공통 높이 6912, registry 10878 bytes (동일 block/hash/code 관측; 네이티브 light-client 증명 아님) | `artifacts/ledger-readiness.json` |
| witness 임계값 장애 | PASS | `pnpm test:witness-failover` | 1개 중단 3서명, 2개 중단 HTTP 503 | `artifacts/witness-failover.json` |
| 두 브라우저 WebRTC 전송 결합·원장 취소 | PASS | `pnpm test:e2e` | chromium-dtls-certificate-v1, 수락 전 0B/후 4564B, 취소 표시 6669ms | `artifacts/webrtc-run.json` |
| 반응형·주요 제품 브라우저 시험 | PASS | `pnpm test:e2e` | 12건 통과, 0건 실패, 86275ms | `artifacts/playwright-results.json` |
| 대표 화면 다중 viewport 캡처·육안 검수 | PASS | `pnpm test:e2e` | 21개 PNG, 390/768/1440 overflow와 200% keyboard 접근 PASS | `artifacts/screenshots/` |
| PPTX 원본과 11쪽 제출 PDF 렌더 검수 | PASS | `pnpm submission:build` | PPTX/PDF 존재, 렌더 11/11쪽 | `submission/rendered-pages/` |
| 캐시 상태 verifier p95 | PASS | `pnpm test:benchmark` | n=100, p95=1.72ms, 목표 ≤500ms (네트워크 왕복 제외) | `artifacts/verifier-benchmark.json` |
| monotonic deadline 이후 표시 철회 J≤1초 | NOT-RUN | `해당 없음` | deadline 계산 단위 테스트는 PASS이나 UI timer jitter의 반복 표본 측정은 미실행 | `docs/KNOWN-LIMITATIONS.md` |
| 공동 복구 UI의 실제 EIP-712 트랜잭션 | PASS | `pnpm test:e2e` | qbft-live-eip712-recovery-v1, 승인자 2명, epoch 15→16→17 (관리자·정지키 교체; 승인용 Ed25519 키는 데모에서 유지) | `artifacts/governance-run.json` |
| 규칙 fallback·Ollama adapter | PASS | `pnpm test` | 규칙 탐지·prompt injection·없는 evidenceSpan·비로컬 endpoint 거절 시험 (인증 결과와 독립) | `artifacts/vitest-results.json` |
| 로컬 Ollama 실제 모델 실행 | NOT-RUN | `해당 없음` | 모델을 자동 다운로드하지 않았으며 이번 환경에 선택 모델을 설정하지 않음 | `docs/KNOWN-LIMITATIONS.md` |
| QBFT header + EIP-1186 네이티브 증명 | NOT-RUN | `해당 없음` | P2 미구현; P0은 별도 witness 신뢰 프로파일 | `docs/KNOWN-LIMITATIONS.md` |

## 해석

PASS는 위 증거 파일이 존재하고 이번 환경의 실제 실행값을 만족한 항목만 뜻한다. witness 프로파일은 QBFT 합의 증명이 아니며, BLOCKED/NOT-RUN 항목은 제품 주장에 포함하지 않는다.
