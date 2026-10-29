import { measurements } from './telemetry.js';
import WebSocket from 'ws';
import { z } from 'zod';
import type { ServiceAuthority } from './service-authority.js';
import type { ServiceAttempt } from './service-state.js';
import { terminal } from './service-state.js';
import type { AsteriskBridge } from './asterisk.js';
import type { PbxEndpoints } from './pbx-routes.js';

// Event payloads are hints. Stable channel IDs and authoritative DB state decide transitions.
export class PbxRuntime {
  private socket:WebSocket|undefined;private timer:ReturnType<typeof setTimeout>|undefined;
  private retry:ReturnType<typeof setTimeout>|undefined;private closed=false;private busy=false;private failures=0;
  private knownCalls:ServiceAttempt[]=[];
  ready=false;
  constructor(readonly options:{authority:ServiceAuthority;institutionId:string;bridge:AsteriskBridge;endpoints:Pick<PbxEndpoints,'remove'>;sessionsAlive(attempt:ServiceAttempt):Promise<boolean>;factory?:(url:URL,headers:Record<string,string>)=>WebSocket}){}
  async start(){
    // Browser session keys cannot be recovered by the issuer after a process restart.
    await this.options.authority.options.store.transact(this.options.institutionId,async r=>{for(const t of Object.values(r.serviceV3?.attempts??{}))if(t.pbx&&!terminal(t.status)){t.status='failed';t.reason='issuer-restarted-new-attempt-required';t.endedAt=this.options.authority.now();if(t.consent){t.consent.granted=false;t.consent.generation++;}}});
    this.connect();void this.tick();
  }
  private connect(){if(this.closed)return;const ari=this.options.bridge.ari,url=new URL('/ari/events',ari.config.base);url.protocol='wss:';url.searchParams.set('app',ari.config.application);
    const socket=this.options.factory?.(url,{authorization:`Basic ${ari.config.authorization}`})??new WebSocket(url,{headers:{authorization:`Basic ${ari.config.authorization}`},handshakeTimeout:3000,maxPayload:131072});this.socket=socket;
    socket.on('open',()=>{if(this.closed||this.socket!==socket){socket.close();return;}this.ready=true;this.failures=0;void this.tick();});
    socket.on('message',raw=>{if(this.closed||this.socket!==socket)return;try{const event=z.object({type:z.string(),channel:z.object({id:z.string()}).optional()}).passthrough().parse(JSON.parse(String(raw)));void this.event(event).catch(()=>{this.ready=false;});}catch{this.ready=false;socket.close(1008,'invalid event');}});
    socket.on('error',()=>{this.ready=false;socket.close();});socket.on('close',()=>{if(this.socket!==socket)return;this.ready=false;if(!this.closed){clearTimeout(this.retry);this.retry=setTimeout(()=>this.connect(),Math.min(10000,500*2**Math.min(5,this.failures++)));this.retry.unref?.();}});
  }
  async event(event:{type:string;channel?:{id:string}|undefined}){
    if(!['StasisEnd','ChannelDestroyed','ChannelHangupRequest'].includes(event.type)||!event.channel)return;
    await this.options.authority.options.store.transact(this.options.institutionId,async r=>{for(const t of Object.values(r.serviceV3?.attempts??{}))if(t.pbx&&[t.pbx.senderChannelId,t.pbx.recipientChannelId].includes(event.channel!.id)&&!terminal(t.status)){t.status=t.status==='accepted'?'ended':'failed';t.reason='pbx-channel-ended';t.endedAt=this.options.authority.now();if(t.consent){t.consent.granted=false;t.consent.generation++;}}});
    await this.tick();
  }
  async tick(){if(this.closed||this.busy)return;this.busy=true;
    try{
      const {authority:a,institutionId,bridge,endpoints}=this.options;await a.sweep(institutionId);
      const record=await a.options.store.read(institutionId);
      this.knownCalls=Object.values(record.serviceV3?.attempts??{}).filter(t=>!!t.pbx&&t.pbx.state!=='ended').slice(0,100);
      for(const t of this.knownCalls){
        try{
        if(!terminal(t.status)&&(!this.ready||!await this.options.sessionsAlive(t))){
          await a.options.store.transact(institutionId,async r=>{const current=r.serviceV3?.attempts[t.id];if(current&&!terminal(current.status)){current.status='failed';current.reason=this.ready?'login-session-revoked':'pbx-observation-unavailable';current.endedAt=a.now();if(current.consent){current.consent.granted=false;current.consent.generation++;}}});t.status='failed';
        }
        if(terminal(t.status)&&t.pbx!.state!=='ended'){
          // Every resource is attempted even if another cleanup call fails. Next tick retries.
          await measurements.measure('revocation-reclaim',async()=>{await bridge.ari.destroy(t);await endpoints.remove(t.id);});
          await a.options.store.transact(institutionId,async r=>{const current=r.serviceV3?.attempts[t.id];if(current?.pbx&&terminal(current.status)){current.pbx.state='ended';current.pbx.credentials={};current.pbx.reports={};delete current.pbx.evidence;}});
        } else if(t.status==='accepted'&&t.pbx!.state==='bridged'){
          if((t.authorityStatus==='unavailable'||(t.authorityUntil??0)<=a.now()||t.lease?.payload.authority==='unavailable')&&!(t.lease?.payload.authority==='unavailable'&&t.unverifiedChoice==='continue')){await bridge.ari.mute(t.pbx!.senderChannelId,true);await bridge.ari.mute(t.pbx!.recipientChannelId,true);}
          else {await bridge.ari.channel(t.pbx!.senderChannelId);await bridge.ari.channel(t.pbx!.recipientChannelId);}
        }
        }catch{/* A failed cleanup remains pending; it must not terminate unrelated calls. */}
      }
    }catch{
      // Last observed channel IDs remain useful when the DB cannot answer. PBX timeouts also remain armed.
      let index=0;await Promise.all([0,1].map(async()=>{while(index<this.knownCalls.length){const t=this.knownCalls[index++]!;if(t.pbx)await Promise.allSettled([this.options.bridge.ari.mute(t.pbx.senderChannelId,true),this.options.bridge.ari.mute(t.pbx.recipientChannelId,true)]);}}));
    }finally{this.busy=false;if(!this.closed){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.tick();},1000);this.timer.unref?.();}}
  }
  close(){this.closed=true;this.ready=false;clearTimeout(this.timer);clearTimeout(this.retry);this.socket?.close();}
}
