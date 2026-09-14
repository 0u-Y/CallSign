import { expect, test } from "@playwright/test";

test("evidence page reports live four-node and witness readiness", async ({ page }) => {
  await page.goto("/evidence");
  await expect(page.getByText("4/4 노드")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("4/4 witness")).toBeVisible();
  await expect(page.getByText(/동일 블록 #/)).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/evidence-desktop.png", fullPage: true });
});
