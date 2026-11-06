import {useEffect,useState,type RefObject} from 'react';
import type {ServiceCallStatus} from '../lib/serviceCall.js';

export function DemoDirector({root,enabled,role,status,connected,scene}:{root:RefObject<HTMLDivElement|null>;enabled:boolean;role?:string|undefined;status:ServiceCallStatus;connected:boolean;scene:number}){
 const [label,setLabel]=useState('업무를 선택하세요'),[ready,setReady]=useState(false);
 useEffect(()=>{
  if(!root.current||!enabled)return;const host=root.current;
  let held=false;
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
  function refresh(){const t=target();setReady(!!t);setLabel(t?(t instanceof HTMLInputElement?'녹음 파일 선택':t.getAttribute('aria-label')||t.textContent||'다음 조작'):status.active?'상대 역할의 발언 또는 키패드 선택을 기다립니다':'업무 선택 또는 상대 역할의 준비를 확인하세요');}
  function run(){const t=target();if(t){t.scrollIntoView({block:'nearest',behavior:'auto'});t.click();}refresh();}
  function down(event:KeyboardEvent){if(event.code!=='Space'||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.defaultPrevented)return;
   if(event.target instanceof Element&&event.target.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="dialog"]'))return;
   if(document.querySelector('[role="dialog"]'))return;
   event.preventDefault();if(event.repeat||held)return;held=true;run();
  }
  const up=(event:KeyboardEvent)=>{if(event.code==='Space')held=false;};const blur=()=>{held=false;};
  const observer=new MutationObserver(refresh);observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','data-choice']});
  host.addEventListener('callsign-director-step',run);document.addEventListener('keydown',down);document.addEventListener('keyup',up);window.addEventListener('blur',blur);refresh();
  return()=>{observer.disconnect();host.removeEventListener('callsign-director-step',run);document.removeEventListener('keydown',down);document.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 },[root,enabled,role,status,connected,scene]);
 if(!enabled)return null;
 return <div className="demo-director"><button className="button secondary" disabled={!ready} onClick={()=>root.current?.dispatchEvent(new Event('callsign-director-step'))}>Space · {label}</button><small>현재 로그인한 역할의 실제 조작 · 동의는 키패드에서 직접 선택</small></div>;
}
