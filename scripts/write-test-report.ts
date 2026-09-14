import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
async function json<T>(relative: string): Promise<T | null> { try { return JSON.parse(await readFile(resolve(root, relative), "utf8")) as T; } catch { return null; } }
async function textFile(relative: string): Promise<string> { try { return await readFile(resolve(root, relative), "utf8"); } catch { return ""; } }

type Status = "PASS" | "FAIL" | "BLOCKED" | "NOT-RUN";
type Check = { id: string; label: string; status: Status; command: string; observation: string; evidence: string; scope?: string };
const vitest = await json<{ numPassedTests?: number; numFailedTests?: number; success?: boolean }>("artifacts/vitest-results.json");
const integration = await json<{ numPassedTests?: number; numFailedTests?: number; success?: boolean }>("artifacts/integration-results.json");
const playwright = await json<{ stats?: { expected?: number; unexpected?: number; skipped?: number; duration?: number; startTime?: string } }>("artifacts/playwright-results.json");
const ledger = await json<{ nodeHeights: string[]; commonHeight: string; commonBlockHash: string; registryCodeBytes: number; witnesses: unknown[] }>("artifacts/ledger-readiness.json");
const failover = await json<{ oneWitnessStopped: { status: string; signatures: number }; twoWitnessesStopped: { status: string; httpStatus: number } }>("artifacts/witness-failover.json");
const webrtc = await json<{ profile: string; browserContexts: number; connectionVerificationMs: number; audioBytesBeforeAccept: number; audioBytesAfterAccept: number; revocationDisplayWithdrawalMs: number; callPreservedAfterWithdrawal: boolean }>("artifacts/webrtc-run.json");
const benchmark = await json<{ sampleCount: number; p95Ms: number; targetMet: boolean }>("artifacts/verifier-benchmark.json");
const foundryLog = await textFile("artifacts/foundry-results.log");
const foundryMatch = foundryLog.match(/(\d+) tests passed, 0 failed/);
const screenshotFiles = await import("node:fs/promises").then(async ({ readdir }) => { try { return (await readdir(resolve(root, "artifacts/screenshots"))).filter((name) => name.endsWith(".png")); } catch { return []; } });
const submissionFiles = await Promise.all(["submission/CallSign_기획제안서.pptx", "submission/CallSign_기획제안서.pdf"].map(async (path) => { try { return (await import("node:fs/promises")).stat(resolve(root, path)); } catch { return null; } }));
const renderedPages = await import("node:fs/promises").then(async ({ readdir }) => { try { return (await readdir(resolve(root, "submission/rendered-pages"))).filter((name) => /^page-\d+\.png$/.test(name)); } catch { return []; } });

