import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("record a local, factual live-call demo asset", async ({ browser }) => {
  await mkdir("artifacts/demo-video", { recursive: true });
  const receiverContext = await browser.newContext({ recordVideo: { dir: "artifacts/demo-video", size: { width: 1280, height: 720 } }, viewport: { width: 1280, height: 720 } });
  const gatewayContext = await browser.newContext();
  const institutionContext = await browser.newContext();
  const receiver = await receiverContext.newPage();
  const recording = receiver.video();
  const gateway = await gatewayContext.newPage();
  const institution = await institutionContext.newPage();

  await receiver.goto("/");
  await receiver.waitForTimeout(1_500);
  await receiver.getByRole("link", { name: "3분 데모 시작" }).click();
  await receiver.waitForTimeout(1_200);
  await receiver.goto("/receiver");
  await receiver.getByRole("button", { name: "테스트 세션 준비", exact: true }).click();
  await expect(receiver.getByText("수신 세션과 인증된 signaling 연결이 준비됐습니다.")).toBeVisible();
  await receiver.evaluate(() => window.scrollTo({ top: 0 }));

  await gateway.goto("/gateway");
  await gateway.getByRole("button", { name: "브라우저 키 등록" }).click();
  await expect(gateway.getByTestId("gateway-transport")).toContainText("signaling 준비");
  await institution.goto("/institution");
  await institution.getByRole("button", { name: "기관 세션 준비" }).click();
  await institution.getByRole("button", { name: "연락 승인 발급" }).first().click();
  await expect(institution.getByText(/개별 연락 승인서 .*를 발급했습니다/)).toBeVisible();
  await gateway.getByRole("button", { name: "승인 목록 새로고침" }).click();
  await gateway.getByRole("button", { name: "승인 통화 시작" }).first().click();
  await expect(receiver.getByText("승인 상담 연결 확인")).toBeVisible({ timeout: 20_000 });
  await receiver.getByText("승인 상담 연결 확인").scrollIntoViewIfNeeded();
  await receiver.waitForTimeout(1_500);
  await receiver.getByRole("button", { name: "전화 받기" }).click();
  await expect.poll(async () => Number(await receiver.getByTestId("transport-profile").getAttribute("data-audio-bytes"))).toBeGreaterThan(0);
  await receiver.getByRole("button", { name: "위험 요구 분석" }).click();
  await expect(receiver.getByTestId("risk-result")).toContainText("규칙 기반 분석");
  await receiver.getByTestId("risk-result").scrollIntoViewIfNeeded();
  await receiver.waitForTimeout(1_500);
  await institution.getByRole("button", { name: "원장 위임 취소" }).first().click();
  await expect(receiver.getByText("인증 조건 불충족")).toBeVisible({ timeout: 12_000 });
  await receiver.getByText("인증 조건 불충족").scrollIntoViewIfNeeded();
  await receiver.waitForTimeout(2_000);

  await Promise.all([gatewayContext.close(), institutionContext.close()]);
  await receiverContext.close();
  await recording?.saveAs("artifacts/demo-video/CallSign-live-demo.webm");
});
