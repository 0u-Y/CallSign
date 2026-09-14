import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("two authenticated browser peers bind approval, DTLS certificate, datachannel, and post-accept audio", async ({ browser }) => {
  const runStartedAt = new Date().toISOString();
  const connectStartedAt = Date.now();
  const receiverContext = await browser.newContext();
  const gatewayContext = await browser.newContext();
  const institutionContext = await browser.newContext();
  const receiver = await receiverContext.newPage();
  const gateway = await gatewayContext.newPage();
  const institution = await institutionContext.newPage();

  await receiver.goto("/receiver");
  await receiver.getByRole("button", { name: "테스트 세션 준비", exact: true }).click();
  await expect(receiver.getByText("수신 세션과 인증된 signaling 연결이 준비됐습니다.")).toBeVisible();

  await gateway.goto("/gateway");
  await gateway.getByRole("button", { name: "브라우저 키 등록" }).click();
  await expect(gateway.getByTestId("gateway-transport")).toContainText("signaling 준비");

  await institution.goto("/institution");
  await institution.getByRole("button", { name: "기관 세션 준비" }).click();
  await expect(institution.getByText("업무와 등록된 위탁 키를 확인했습니다.")).toBeVisible();
  await institution.getByRole("button", { name: "연락 승인 발급" }).first().click();
  await expect(institution.getByText(/개별 연락 승인서 .*를 발급했습니다/)).toBeVisible();

  await gateway.getByRole("button", { name: "승인 목록 새로고침" }).click();
  await expect(gateway.getByRole("button", { name: "승인 통화 시작" }).first()).toBeVisible();
  await gateway.getByRole("button", { name: "승인 통화 시작" }).first().click();

  await expect(receiver.getByTestId("transport-profile")).toContainText("chromium-dtls-certificate-v1", { timeout: 20_000 });
  await expect(receiver.getByText("승인 상담 연결 확인")).toBeVisible();
  await expect(receiver.getByText(/witness [34]개와 현재 전송을 확인했습니다/)).toBeVisible();
  await receiver.getByRole("button", { name: "위험 요구 분석" }).click();
  await expect(receiver.getByTestId("risk-result")).toContainText("규칙 기반 분석");
  await expect(receiver.getByTestId("risk-result")).toContainText("인증번호 요구");
  await expect(receiver.getByTestId("risk-result")).toContainText("원격제어 설치");
  const connectedAt = Date.now();
  await receiver.screenshot({ path: "artifacts/screenshots/receiver-connected-live.png", fullPage: true });
  await expect.poll(async () => Number(await receiver.getByTestId("transport-profile").getAttribute("data-audio-bytes"))).toBe(0);
  await receiver.getByRole("button", { name: "전화 받기" }).click();
  await expect.poll(async () => Number(await receiver.getByTestId("transport-profile").getAttribute("data-audio-bytes"))).toBeGreaterThan(0);
  const audioBytesAfterAccept = Number(await receiver.getByTestId("transport-profile").getAttribute("data-audio-bytes"));
  await expect(gateway.getByTestId("gateway-transport")).toContainText("생성 음원 전송 중");

  const revokeRequestedAt = Date.now();
  await institution.getByRole("button", { name: "원장 위임 취소" }).first().click();
  await expect(institution.getByText(/위임 취소가 원장에 확정됐습니다/)).toBeVisible({ timeout: 15_000 });
  await expect(receiver.getByText("인증 조건 불충족")).toBeVisible({ timeout: 10_000 });
  await expect(receiver.getByText(/통화 연결은 강제로 끊지 않습니다/)).toBeVisible();
  const withdrawnAt = Date.now();
  await receiver.screenshot({ path: "artifacts/screenshots/receiver-revoked-live.png", fullPage: true });

  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/webrtc-run.json", `${JSON.stringify({
    checkedAt: new Date().toISOString(), runStartedAt,
    profile: "chromium-dtls-certificate-v1",
    browserContexts: 3,
    connectionVerificationMs: connectedAt - connectStartedAt,
    audioBytesBeforeAccept: 0,
    audioBytesAfterAccept,
    revocationDisplayWithdrawalMs: withdrawnAt - revokeRequestedAt,
    callPreservedAfterWithdrawal: true,
  }, null, 2)}\n`);

  await Promise.all([receiverContext.close(), gatewayContext.close(), institutionContext.close()]);
});
