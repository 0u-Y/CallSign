import {ShieldCheck,AudioLines} from 'lucide-react';
import type {ServiceCallStatus} from '../lib/serviceCall.js';
import type {ReactNode} from 'react';

export function callScene(status:ServiceCallStatus,risk:boolean,unavailable:boolean){
 if(status.terminal)return {id:'ended',title:'이번 통화가 종료됐어요',detail:'새 연락에는 새로운 승인이 필요합니다.',focus:'recipient'};
 if(status.ending)return {id:'ending',title:'통화 종료를 확인하고 있어요',detail:'음성 전송은 차단했습니다. 서버 처리 결과를 기다립니다.',focus:'recipient'};
 if(status.error)return {id:'error',title:'연결을 확인하지 못했어요',detail:status.error,focus:'recipient'};
 if(status.analysisWithdrawn)return {id:'withdrawn',title:'음성 분석을 중단했어요',detail:status.active?'일반 통화는 계속됩니다. 원할 때 통화를 종료하세요.':'분석 동의를 철회했습니다. 통화 상태를 따로 확인하세요.',focus:'recipient'};
 if(unavailable)return {id:'unavailable',title:'음성 분석을 확인할 수 없어요',detail:'통화 연결과 분석 상태를 따로 확인하세요.',focus:'recipient'};
 if(risk)return {id:'risk',title:'위험 요구의 근거를 확인하세요',detail:'기관 승인이 있어도 위험한 요구에는 따르지 마세요.',focus:'recipient'};
 if(status.active&&status.analysis.startsWith('상대 발화 분석 결과 수신'))return {id:'analyzed',title:'위험 요구 분석을 확인하세요',detail:'제공된 발화에 대한 결과입니다. 통화 전체의 안전을 보장하지 않습니다.',focus:'recipient'};
 if(status.active&&/^(원격 음성 분석 연결 대기|상대 음성 전사|상대 발화 수정)/.test(status.analysis))return {id:'analyzing',title:'상대 음성을 분석하고 있어요',detail:'동의한 상대 음성을 전사하고 위험 요구의 근거를 확인합니다.',focus:'center'};
 if(status.active)return {id:'connected',title:'통화가 연결됐어요',detail:'음성 분석은 수신자가 별도로 선택합니다.',focus:'center'};
 if(status.accepting)return {id:'accepting',title:'연결 권한을 확인하고 있어요',detail:'수락한 연락의 양측 세션과 연결 증거를 검증합니다.',focus:'center'};
 if(status.incoming)return {id:'incoming',title:'연락을 수락할지 확인하세요',detail:'기관과 목적을 확인한 뒤 현재 역할의 수락 버튼을 사용하세요.',focus:'recipient'};
 if(status.dialing)return {id:'dialing',title:'상대 연결을 기다리고 있어요',detail:'발신 요청 후 상대방의 수락과 실제 연결을 기다립니다.',focus:'recipient'};
 return {id:'ready',title:'전화 한 통의 시작',detail:'배정 업무와 역할을 확인하고 연락을 준비하세요.',focus:'sender'};
}

export function DemoCallFlow({preparing,status,risk,unavailable,transcript,verification}:{preparing?:string|undefined;status:ServiceCallStatus;risk:boolean;unavailable:boolean;transcript:ReactNode;verification:ReactNode}){
 const phase=preparing?.includes('개별 연락 승인')?'authorizing':preparing?.includes('마이크')?'registering':'preparing';
 const scene=preparing&&!status.active&&!status.terminal&&!status.error&&!status.ending?{id:phase,title:preparing,detail:'현재 업무의 승인과 연결을 준비합니다.',focus:'center'}:callScene(status,risk,unavailable);
 return <div className={`demo-flow flow-surface demo-flow-${scene.id}`}>
  <div className="demo-flow-top flow-top"><span>연락 흐름</span><strong>{status.active?'통화 중':status.terminal?'통화 종료':status.ending?'종료 확인 중':status.incoming?'수신 연락':status.accepting?'연결 확인 중':'연락 준비'}</strong></div>
  <div className="motion-stage" aria-hidden="true"><div className="flow-halo"/><div className={`flow-track ${status.active?'connected':status.terminal?'ended':''}`}/><span className="flow-endpoint left">상담원</span><span className="flow-endpoint right">수신자</span><div className="flow-node"><img className="callsign-logo" src="/callsign-logo.png" alt="" width={56} height={56}/></div><span className="flow-node-label">CallSign</span>{['preparing','authorizing','registering','dialing','accepting','analyzing','ending','withdrawn'].includes(scene.id)&&<div key={scene.id} className={`demo-flow-packet flow-packet ${['preparing','authorizing','registering'].includes(scene.id)?'to-hub':scene.id==='accepting'||scene.id==='analyzing'?'from-recipient':'to-recipient'}`}><span className="moving-dot"/></div>}</div>
  <div className="demo-flow-copy flow-copy" role="status"><h2>{scene.title}</h2>{scene.id!=='ready'&&<p>{scene.detail}</p>}</div>
  {transcript}
  <dl className="demo-flow-statuses flow-statuses"><div><dt>연락 승인</dt><dd>{status.invitationVerified?'검증됨':'확인 전'}</dd></div><div><dt>통화 연결</dt><dd>{status.active?'연결됨':status.terminal?'종료':status.incoming?'수락 대기':'연결 전'}</dd></div><div><dt>음성 분석</dt><dd>{status.analysisWithdrawn?'철회됨':unavailable?'분석 불가':risk?'위험 근거 확인':status.analysis.startsWith('상대 발화 분석 결과 수신')?'결과 수신':'동의·결과 확인 전'}</dd></div></dl>
  <div className="demo-flow-contract"><ShieldCheck size={18}/><span>{status.invitationVerified?'기관 승인 서명 확인됨':'기관 승인 확인 전'} · 통화 내용의 안전 보장은 아닙니다.</span></div>
  <details className="demo-flow-details"><summary><AudioLines size={16}/>승인·연결·분석 상태</summary>{verification}</details>
 </div>;
}
