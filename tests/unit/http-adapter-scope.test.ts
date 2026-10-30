import { it, expect, vi } from 'vitest';
import { buildFinalsServer } from '../../services/api/src/finals-server.js';
import { finalsEnvironment } from '../../services/api/src/finals-config.js';
const env=finalsEnvironment({SERVICE_ROLE:'platform',WEB_ORIGIN:'https://127.0.0.1:4173',PUBLIC_DEPLOYMENT:'true',PLATFORM_INTERNAL_TOKEN:'p'.repeat(40),ISSUER_URL:'http://127.0.0.1:4101',SENDER_URL:'http://127.0.0.1:4102',INSTITUTION_ID:'test-institution',NETWORK_ID:'31337',REGISTRY_ADDRESS:`0x${'1'.repeat(40)}`,TRUST_BUNDLE_PATH:'not-read-in-scope-test'});
const adapters={anchor:{read:async()=>{throw new Error('MUST_NOT_READ');},advance:async()=>{throw new Error('MUST_NOT_ADVANCE');}},current:async()=> 'unavailable' as const};
it('rejects external-adapter injection without integration approval, test identity and loopback origin',async()=>{
 vi.stubEnv('ISSUER_DATABASE_URL','postgres://issuer:fixture@127.0.0.1/callsign_test_scope');vi.stubEnv('AUTH_DATABASE_URL','postgres://auth:fixture@127.0.0.1/callsign_test_scope');vi.stubEnv('CALLSIGN_ALLOW_EXTERNAL_EXECUTION','');vi.stubEnv('DEPLOYMENT_ID','test:unit');
 await expect(buildFinalsServer(env,adapters)).rejects.toThrow('TEST_ADAPTER_SCOPE_REQUIRED');
 vi.stubEnv('CALLSIGN_ALLOW_EXTERNAL_EXECUTION','integration');vi.stubEnv('DEPLOYMENT_ID','production');
 await expect(buildFinalsServer(env,adapters)).rejects.toThrow('TEST_ADAPTER_SCOPE_REQUIRED');
 vi.stubEnv('DEPLOYMENT_ID','test:unit');
 await expect(buildFinalsServer({...env,WEB_ORIGIN:'https://public.example'},adapters)).rejects.toThrow('TEST_ADAPTER_SCOPE_REQUIRED');
 for(const database of ['postgres://issuer:fixture@127.0.0.1/callsign','postgres://issuer:fixture@postgres/callsign_test_scope']){vi.stubEnv('ISSUER_DATABASE_URL',database);await expect(buildFinalsServer(env,adapters)).rejects.toThrow('TEST_ADAPTER_SCOPE_REQUIRED');}
 vi.unstubAllEnvs();
});
