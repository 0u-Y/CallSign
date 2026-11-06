import {useEffect,useState,type RefObject} from 'react';
import type {ServiceCallStatus} from '../lib/serviceCall.js';

export function DemoDirector({root,enabled,role,status,connected,scene,identity}:{root:RefObject<HTMLDivElement|null>;enabled:boolean;role?:string|undefined;status:ServiceCallStatus;connected:boolean;scene:number;identity?:string}){
 const [label,setLabel]=useState('업무를 선택하세요'),[ready,setReady]=useState(false);
 useEffect(()=>{
  if(!root.current||!enabled)return;const host=root.current;
  let held=false,locked=false;let actionTimer:ReturnType<typeof setTimeout>|undefined;const cues=new Set<HTMLElement>();
  function target():HTMLButtonElement|HTMLInputElement|null{
   if(document.querySelector('[role="dialog"]')||status.ending||status.accepting||status.terminal||status.error)return null;
   let selector='';
   if(!connected)selector='.contact-prepare';
   else if(!status.active)selector=role==='gateway'?'.call-dial':role==='recipient'&&status.incoming?'.call-accept':'';
   else if(role==='gateway')selector='.call-audio-source input[type=file]';
   else if(role==='recipient'){
    const choice=host.querySelector('.call-consent-keypad')?.getAttribute('data-choice');
    if(host.querySelector('.call-dial-screen'))return null;
    if(choice==='pending')selector='.call-keypad-toggle';
    else if(scene===2&&choice==='granted')selector='.call-analysis';
    else if(choice==='declined'||choice==='withdrawn'||status.analysis.startsWith('상대 발화 분석 결과 수신'))selector='.phone-end';
   }
   const button=selector?host.querySelector<HTMLButtonElement|HTMLInputElement>(selector):null;
   return button&&!button.matches(':disabled')&&button.getClientRects().length?button:null;
  }
  function refresh(){const t=target();setReady(!!t&&!locked);setLabel(locked?'조작 준비 중':t?(t instanceof HTMLInputElement?'녹음 파일 선택':t.getAttribute('aria-label')||t.textContent||'다음 조작'):role==='institution'?'발신은 상담원 창에서 진행하세요':connected&&!status.active&&role==='recipient'?'상담원 창에서 발신 대기':status.active?'수신자 창의 키패드 선택 또는 상대 발언 대기':'진행 중인 업무를 선택하세요');}
  function run(){const t=target();if(!t||locked)return;t.scrollIntoView({block:'nearest',behavior:'auto'});
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const area=t.closest('.demo-recipient')?'recipient':'sender';host.dataset.directorFocus=area;
   if(!reduced){const box=t.getBoundingClientRect(),cue=document.createElement('span');cue.className='recording-click-cue';cue.setAttribute('aria-hidden','true');cue.style.left=`${box.left+box.width*.72}px`;cue.style.top=`${box.top+box.height*.55}px`;cue.innerHTML='<svg viewBox="0 0 24 28"><path d="M3 2v20l5-5 4 8 4-2-4-8h8Z"/></svg>';document.body.append(cue);cues.add(cue);const animation=cue.animate([{opacity:0,transform:'translate(5px,7px)'},{opacity:1,transform:'translate(0,0)',offset:.2},{opacity:1,transform:'scale(.86)',offset:.5},{opacity:0,transform:'scale(1)'}],{duration:1050});animation.onfinish=()=>{cue.remove();cues.delete(cue);};}
   // File pickers require the current user gesture; stopping media/analysis must never wait for staging.
   const immediate=reduced||t instanceof HTMLInputElement||t.matches('.phone-end,.call-analysis,.service-end');
   if(immediate){t.click();refresh();return;}
   locked=true;refresh();actionTimer=setTimeout(()=>{actionTimer=undefined;if(t.isConnected&&target()===t&&!document.querySelector('[role="dialog"]'))t.click();locked=false;refresh();},520);
  }
  function down(event:KeyboardEvent){if(event.code!=='Space'||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.defaultPrevented)return;
   if(event.target instanceof Element&&event.target.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="dialog"]'))return;
   if(document.querySelector('[role="dialog"]'))return;
   event.preventDefault();if(event.repeat||held)return;held=true;run();
  }
  const up=(event:KeyboardEvent)=>{if(event.code==='Space')held=false;};const blur=()=>{held=false;};
  const observer=new MutationObserver(refresh);observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','data-choice']});
  host.addEventListener('callsign-director-step',run);document.addEventListener('keydown',down);document.addEventListener('keyup',up);window.addEventListener('blur',blur);refresh();
  return()=>{if(actionTimer)clearTimeout(actionTimer);for(const cue of cues){cue.getAnimations().forEach(a=>a.cancel());cue.remove();}delete host.dataset.directorFocus;observer.disconnect();host.removeEventListener('callsign-director-step',run);document.removeEventListener('keydown',down);document.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 },[root,enabled,role,status,connected,scene,identity]);
 if(!enabled)return null;
 return <div className="demo-director"><button className="button secondary" disabled={!ready} onClick={()=>root.current?.dispatchEvent(new Event('callsign-director-step'))}>Space · {label}</button><small>현재 로그인한 역할의 실제 조작 · 동의는 키패드에서 직접 선택</small></div>;
}
