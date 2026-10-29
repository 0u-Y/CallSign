import { defineConfig } from 'vitest/config';
if (process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== 'integration' || !process.env.CALLSIGN_HTTP_TEST_ROOT) throw new Error('HTTP_INTEGRATION_EXECUTION_BLOCKED');
export default defineConfig({test:{include:['tests/integration/service-http.test.ts'],maxWorkers:1,testTimeout:10000,hookTimeout:30000}});
