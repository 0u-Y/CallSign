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

test("demo makes the role flow and exact rejection point visible", async ({ page }) => {
  await page.goto("/demo");

  await page.getByRole("button", { name: "이 장면 실행" }).click();
  await expect(page.locator(".journey-verdict")).toHaveText("승인 확인");
  await expect(page.locator(".journey-status")).toHaveText(["확인됨", "확인됨", "확인됨", "별도 권한"]);

  await page.locator(".scene-rail button").nth(1).click();
  await expect(page.locator(".journey-verdict")).toHaveText("실행 대기");
  await page.getByRole("button", { name: "이 장면 실행" }).click();
  await expect(page.locator(".journey-verdict")).toHaveText("흐름 차단");
  await expect(page.locator(".journey-status")).toHaveText(["확인됨", "여기서 차단", "여기서 차단", "별도 권한"]);
});
