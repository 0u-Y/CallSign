import {useEffect,useRef,useState} from 'react';
import {api,setCsrfToken} from '../lib/api.js';
import {completeLogin} from '../lib/loginCompletion.js';
import {rememberLoginReturn,takeLoginReturn} from '../lib/loginReturn.js';

type Role='gateway'|'recipient'|'institution';
type Session={csrfToken:string;user:{id:string}};
export function FilmingPage(){
 const frames=useRef<Record<Role,HTMLIFrameElement|null>>({gateway:null,recipient:null,institution:null});
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false);
 const locked=useRef(false);
 async function check(){
  const session=await api<Session>('/v3/auth/me?purpose=work');setCsrfToken(session.csrfToken);
  const workspace=await api<{actor:{role:string}}>('/v3/workspace',{headers:{'x-callsign-filming-role':'gateway'}});
  if(workspace.actor.role!=='gateway')throw new Error('촬영 역할을 확인할 수 없습니다.');
  setReady(true);setError('');
 }
 useEffect(()=>{let live=true;const params=new URLSearchParams(location.search),code=params.get('code'),state=params.get('state');if(code&&state)history.replaceState(null,'',location.pathname);
  void (async()=>{if(code&&state){await completeLogin(code,state);takeLoginReturn(state,sessionStorage);}await check();})().catch(e=>{if(live){setReady(false);setError(e instanceof Error?e.message:'촬영자 인증이 필요합니다.');}});
  return()=>{live=false;};},[]);
 async function login(){if(busy)return;setBusy(true);setError('');try{const r=await api<{url:string}>('/v3/auth/start',{method:'POST',body:JSON.stringify({official:false})});rememberLoginReturn(r.url,'/demo/filming',sessionStorage);location.assign(r.url);}catch(e){setError(e instanceof Error?e.message:'로그인 시작 실패');setBusy(false);}}
 function next(){if(locked.current||!ready)return;const candidates:[Role,string][]= [['gateway','.contact-prepare'],['recipient','.contact-prepare'],['gateway','.call-dial'],['recipient','.call-accept']];
  for(const [role,selector] of candidates){const doc=frames.current[role]?.contentDocument;if(!doc)continue;const button=doc.querySelector<HTMLButtonElement>(selector);if(!button||button.disabled||!button.getClientRects().length)continue;
   if(role==='recipient'&&selector==='.contact-prepare'){const gateway=frames.current.gateway?.contentDocument;if(!gateway?.querySelector('.call-dial:not(:disabled)'))continue;}
   if(role==='gateway'&&selector==='.call-dial'){const receiver=frames.current.recipient?.contentDocument;if(!receiver?.querySelector('.call-accept:not(:disabled)'))continue;}
   locked.current=true;button.click();setTimeout(()=>{locked.current=false;},1200);return;
  }
 }
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.code==='KeyF'&&!e.repeat){e.preventDefault();setRecording(v=>!v);return;}if(e.code==='Escape'){setRecording(false);return;}if(e.code!=='Space'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||!ready)return;if(e.target instanceof Element&&e.target.closest('input,select,textarea,summary,[contenteditable], [role="dialog"]'))return;e.preventDefault();next();};
  const onMessage=(e:MessageEvent)=>{if(e.origin!==location.origin||!Object.values(frames.current).some(f=>f?.contentWindow===e.source)||typeof e.data!=='string')return;if(e.data==='callsign-filming-Space')next();else if(e.data==='callsign-filming-KeyF')setRecording(v=>!v);else if(e.data==='callsign-filming-Escape')setRecording(false);};
  document.addEventListener('keydown',onKey);window.addEventListener('message',onMessage);return()=>{document.removeEventListener('keydown',onKey);window.removeEventListener('message',onMessage);};},[ready]);
 return <div className={`filming-page${recording?' recording':''}`}><header><h1>CallSign 촬영 화면</h1><span>실제 업무·통화·분석 상태</span><button className="button quiet" onClick={()=>setRecording(v=>!v)}>{recording?'준비 화면':'촬영 화면'}</button></header>
 {!ready?<section className="filming-login"><h2>촬영자 인증</h2><p>지정된 합성 기관 촬영자만 이용할 수 있습니다.</p>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy} onClick={()=>void login()}>촬영자 로그인</button><button className="button secondary" onClick={()=>void check().catch(e=>setError(String(e)))}>다시 확인</button></section>:<><section className="filming-grid" aria-label="통합 연락 화면"><iframe title="상담원과 연락 흐름" ref={e=>{frames.current.gateway=e;}} src="/filming/gateway" allow="microphone; autoplay"/><iframe title="수신자 휴대폰" ref={e=>{frames.current.recipient=e;}} src="/filming/recipient" allow="autoplay"/></section><details className="filming-management"><summary>기관 업무·공동 관리</summary><iframe title="기관 관리" ref={e=>{frames.current.institution=e;}} src="/filming/institution"/></details><p className="filming-footnote">Space: 다음 실제 조작 · 수락 후 분석 동의는 수신자 화면에서 직접 선택합니다. 통화 종료와 철회는 각 화면에서 언제든 누를 수 있습니다.</p></>}
 </div>;
}
