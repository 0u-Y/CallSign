import {expect,it} from 'vitest';
import {besuPeerConfiguration} from '../../scripts/besu-peers.js';
it('pins four public identities to fixed peers without a discovery dependency',()=>{const keys=['11','22','33','44'].map(k=>'0x'+k.repeat(64)),c=besuPeerConfiguration(keys),peers=JSON.parse(c.staticNodes);expect(peers).toHaveLength(4);expect(peers[0]).toBe(`enode://${'11'.repeat(64)}@10.203.0.11:30303`);expect(c.permissions).toBe(`nodes-allowlist=${JSON.stringify(peers)}\n`);expect(()=>besuPeerConfiguration([keys[0]!,keys[0]!,keys[2]!,keys[3]!])).toThrow('DISTINCT');expect(()=>besuPeerConfiguration(keys.slice(0,3))).toThrow('FOUR');expect(()=>besuPeerConfiguration(['key-invalid',...keys.slice(1)])).toThrow();});

it('derives all four peers from the same reviewed private /24 prefix',()=>{
 const keys=['11','22','33','44'].map(k=>'0x'+k.repeat(64)),c=besuPeerConfiguration(keys,'10.206.0');
 expect(JSON.parse(c.staticNodes).map((p:string)=>p.split('@')[1])).toEqual([11,12,13,14].map(n=>`10.206.0.${n}:30303`));
 expect(c.permissions).toContain('10.206.0.14');expect(c.staticNodes).not.toContain('10.203.0.');
});
