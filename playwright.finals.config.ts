import { defineConfig, devices } from "@playwright/test";
if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "media") throw new Error("MEDIA_EXECUTION_BLOCKED");
export default defineConfig({
  reporter: process.env.CALLSIGN_VALIDATION_REPORT ? [["line"],["json",{outputFile:process.env.CALLSIGN_VALIDATION_REPORT}]] : [["line"]],
  outputDir: process.env.CALLSIGN_VALIDATION_OUTPUT ?? "test-results/media",
  testDir: "tests/media", workers: 1, fullyParallel: false, timeout: 60000,
  use: { baseURL: process.env.CALLSIGN_MEDIA_ORIGIN, ...devices["Desktop Chrome"], trace: "off", video: "off" },
  // No webServer hook. Operator must explicitly start and authorize the selected stack first.
});
