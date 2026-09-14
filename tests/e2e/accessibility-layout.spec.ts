import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`landing and demo avoid horizontal overflow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/demo", "/receiver"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
}

test("primary demo action remains keyboard reachable at 200% page scale", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBeGreaterThanOrEqual(1.9);
  const action = page.getByRole("link", { name: "3분 데모 시작" });
  await action.focus();
  await expect(action).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/demo$/);
});

test("presentation demo executes approval, WebRTC, and copied-proof rejection step by step", async ({ page }) => {
  await page.goto("/demo");

  await page.getByRole("button", { name: "연락 승인서 발급" }).click();
  await expect(page.getByRole("heading", { name: "연락 승인 완료" })).toBeVisible();
  await page.getByRole("button", { name: "승인된 통화 연결" }).click();
  await expect(page.getByText("승인 상담 연결 확인")).toBeVisible();
  await expect(page.getByText(/DTLS certificate, datachannel probe/)).toBeVisible();
  await page.getByRole("button", { name: "Alice가 전화 받기" }).click();
  await expect(page.locator(".phone-metric")).toContainText("수락 전 0B → 수락 후");

  await page.locator(".presentation-scenes button").nth(1).click();
  await page.getByRole("button", { name: "기관명을 사칭해 발신" }).click();
  await expect(page.getByText("기관 발신 미확인")).toBeVisible();
  await page.getByRole("button", { name: "Alice 증명을 Bob에게 복사" }).click();
  await expect(page.locator(".phone-metric")).toHaveText("RECIPIENT_MISMATCH");
  await expect(page.getByText(/실제 verifier가 거절/)).toBeVisible();
});
