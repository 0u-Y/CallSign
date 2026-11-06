import {describe,it,expect} from 'vitest';
import {shortRecordId,contactWorkState,demoAccountLabel,demoOrganizationLabel} from './workPresentation.js';
describe('real work identifiers',()=>{
 it('distinguishes common trial prefixes without assigning fictional identities',()=>{const ids=['public-demo-first-01234567','public-demo-next-12345678'];expect(ids.map(id=>shortRecordId(id,ids))).toEqual(['01234567','12345678']);});
 it('expands colliding suffixes and keeps short IDs intact',()=>{const ids=['first-12345678','other-12345678'] as const;expect(shortRecordId(ids[0],ids)).not.toBe(shortRecordId(ids[1],ids));expect(shortRecordId('abc',['abc'])).toBe('abc');});
 it('does not expand repeated references to the same account',()=>{expect(shortRecordId('account-12345678',['account-12345678','account-12345678'])).toBe('12345678');});
});
it('separates open work expiry from retained completed and cancelled history',()=>{
 expect(contactWorkState({status:'open',expiresAt:100},100)).toBe('expired');
 expect(contactWorkState({status:'open',expiresAt:101},100)).toBe('open');
 expect(contactWorkState({status:'cancelled',expiresAt:99},100)).toBe('cancelled');
 expect(contactWorkState({status:'completed',expiresAt:99},100)).toBe('completed');
});

it('keeps synthetic aliases stable across work records and leaves non-demo identities identifiable',()=>{
 const id='https://example.test/idp/realms/callsign-demo|synthetic-recipient';
 expect(demoAccountLabel(id,'고객')).toMatch(/^[이김박최정한윤서]\*[민영준희현진우연]$/);
 expect(demoAccountLabel(id,'고객')).toBe(demoAccountLabel(id,'고객'));
 expect(demoAccountLabel(id,'상담원')).toMatch(/상담$/);
 expect(demoAccountLabel('real-account','고객')).toContain('고객 ·');
 expect(demoOrganizationLabel('demo-bank')).toBe('시그널카드');expect(demoOrganizationLabel('other')).toBe('other');
});
