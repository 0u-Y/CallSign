import { expect, it } from 'vitest';
import { parseSip, sipDigest } from '../../apps/web/src/lib/pbxSip.js';
import { createHash } from 'node:crypto';
it('rejects SIP duplicate headers, bad byte lengths and oversized messages',()=>{
  const prefix='SIP/2.0 200 OK\r\nCall-ID: test\r\nCSeq: 1 REGISTER\r\n';
  expect(parseSip(`${prefix}Content-Length: 0\r\n\r\n`).start).toBe('SIP/2.0 200 OK');
  expect(()=>parseSip(`${prefix}Call-ID: other\r\nContent-Length: 0\r\n\r\n`)).toThrow('SIP_DUPLICATE_HEADER');
  expect(()=>parseSip(`${prefix}Content-Length: 1\r\n\r\n가`)).toThrow('SIP_CONTENT_LENGTH_INVALID');expect(()=>parseSip('x'.repeat(65537))).toThrow('SIP_MESSAGE_TOO_LARGE');
});
it('uses registered realm and SHA-256 digest auth with qop, rejecting weaker challenges',async()=>{
  const challenge='Digest realm="callsign.example", nonce="random-nonce", algorithm=SHA-256, qop="auth"',credentials={username:'endpoint',password:'password',realm:'callsign.example'};
  const value=await sipDigest(challenge,credentials,'REGISTER','sip:callsign.example','client-nonce');
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const expected=hash(`${hash('endpoint:callsign.example:password')}:random-nonce:00000001:client-nonce:auth:${hash('REGISTER:sip:callsign.example')}`);
  expect(value).toContain(`response="${expected}"`);await expect(sipDigest(challenge.replace('SHA-256','MD5'),credentials,'REGISTER','sip:callsign.example','nonce')).rejects.toThrow('SIP_AUTH_PROFILE_UNSUPPORTED');await expect(sipDigest(challenge,{...credentials,realm:'evil.example'},'REGISTER','sip:callsign.example','nonce')).rejects.toThrow('SIP_AUTH_PROFILE_UNSUPPORTED');
});