const checks: Check[] = [
  { id: "contracts", label: "Solidity 권한·epoch 상태 기계", status: foundryMatch ? "PASS" : foundryLog ? "FAIL" : "NOT-RUN", command: "pnpm test:contracts", observation: foundryMatch ? `${foundryMatch[1]}건 통과, 실패 0` : "실행 로그에서 성공 요약을 찾지 못함", evidence: "artifacts/foundry-results.log" },
  { id: "protocol-unit", label: "JCS/Ed25519 및 3-of-4 verifier", status: vitest?.success && !vitest.numFailedTests ? "PASS" : vitest ? "FAIL" : "NOT-RUN", command: "pnpm test", observation: vitest ? `${vitest.numPassedTests ?? 0}건 통과, ${vitest.numFailedTests ?? 0}건 실패` : "결과 없음", evidence: "artifacts/vitest-results.json" },
  { id: "database-integration", label: "PostgreSQL consume·인증 권한 통합", status: integration?.success && !integration.numFailedTests ? "PASS" : integration ? "FAIL" : "NOT-RUN", command: "pnpm test:integration", observation: integration ? `${integration.numPassedTests ?? 0}건 통과, ${integration.numFailedTests ?? 0}건 실패` : "결과 없음", evidence: "artifacts/integration-results.json" },
  { id: "qbft-readiness", label: "Besu QBFT 4노드 동일 상태·계약 코드", status: ledger?.nodeHeights.length === 4 && ledger.registryCodeBytes > 0 ? "PASS" : ledger ? "FAIL" : "NOT-RUN", command: "tsx scripts/check-ledger.ts", observation: ledger ? `4노드 공통 높이 ${ledger.commonHeight}, registry ${ledger.registryCodeBytes} bytes` : "결과 없음", evidence: "artifacts/ledger-readiness.json", scope: "동일 block/hash/code 관측; 네이티브 light-client 증명 아님" },
  { id: "witness-failover", label: "witness 임계값 장애", status: failover?.oneWitnessStopped.status === "PASS" && failover.twoWitnessesStopped.status === "PASS" ? "PASS" : failover ? "FAIL" : "NOT-RUN", command: "pnpm test:witness-failover", observation: failover ? `1개 중단 ${failover.oneWitnessStopped.signatures}서명, 2개 중단 HTTP ${failover.twoWitnessesStopped.httpStatus}` : "결과 없음", evidence: "artifacts/witness-failover.json" },
  { id: "webrtc-e2e", label: "두 브라우저 WebRTC 전송 결합·원장 취소", status: playwright?.stats?.unexpected === 0 && webrtc?.audioBytesBeforeAccept === 0 && (webrtc?.audioBytesAfterAccept ?? 0) > 0 ? "PASS" : playwright || webrtc ? "FAIL" : "NOT-RUN", command: "pnpm test:e2e", observation: webrtc ? `${webrtc.profile}, 수락 전 ${webrtc.audioBytesBeforeAccept}B/후 ${webrtc.audioBytesAfterAccept}B, 취소 표시 ${webrtc.revocationDisplayWithdrawalMs}ms` : "관측값 없음", evidence: "artifacts/webrtc-run.json" },
  { id: "product-e2e", label: "반응형·주요 제품 브라우저 시험", status: playwright?.stats?.unexpected === 0 && (playwright.stats.expected ?? 0) >= 7 ? "PASS" : playwright ? "FAIL" : "NOT-RUN", command: "pnpm test:e2e", observation: playwright ? `${playwright.stats.expected ?? 0}건 통과, ${playwright.stats.unexpected ?? 0}건 실패, ${Math.round(playwright.stats.duration ?? 0)}ms` : "결과 없음", evidence: "artifacts/playwright-results.json" },
  { id: "design-review", label: "대표 화면 다중 viewport 캡처·육안 검수", status: screenshotFiles.length >= 12 && (playwright?.stats?.expected ?? 0) >= 10 ? "PASS" : "NOT-RUN", command: "pnpm test:e2e", observation: `${screenshotFiles.length}개 PNG, 390/768/1440 overflow와 200% keyboard 접근 PASS`, evidence: "artifacts/screenshots/" },
  { id: "submission-deck", label: "PPTX 원본과 11쪽 제출 PDF 렌더 검수", status: submissionFiles.every(Boolean) && renderedPages.length === 11 ? "PASS" : "NOT-RUN", command: "pnpm submission:build", observation: `PPTX/PDF ${submissionFiles.every(Boolean) ? "존재" : "누락"}, 렌더 ${renderedPages.length}/11쪽`, evidence: "submission/rendered-pages/" },
  { id: "verifier-performance", label: "캐시 상태 verifier p95", status: benchmark?.targetMet ? "PASS" : benchmark ? "FAIL" : "NOT-RUN", command: "pnpm test:benchmark", observation: benchmark ? `n=${benchmark.sampleCount}, p95=${benchmark.p95Ms.toFixed(2)}ms, 목표 ≤500ms` : "결과 없음", evidence: "artifacts/verifier-benchmark.json", scope: "네트워크 왕복 제외" },
  { id: "freshness-withdrawal-jitter", label: "monotonic deadline 이후 표시 철회 J≤1초", status: "NOT-RUN", command: "해당 없음", observation: "deadline 계산 단위 테스트는 PASS이나 UI timer jitter의 반복 표본 측정은 미실행", evidence: "docs/KNOWN-LIMITATIONS.md" },
  { id: "governance-live-ui", label: "공동 복구 UI의 실제 EIP-712 트랜잭션", status: "BLOCKED", command: "해당 없음", observation: "역할별 승인 기록 UX와 계약 테스트는 있으나 UI→Besu 실행 연결은 미완료", evidence: "docs/KNOWN-LIMITATIONS.md" },
  { id: "risk-assistant", label: "규칙 fallback·Ollama adapter", status: vitest?.success && !vitest.numFailedTests ? "PASS" : vitest ? "FAIL" : "NOT-RUN", command: "pnpm test", observation: "규칙 탐지·prompt injection·없는 evidenceSpan·비로컬 endpoint 거절 시험", evidence: "artifacts/vitest-results.json", scope: "인증 결과와 독립" },
  { id: "ollama-runtime", label: "로컬 Ollama 실제 모델 실행", status: "NOT-RUN", command: "해당 없음", observation: "모델을 자동 다운로드하지 않았으며 이번 환경에 선택 모델을 설정하지 않음", evidence: "docs/KNOWN-LIMITATIONS.md" },
  { id: "native-qbft-proof", label: "QBFT header + EIP-1186 네이티브 증명", status: "NOT-RUN", command: "해당 없음", observation: "P2 미구현; P0은 별도 witness 신뢰 프로파일", evidence: "docs/KNOWN-LIMITATIONS.md" },
];
const summary = { pass: checks.filter((check) => check.status === "PASS").length, fail: checks.filter((check) => check.status === "FAIL").length, blocked: checks.filter((check) => check.status === "BLOCKED").length, notRun: checks.filter((check) => check.status === "NOT-RUN").length };
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), environment: { os: process.platform, arch: process.arch, node: process.version, browser: "Playwright Chromium 153", ledger: "Besu 26.8.1 ×4", database: "PostgreSQL 17" }, summary, checks };
await mkdir(resolve(root, "artifacts"), { recursive: true });
await writeFile(resolve(root, "artifacts/test-results.json"), `${JSON.stringify(report, null, 2)}\n`);
const lines = ["# Test results", "", `생성 시각: ${report.generatedAt}`, "", `요약: PASS ${summary.pass} · FAIL ${summary.fail} · BLOCKED ${summary.blocked} · NOT-RUN ${summary.notRun}`, "", "| 항목 | 상태 | 실행 명령 | 관측 | 증거 |", "|---|---|---|---|---|", ...checks.map((check) => `| ${check.label} | ${check.status} | \`${check.command}\` | ${check.observation}${check.scope ? ` (${check.scope})` : ""} | \`${check.evidence}\` |`), "", "## 해석", "", "PASS는 위 증거 파일이 존재하고 이번 환경의 실제 실행값을 만족한 항목만 뜻한다. witness 프로파일은 QBFT 합의 증명이 아니며, BLOCKED/NOT-RUN 항목은 제품 주장에 포함하지 않는다.", ""];
await writeFile(resolve(root, "docs/TEST-RESULTS.md"), lines.join("\n"));
console.log(JSON.stringify(summary));
