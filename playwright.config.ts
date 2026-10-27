import { defineConfig, devices } from "@playwright/test";

if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "media") throw new Error("MEDIA_EXECUTION_BLOCKED");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["line"], ["json", { outputFile: "artifacts/playwright-results.json" }]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "CALLSIGN_ALLOW_EXTERNAL_EXECUTION=infrastructure DEMO_MODE=true pnpm dev",
    url: "http://localhost:4173/api/health",
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
