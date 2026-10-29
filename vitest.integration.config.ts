import { defineConfig } from "vitest/config";
if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "integration") throw new Error("INTEGRATION_EXECUTION_BLOCKED");
export default defineConfig({ test: { include: ["tests/integration/**/*.test.ts"], exclude: ["tests/integration/service-http.test.ts","tests/integration/service-boundaries.test.ts"], maxWorkers: 1 } });
