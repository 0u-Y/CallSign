import * as Dialog from '@radix-ui/react-dialog';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Mic,MicOff,Grid3X3,Volume2,Phone} from 'lucide-react';
import {playConsentVoice} from '../lib/consentVoice.js';

export function CallConsentKeypad({active,connected,available,withdrawn,onConsent,onVoiceStart,onEnd,muted=false,onMute,outputSupported=false,onOutput}:{active:boolean;connected:boolean;available:boolean;withdrawn:boolean;onConsent:(value:boolean)=>Promise<void>;onVoiceStart?:()=>()=>void;onEnd:()=>void;muted?:boolean;onMute?:()=>void;outputSupported?:boolean;onOutput?:()=>void}){
 const [open,setOpen]=useState(false),[choice,setChoice]=useState<'pending'|'granted'|'declined'|'withdrawn'>('pending'),[pending,setPending]=useState(false),[voice,setVoice]=useState(''),[error,setError]=useState(''),[digit,setDigit]=useState('');
 const generation=useRef(0),inflight=useRef(false),withdrawing=useRef(false),stopVoice=useRef<()=>void>(()=>{}),restoreInput=useRef<()=>void>(()=>{}),keypadButton=useRef<HTMLButtonElement>(null),announced=useRef(false),wasOpen=useRef(false);
 const stop=()=>{stopVoice.current();stopVoice.current=()=>{};restoreInput.current();restoreInput.current=()=>{};};
 function replay(){stop();restoreInput.current=onVoiceStart?.()??(()=>{});setVoice('안내 재생 중 · 선택은 바로 할 수 있습니다.');stopVoice.current=playConsentVoice(result=>{restoreInput.current();restoreInput.current=()=>{};setVoice(result.state==='ended'?`안내 완료 (${(result.durationMs/1000).toFixed(1)}초)`:'음성 안내 불가 · 문자 안내로 선택하세요.');});}
 useEffect(()=>{if(active&&!announced.current){announced.current=true;replay();}if(!active){generation.current++;inflight.current=false;setPending(false);stop();setOpen(false);}return()=>{generation.current++;stop();};},[active]);
 useEffect(()=>{if(withdrawn&&choice!=='declined'){generation.current++;inflight.current=false;setPending(false);setChoice('withdrawn');stop();}},[withdrawn]);
 async function choose(value:boolean){if(!active||inflight.current||value&&!available)return;stop();const g=++generation.current;inflight.current=true;setPending(true);setError('');if(!value)setChoice('declined');try{await onConsent(value);if(g===generation.current){setChoice(value?'granted':'declined');setOpen(false);}}catch{if(g===generation.current)setError('동의 상태를 확인하지 못했습니다. 분석은 성공으로 표시하지 않습니다.');}finally{if(g===generation.current){inflight.current=false;setPending(false);}}}
 function withdraw(){if(withdrawing.current)return;withdrawing.current=true;const g=++generation.current;inflight.current=false;setPending(false);stop();setChoice('withdrawn');setOpen(false);void onConsent(false).catch(()=>{if(g===generation.current)setError('전송은 중단했습니다. 서버 철회 확인에 실패했습니다.');}).finally(()=>{withdrawing.current=false;});}
 useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[open]);
 useLayoutEffect(()=>{if(!open&&wasOpen.current)keypadButton.current?.focus();wasOpen.current=open;},[open]);
 const selecting=choice==='pending';
 const processingDetails=<><p>동의하면 이 통화의 상대 음성을 Deepgram에, 전사와 승인 정책을 OpenAI에 전송해 네 유형의 위험 요구를 분석합니다. 동의하지 않아도 통화할 수 있고 언제든 철회할 수 있습니다. 이미 전송된 요청의 제공자 처리는 철회 후에도 진행될 수 있습니다. 기관 승인은 통화 내용의 안전 보장이 아닙니다.</p><p>웹 키패드 선택입니다. PBX DTMF나 전화망 ARS가 아닙니다.</p></>;
 if(!connected)return <p className="call-consent-idle" role="status">통화 연결 후 분석을 선택할 수 있습니다.</p>;
 return <section className="call-consent-keypad" data-choice={choice} aria-label="음성 분석 선택">
  <div className="consent-feedback" hidden={open}>
   {pending&&!open&&<p role="status">서버 동의 확인 중</p>}
   {choice==='declined'&&<><h3>분석 없이 통화해요</h3><p role="status">미동의 · 일반 통화 유지</p></>}
   {choice==='withdrawn'&&<p role="status">분석 철회 · 일반 통화 유지</p>}
   {choice==='granted'&&<p className="consent-granted" role="status">분석 동의 확인됨</p>}
   {selecting&&<p className="consent-voice-status" role="status">{voice}</p>}
   {!available&&<p role="status">분석 제공자가 꺼져 있거나 현재 사용할 수 없습니다.</p>}
   {error&&<p role="alert">{error}</p>}
   {active&&(choice==='declined'||choice==='withdrawn')&&<button className="button secondary" onClick={()=>{setChoice('pending');setDigit('');setError('');replay();}}>안내 확인 후 다시 선택</button>}
   <Dialog.Root><Dialog.Trigger asChild><button className="button quiet consent-information">{selecting?'안내문 보기':'음성 분석 처리 안내'}</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="demo-drawer-overlay"/><Dialog.Content className="consent-information-dialog"><Dialog.Title>음성 분석 안내</Dialog.Title><Dialog.Description>외부 음성 분석 동의는 1번, 미동의는 2번입니다.</Dialog.Description>{processingDetails}<Dialog.Close asChild><button className="button primary">안내 확인</button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
   {selecting&&voice.startsWith('음성 안내 불가')&&<button className="button quiet" onClick={replay}>다시 재생</button>}
  </div>
  <div className="phone-media-buttons" hidden={open}>
   <button className="button phone-round" aria-label={muted?'음소거 해제':'음소거'} aria-pressed={muted} disabled={!connected||!onMute} onClick={onMute}><span className="phone-control-icon">{muted?<MicOff aria-hidden="true"/>:<Mic aria-hidden="true"/>}</span><span>음소거</span></button>
   <button ref={keypadButton} className="button secondary call-keypad-toggle" disabled={!active} aria-expanded={open} onClick={()=>setOpen(true)} aria-label="키패드"><span className="phone-control-icon"><Grid3X3 aria-hidden="true"/></span><span>키패드</span></button>
   <button className="button phone-round" aria-label="음성 출력 선택" disabled={!active||!outputSupported} title={outputSupported?'실제 출력 장치 선택':'출력 전환 미지원 · 기기 음성 설정을 사용하세요.'} onClick={onOutput}><span className="phone-control-icon"><Volume2 aria-hidden="true"/></span><span>스피커</span></button>
  </div>
  {open&&<section className="call-dial-screen" aria-label="통화 키패드">
   <output className="call-keypad-digit" aria-label="선택 번호">{digit||'번호 선택'}</output>
   <p role="status">{pending?'서버 동의 확인 중':'1 동의 · 2 미동의 · 9 다시 듣기'}</p>{error&&<p role="alert">{error}</p>}
   <div className="call-keypad-grid">{['1','2','3','4','5','6','7','8','9','*','0','#'].map((d,i)=><button key={d} className="button" disabled={!active||pending||d!=='9'&&!selecting||d==='1'&&!available} aria-label={d==='1'?'1번 동의':d==='2'?'2번 미동의':d==='9'?'9번 다시 듣기':`${d}번 안내 선택 없음`} onClick={()=>{setDigit(d);if(d==='9'){setOpen(false);replay();}else if(d==='1'||d==='2')void choose(d==='1');else setError('분석 동의는 1번, 미동의는 2번입니다.');}}><span>{d}</span><small>{['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+',''][i]}</small></button>)}</div>
   <div className="call-dial-footer"><button className="button service-end" onClick={onEnd} aria-label="통화 종료"><span className="phone-control-icon"><Phone aria-hidden="true"/></span><span>통화 종료</span></button><button className="button quiet" onClick={()=>setOpen(false)}>가리기</button></div>
   <button className="button quiet call-withdraw" disabled={!connected} onClick={withdraw}>분석 동의 철회·삭제</button>
  </section>}
  {!open&&<><button className="button service-end phone-end" disabled={!connected} onClick={onEnd} aria-label="통화 종료"><span className="phone-control-icon"><Phone aria-hidden="true"/></span><span>통화 종료</span></button><button className="button quiet call-analysis" disabled={!connected} onClick={withdraw}>분석 동의 철회·삭제</button></>}
 </section>;
}
