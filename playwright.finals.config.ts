import { defineConfig, devices } from "@playwright/test";
if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "media") throw new Error("MEDIA_EXECUTION_BLOCKED");
export default defineConfig({
  testDir: "tests/media", workers: 1, fullyParallel: false, timeout: 60000,
  use: { baseURL: process.env.CALLSIGN_MEDIA_ORIGIN, ...devices["Desktop Chrome"], trace: "off", video: "off" },
  // No webServer hook. Operator must explicitly start and authorize the v2 stack first.
});
