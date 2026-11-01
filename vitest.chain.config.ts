import {defineConfig} from 'vitest/config';
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='chain'||!process.env.CALLSIGN_CHAIN_TEST_ROOT)throw new Error('OWNED_CHAIN_INTEGRATION_REQUIRED');
export default defineConfig({cacheDir:'/tmp/callsign-chain-vite',test:{include:['tests/integration/chain-runtime.test.ts'],maxWorkers:1,testTimeout:30000,hookTimeout:30000}});
