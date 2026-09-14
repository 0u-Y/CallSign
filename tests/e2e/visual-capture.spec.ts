import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`capture representative screens at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const [name, path] of [["landing", "/"], ["demo", "/demo"], ["receiver", "/receiver"]] as const) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await page.screenshot({ path: `artifacts/screenshots/${name}-${viewport.name}.png`, fullPage: true });
    }
  });
}
