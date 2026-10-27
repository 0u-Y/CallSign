import { describe, expect, it, vi } from 'vitest';
import { AsteriskBridge, AriClient } from '../../services/api/src/asterisk.js';
import { generateEd25519KeyPair, hashSdp, pbxEvidenceSchema, verifyPayload } from '../../packages/protocol/src/index.js';
import { serviceFixture } from './service-fixture.js';

describe('Asterisk control and actual channel evidence (fake ARI only)',()=>{
  it('checks real channel identity and mutes both legs before preparing evidence',async()=>{
    const f=await serviceFixture(),key=await generateEd25519KeyPair(),calls:string[]=[];
    const senderSdp=`v=0\r\na=fingerprint:sha-256 ${f.binding.senderFingerprint}\r\n`,recipientSdp=`v=0\r\na=fingerprint:sha-256 ${f.binding.recipientFingerprint}\r\n`;
    const attempt={...f.attempt,authorizationId:f.authorization.payload.authorizationId,pbx:{bridgeId:'bridge',senderChannelId:'sender',recipientChannelId:'recipient',senderEndpoint:'cs-sender',recipientEndpoint:'cs-recipient',state:'reserved' as const,credentials:{},reports:{sender:{callId:'sip-s',sdp:senderSdp,remoteSdp:recipientSdp,fingerprint:f.binding.senderFingerprint,proof:'signed'},recipient:{callId:'sip-r',sdp:recipientSdp,remoteSdp:senderSdp,fingerprint:f.binding.recipientFingerprint,proof:'signed'}}}};
    const fetcher=vi.fn(async(url:URL|RequestInfo,init?:RequestInit)=>{const path=new URL(String(url)).pathname;calls.push(`${init?.method} ${path}`);if(path.endsWith('/variable'))return Response.json({value:path.includes('/sender/')?'sip-s':'sip-r'});if(init?.method==='GET')return Response.json({id:path.endsWith('sender')?'sender':'recipient',state:'Up',name:`PJSIP/cs-${path.endsWith('sender')?'sender':'recipient'}-0001`});return new Response(null,{status:204});}) as typeof fetch;
    const ari=new AriClient({base:new URL('https://pbx.example'),authorization:'private',application:'callsign',fetcher}),bridge=new AsteriskBridge(ari,key,f.authority.base());
    const binding={...f.binding,senderSdpHash:hashSdp(senderSdp),recipientSdpHash:hashSdp(recipientSdp),callProfile:'asterisk-webrtc-v3' as const};
    const result=await bridge.evidence(f.institution.institutionId,attempt,binding,'prepared',1800000000);
    expect(calls.slice(-2)).toEqual(['POST /ari/channels/sender/mute','POST /ari/channels/recipient/mute']);expect(result.payload.bindingHash).not.toBe(f.binding.authorizationHash);
    expect((await verifyPayload(result.jws,key.publicKey,{type:'AsteriskSessionEvidence',kid:key.kid,schema:pbxEvidenceSchema})).recipientCallId).toBe('sip-r');
    await expect(bridge.evidence(f.institution.institutionId,attempt,binding,'bridged',1800000000)).rejects.toThrow('PBX_ACCEPTANCE_REQUIRED');expect(calls.some(v=>v.includes('addChannel'))).toBe(false);
    attempt.pbx.reports.recipient.callId='copied-other-call';await expect(bridge.evidence(f.institution.institutionId,attempt,binding,'prepared',1800000000)).rejects.toThrow('PBX_CHANNEL_CONTEXT_INVALID');
  });
  it('rejects HTTP ARI, arbitrary endpoint injection and non-success responses',async()=>{
    expect(()=>new AriClient({base:new URL('http://pbx.example'),authorization:'secret',application:'callsign'})).toThrow('ARI_CONFIGURATION_INVALID');
    const f=await serviceFixture(),fetcher=vi.fn(async()=>new Response(null,{status:503}));const ari=new AriClient({base:new URL('https://pbx.example'),authorization:'secret',application:'callsign',fetcher});
    await expect(ari.originate('channel','PJSIP/trunk',f.attempt)).rejects.toThrow('ARI_ENDPOINT_FORBIDDEN');expect(fetcher).not.toHaveBeenCalled();await expect(ari.channel('channel')).rejects.toThrow('ARI_REQUEST_FAILED');
  });
});
