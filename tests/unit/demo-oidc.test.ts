import {it,expect} from 'vitest';
import {demoOidcInputs} from '../../scripts/prepare-demo-oidc.js';
it('separates real public OIDC clients and synthetic identities without assigning caller-controlled roles or signing keys',()=>{
 const first=demoOidcInputs('https://frontend.callsign.demo','https://identity.callsign.demo/idp'),second=demoOidcInputs('https://frontend.callsign.demo','https://identity.callsign.demo/idp');
 for(const client of first.realm.clients)expect(client.defaultClientScopes).toEqual(['basic','profile']);
 expect(first.realm.clients.map(c=>c.clientId)).toEqual(['callsign-work','callsign-official']);
 for(const client of first.realm.clients){expect(client.redirectUris).toEqual(['https://frontend.callsign.demo/service']);expect(client.webOrigins).toEqual(['https://frontend.callsign.demo']);expect(client.attributes['pkce.code.challenge.method']).toBe('S256');expect(client.directAccessGrantsEnabled||client.implicitFlowEnabled||client.serviceAccountsEnabled).toBe(false);}
 expect(new Set(first.credentials.map(x=>x.subject)).size).toBe(6);expect(new Set(first.credentials.map(x=>x.password)).size).toBe(6);expect(first.credentials[0]!.password).not.toBe(second.credentials[0]!.password);
 expect(first.accounts.filter(x=>x.role==='approver')).toHaveLength(3);expect(first.accounts.filter(x=>['gateway','recipient'].includes(x.role)).every(x=>x.permissions.length===0)).toBe(true);
 expect(first.accounts.every(x=>x.id.startsWith('https://identity.callsign.demo/idp/realms/callsign-demo|'))).toBe(true);expect(first.environment.OIDC_AUDIENCE).not.toBe(first.environment.OFFICIAL_OIDC_AUDIENCE);expect(first.verification.status).toBe('INPUTS_ONLY_NOT_IMPORTED');
});
it('rejects placeholder/private or ambiguous identities rather than generating live-looking credentials',()=>{
 for(const origin of ['http://frontend.callsign.demo','https://localhost','https://127.0.0.1','https://frontend.example','https://x.callsign.demo/path','https://u:p@x.callsign.demo','https://x.callsign.demo?return=elsewhere'])expect(()=>demoOidcInputs(origin,'https://identity.callsign.demo')).toThrow();
});
