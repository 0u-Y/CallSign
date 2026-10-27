import { defineConfig } from "vitest/config";
if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== "integration") throw new Error("INTEGRATION_EXECUTION_BLOCKED");
export default defineConfig({ test: { include: ["tests/integration/**/*.test.ts"], maxWorkers: 1 } });
