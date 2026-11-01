import {expect,it} from 'vitest';
import {ledgerAddresses,ledgerOverlaps} from '../../scripts/besu-peers.js';
import {chainPreflight} from '../../scripts/preflight-chain.js';
import {readFileSync} from 'node:fs';
const env={CALLSIGN_PROJECT:'callsign-test-plan',FINALS_DATA_DIR:'/not-created/callsign-plan',NETWORK_ID:'20260914',LEDGER_IPV4_PREFIX:'10.206.0',LEDGER_OBSERVED_CIDRS:'10.203.0.0/24,172.16.0.0/16,192.168.1.4/24'};
it('compares supernets, subnets, single hosts and adjacent non-overlapping IPv4 ranges',()=>{
 expect(ledgerOverlaps('10.206.0',['10.0.0.0/8','10.206.0.12/32','10.206.0.128/25','10.206.1.0/24'])).toEqual(['10.0.0.0/8','10.206.0.12/32','10.206.0.128/25']);
 expect(()=>ledgerOverlaps('10.206.0',['invalid/24'])).toThrow();expect(()=>ledgerOverlaps('10.206.0',['10.2.0.0/33'])).toThrow();
});
it.each(['8.8.8','10.256.0','010.1.1','10.1.0.0/24','10.1.$(id)','172.32.0'])('rejects invalid/public prefixes %s',prefix=>expect(()=>ledgerAddresses(prefix)).toThrow());
it('does not make provider, OIDC, PBX, images or generated keys prerequisites for input review',async()=>{
 const checks=await chainPreflight(env,'prepare');expect(checks.every(c=>c.status==='PASS')).toBe(true);
 expect(checks.some(c=>/OIDC|PBX|provider|IMAGE|validator/.test(c.id))).toBe(false);
 expect((await chainPreflight({...env,LEDGER_OBSERVED_CIDRS:undefined},'prepare')).find(c=>c.id==='ledger-overlap')?.status).toBe('BLOCKED');
 expect((await chainPreflight({...env,LEDGER_IPV4_PREFIX:'10.203.0'},'prepare')).find(c=>c.id==='ledger-overlap')?.status).toBe('FAIL');
 expect((await chainPreflight({...env,LEDGER_IPV4_PREFIX:'10.205.0'},'prepare')).find(c=>c.id==='ledger-media-separation')?.status).toBe('FAIL');
});
it('keeps missing generated materials blocked for node startup, and rejects execution guard in inspection',async()=>{
 const checks=await chainPreflight(env,'nodes');expect(checks.find(c=>c.id==='prepared-network')?.status).toBe('BLOCKED');expect(checks.find(c=>c.id==='BESU_IMAGE')?.status).toBe('BLOCKED');
 expect(checks.filter(c=>c.id.startsWith('validator-')&&c.status==='BLOCKED')).toHaveLength(4);
 expect((await chainPreflight({...env,CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'infrastructure'},'prepare')).find(c=>c.id==='execution-guard')?.status).toBe('FAIL');
 await expect(chainPreflight(env,'everything')).rejects.toThrow('CHAIN_STEP_REQUIRED');
});
it('uses the same single prefix for Compose subnet, advertised hosts, allowlists and static IPs',()=>{
 const compose=readFileSync('infra/deploy/compose.yml','utf8');
 expect(compose).toContain("subnet: '${LEDGER_IPV4_PREFIX:-10.203.0}.0/24'");
 for(const n of [11,12,13,14]){expect(compose).toContain(`--p2p-host=\${LEDGER_IPV4_PREFIX:-10.203.0}.${n}`);expect(compose).toContain(`ipv4_address: \${LEDGER_IPV4_PREFIX:-10.203.0}.${n}`);}
 expect(compose).not.toMatch(/@10\.203\.0\.|--p2p-host=10\.203\.0\./);
});

it('keeps deployer credentials out of the Witness-only preparation step',async()=>{
 const checks=await chainPreflight(env,'witness');
 expect(checks.some(c=>c.id==='deployer-key'||c.id==='joint-approvers')).toBe(false);
 expect(checks.find(c=>c.id==='public-manifest')?.status).toBe('BLOCKED');
 expect(checks.filter(c=>c.id.startsWith('witness-')&&c.status==='BLOCKED')).toHaveLength(4);
});

it('marks chain mounts as non-creating bind mounts before Compose interpolation',()=>{
 const chain=readFileSync('infra/deploy/compose.yml','utf8').split('\n  besu1:')[1]!;
 expect([...chain.matchAll(/- \{type: bind, source:/g)]).toHaveLength(28);
 expect(chain).not.toMatch(/- \$\{FINALS_DATA_DIR\}\//);
 expect([...chain.matchAll(/bind: \{create_host_path: false\}/g)]).toHaveLength(28);
});
