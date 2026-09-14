import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("operator suspends and two distinct approvers recover the institution on QBFT", async ({ page }) => {
  await page.goto("/governance");

  await page.getByRole("button", { name: "공동 운영 세션 준비" }).click();
  await expect(page.getByText(/모의 A시청 · Active · epoch/)).toBeVisible();
  const activeText = await page.getByText(/모의 A시청 · Active · epoch/).textContent();
  const initialEpoch = Number(activeText?.match(/epoch (\d+)/)?.[1]);

  await page.getByRole("button", { name: "기관 긴급 정지" }).click();
  await expect(page.getByText(/긴급 정지가 원장에 확정됐습니다/)).toBeVisible();
  await expect(page.getByText(/모의 A시청 · Suspended · epoch/)).toBeVisible();
  const suspendTransaction = await page.locator(".transaction-proof code").textContent();
  expect(suspendTransaction).toMatch(/^0x[0-9a-f]{64}$/);

  await page.getByRole("button", { name: "복구안 만들기" }).click();
  await expect(page.getByText(/복구안을 만들었습니다/)).toBeVisible();

  const approvers = page.locator(".approver-list article");
  await approvers.nth(0).getByRole("button", { name: "이 세션으로 서명" }).click();
  await expect(page.getByText(/현재 1\/2/)).toBeVisible();
  await expect(approvers.nth(0).getByText("EIP-712 서명 기록됨")).toBeVisible();

  await approvers.nth(1).getByRole("button", { name: "이 세션으로 서명" }).click();
  await expect(page.getByText(/2-of-3 실제 EIP-712 복구가 원장에 확정됐습니다/)).toBeVisible();
  await expect(page.getByText(/모의 A시청 · Active · epoch/)).toBeVisible();
  const recoveredText = await page.getByText(/모의 A시청 · Active · epoch/).textContent();
  const recoveredEpoch = Number(recoveredText?.match(/epoch (\d+)/)?.[1]);
  const recoveryTransaction = await page.locator(".transaction-proof code").textContent();

  expect(recoveryTransaction).toMatch(/^0x[0-9a-f]{64}$/);
  expect(recoveryTransaction).not.toBe(suspendTransaction);
  expect(recoveredEpoch).toBe(initialEpoch + 2);
  await expect(approvers.nth(1).getByText("EIP-712 서명 기록됨")).toBeVisible();

  await page.screenshot({ path: "artifacts/screenshots/governance-recovered-live.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
  await page.screenshot({ path: "artifacts/screenshots/governance-recovered-mobile.png", fullPage: true });
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/governance-run.json", `${JSON.stringify({
    profile: "qbft-live-eip712-recovery-v1",
    browserContexts: 1,
    institutionId: "inst_mock_a_city_01HZZZZZZZZZZZZZZZZ",
    initialEpoch,
    suspendedEpoch: initialEpoch + 1,
    recoveredEpoch,
    distinctApproverSessions: ["approver_1", "approver_2"],
    suspendTransaction,
    recoveryTransaction,
    approvalKeyRotation: "preserved-in-demo",
    capturedAt: new Date().toISOString(),
  }, null, 2)}\n`);
});
