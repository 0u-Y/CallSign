import {useEffect,useState,type RefObject} from 'react';
import type {ServiceCallStatus} from '../lib/serviceCall.js';

export function DemoDirector({root,enabled,role,status,connected,scene,identity}:{root:RefObject<HTMLDivElement|null>;enabled:boolean;role?:string|undefined;status:ServiceCallStatus;connected:boolean;scene:number;identity?:string}){
 const [label,setLabel]=useState('업무를 선택하세요'),[ready,setReady]=useState(false);
 useEffect(()=>{const host=root.current;if(host)delete host.dataset.directorFocus;return()=>{if(host)delete host.dataset.directorFocus;};},[root,enabled,identity,scene,role,status.terminal]);
 useEffect(()=>{
  const host=root.current,shell=host?.closest<HTMLElement>('#callsign-recording');if(!host||!shell||!enabled)return;
  const masks=['sender','recipient','institution'].map(role=>{const mask=document.createElement('div');mask.className='attention-mask';mask.dataset.role=role;mask.setAttribute('aria-hidden','true');shell.append(mask);return mask;});let frame=0;
  function position(){for(const mask of masks){const selector=mask.dataset.role==='sender'?'.demo-institution':mask.dataset.role==='recipient'?'.demo-recipient':'.demo-institution-strip';const area=host!.querySelector<HTMLElement>(selector);if(!area||!area.getClientRects().length){mask.style.display='none';continue;}const box=area.getBoundingClientRect();Object.assign(mask.style,{display:'block',left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`,borderRadius:getComputedStyle(area).borderRadius});}}
  function follow(){cancelAnimationFrame(frame);const until=performance.now()+1150;const tick=()=>{position();if(performance.now()<until)frame=requestAnimationFrame(tick);};tick();}
  function update(){if(host!.dataset.directorFocus)shell!.dataset.attention=host!.dataset.directorFocus;else delete shell!.dataset.attention;follow();}
  const focus=(event:Event)=>{const target=event.target;if(!(target instanceof Element)||!target.closest('button,input,select,textarea'))return;const area=target.closest('.demo-recipient')?'recipient':target.closest('.demo-institution')?'sender':target.closest('.demo-institution-strip')?'institution':undefined;if(area)host.dataset.directorFocus=area;};host.addEventListener('pointerdown',focus);host.addEventListener('focusin',focus);
  const observer=new MutationObserver(update);observer.observe(host,{attributes:true,attributeFilter:['data-director-focus']});window.addEventListener('resize',follow);window.addEventListener('scroll',position,true);update();
  return()=>{host.removeEventListener('pointerdown',focus);host.removeEventListener('focusin',focus);observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',follow);window.removeEventListener('scroll',position,true);masks.forEach(m=>m.remove());delete shell.dataset.attention;};
 },[root,enabled]);
 useEffect(()=>{
  if(!root.current||!enabled)return;const host=root.current;
  let held=false,locked=false;let focusTimer:ReturnType<typeof setTimeout>|undefined;let actionTimer:ReturnType<typeof setTimeout>|undefined;const cues=new Set<HTMLElement>();
  function target():HTMLButtonElement|HTMLInputElement|null{
   if(document.querySelector('[role="dialog"]')||host.querySelector('.work-confirm')||status.dialing||status.ending||status.accepting||status.terminal||status.error)return null;
   let selector='';
   if(role==='institution'&&scene===3)selector='.work-cancel-open';
   else if(!connected)selector='.contact-prepare';
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
  function refresh(){const t=target();setReady(!!t&&!locked);setLabel(locked?'조작 준비 중':t?(t instanceof HTMLInputElement?'녹음 파일 선택':t.getAttribute('aria-label')||t.textContent||'다음 조작'):host.querySelector('.work-confirm')?'영향 범위를 확인하고 취소 요청을 직접 선택하세요':status.dialing?'수신자 창에서 수락 대기':role==='institution'?'발신은 상담원 창에서 진행하세요':connected&&!status.active&&role==='recipient'?'상담원 창에서 발신 대기':status.active?'수신자 창의 키패드 선택 또는 상대 발언 대기':'진행 중인 업무를 선택하세요');}
  function run(){const t=target();if(!t||locked)return;t.scrollIntoView({block:'nearest',behavior:'auto'});
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const area=t.closest('.demo-recipient')?'recipient':t.closest('.demo-institution-strip')?'institution':'sender';const focusDelay=!reduced&&host.dataset.directorFocus!==area?950:0;host.dataset.directorFocus=area;
   const perform=()=>{if(!t.isConnected||target()!==t||document.querySelector('[role="dialog"]')){locked=false;refresh();return;}
   if(!reduced){const box=t.getBoundingClientRect(),cue=document.createElement('span');cue.className='recording-click-cue';cue.setAttribute('aria-hidden','true');cue.style.left=`${box.left+box.width*.72}px`;cue.style.top=`${box.top+box.height*.55}px`;cue.innerHTML='<svg viewBox="0 0 24 28"><path d="M3 2v20l5-5 4 8 4-2-4-8h8Z"/></svg>';document.body.append(cue);cues.add(cue);const animation=cue.animate([{opacity:0,transform:'translate(5px,7px)'},{opacity:1,transform:'translate(0,0)',offset:.2},{opacity:1,transform:'scale(.86)',offset:.5},{opacity:0,transform:'scale(1)'}],{duration:1050});animation.onfinish=()=>{cue.remove();cues.delete(cue);};}
   // File pickers require the current user gesture; stopping media/analysis must never wait for staging.
   const immediate=reduced||t instanceof HTMLInputElement||t.matches('.phone-end,.call-analysis,.service-end');
   if(immediate){t.click();locked=false;refresh();return;}
   actionTimer=setTimeout(()=>{actionTimer=undefined;if(t.isConnected&&target()===t&&!document.querySelector('[role="dialog"]'))t.click();locked=false;refresh();},520);};
   locked=true;refresh();
   // Preserve the source's focus-then-pointer sequence, without delaying safety controls or user-gesture file pickers.
   if(focusDelay&&!(t instanceof HTMLInputElement)&&!t.matches('.phone-end,.call-analysis,.service-end'))focusTimer=setTimeout(()=>{focusTimer=undefined;perform();},focusDelay);else perform();
  }
  function down(event:KeyboardEvent){if(event.code!=='Space'||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.defaultPrevented)return;
   if(event.target instanceof Element&&event.target.closest('input,select,textarea,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="dialog"]'))return;
   if(document.querySelector('[role="dialog"]'))return;
   event.preventDefault();if(event.repeat||held)return;held=true;run();
  }
  const up=(event:KeyboardEvent)=>{if(event.code==='Space')held=false;};const blur=()=>{held=false;};
  const observer=new MutationObserver(refresh);observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','data-choice']});
  host.addEventListener('callsign-director-step',run);document.addEventListener('keydown',down);document.addEventListener('keyup',up);window.addEventListener('blur',blur);refresh();
  return()=>{if(focusTimer)clearTimeout(focusTimer);if(actionTimer)clearTimeout(actionTimer);for(const cue of cues){cue.getAnimations().forEach(a=>a.cancel());cue.remove();}observer.disconnect();host.removeEventListener('callsign-director-step',run);document.removeEventListener('keydown',down);document.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 },[root,enabled,role,status,connected,scene,identity]);
 if(!enabled)return null;
 return <div className="demo-director"><button className="button secondary" disabled={!ready} onClick={()=>root.current?.dispatchEvent(new Event('callsign-director-step'))}>Space · {label}</button><small>현재 로그인한 역할의 실제 조작 · 동의는 키패드에서 직접 선택</small></div>;
}
