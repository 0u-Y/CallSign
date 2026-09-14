import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/protocol/src/**/*.test.ts", "packages/verifier/src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
