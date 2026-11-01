import {expect,it,vi} from 'vitest';
vi.mock('../../apps/web/src/lib/api.js',()=>({api:vi.fn()}));
import {observePbxTransport} from '../../apps/web/src/lib/rtc.js';
const expected='BA:78:16:BF:8F:01:CF:EA:41:41:40:DE:5D:AE:22:23:B0:03:61:A3:96:17:7A:9C:B4:10:FF:61:F2:00:15:AD';
function peer(entries:Record<string,unknown>[]){const stats=new Map(entries.map(e=>[e.id,e]));return {connectionState:'connected',localDescription:{sdp:'local'},remoteDescription:{sdp:'server-controlled-sdp'},getStats:async()=>stats,getReceivers:()=>[{track:{kind:'audio'},transport:{}}]} as unknown as RTCPeerConnection;}
it('hashes DER from the certificate referenced by the connected native DTLS transport',async()=>{
 const pc=peer([{id:'dtls',type:'transport',dtlsState:'connected',remoteCertificateId:'remote'},{id:'remote',type:'certificate',base64Certificate:'YWJj',fingerprint:'untrusted-stats-string'},{id:'unrelated',type:'certificate',base64Certificate:'ZGVm'}]);expect((await observePbxTransport(pc,'sip-call')).remoteFingerprint).toBe(expected);
});
it('rejects missing referenced certificate, malformed DER encoding and ambiguous DTLS transports',async()=>{
 const dtls={id:'dtls',type:'transport',dtlsState:'connected',remoteCertificateId:'missing'};
 await expect(observePbxTransport(peer([dtls,{id:'other',type:'certificate',base64Certificate:'YWJj'}]),'call')).rejects.toThrow('REMOTE_CERTIFICATE_API_UNSUPPORTED');
 await expect(observePbxTransport(peer([{...dtls,remoteCertificateId:'bad'},{id:'bad',type:'certificate',base64Certificate:'!not-base64'}]),'call')).rejects.toThrow('REMOTE_CERTIFICATE_API_UNSUPPORTED');
 await expect(observePbxTransport(peer([dtls,{...dtls,id:'second'}]),'call')).rejects.toThrow('DTLS_TRANSPORT_AMBIGUOUS');
});
