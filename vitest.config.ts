import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "services/api/src/**/*.unit.test.ts", "tests/unit/**/*.test.ts", "tests/integration/risk.test.ts"],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    setupFiles: ["tests/unit/offline.ts"],
    maxWorkers: 2,
  },
});
