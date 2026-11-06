import {useEffect,type RefObject} from 'react';
import type {ServiceCallStatus} from '../lib/serviceCall.js';

export function DemoDirector({root,enabled,role,status,connected,scene,identity}:{root:RefObject<HTMLDivElement|null>;enabled:boolean;role?:string|undefined;status:ServiceCallStatus;connected:boolean;scene:number;identity?:string}){
 useEffect(()=>{const host=root.current;if(host)delete host.dataset.directorFocus;return()=>{if(host)delete host.dataset.directorFocus;};},[root,enabled,identity,scene,role,status.terminal]);
 useEffect(()=>{
  const host=root.current,shell=host?.closest<HTMLElement>('#callsign-recording');if(!host||!shell||!enabled)return;
  function update(){if(host!.dataset.directorFocus)shell!.dataset.attention=host!.dataset.directorFocus;else delete shell!.dataset.attention;}
  const focus=(event:Event)=>{const target=event.target;if(!(target instanceof Element)||!target.closest('button,input,select,textarea'))return;const area=target.closest('.demo-recipient')?'recipient':target.closest('.demo-institution')?'sender':target.closest('.demo-institution-strip')?'institution':undefined;if(area)host.dataset.directorFocus=area;};host.addEventListener('pointerdown',focus);host.addEventListener('focusin',focus);
  const observer=new MutationObserver(update);observer.observe(host,{attributes:true,attributeFilter:['data-director-focus']});update();
  return()=>{host.removeEventListener('pointerdown',focus);host.removeEventListener('focusin',focus);observer.disconnect();delete shell.dataset.attention;};
 },[root,enabled]);
 useEffect(()=>{
  if(!root.current||!enabled)return;const host=root.current;
  let held=false,locked=false;let focusTimer:ReturnType<typeof setTimeout>|undefined;let actionTimer:ReturnType<typeof setTimeout>|undefined;let releaseTimer:ReturnType<typeof setTimeout>|undefined;const cues=new Set<HTMLElement>();let cursor={x:innerWidth*.5,y:innerHeight*.5};
  function target():HTMLButtonElement|HTMLInputElement|null{
   if(document.querySelector('[role="dialog"]')||host.querySelector('.work-confirm')||status.dialing||status.ending||status.accepting||status.terminal||status.error)return null;
   let selector='';
   if(scene>=3)return null;
   if(!connected)selector='.contact-prepare';
   else if(!status.active)selector=role==='gateway'?'.call-dial':role==='recipient'&&status.incoming?'.call-accept':'';
   else if(role==='gateway')return null;
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
  function refresh(){/* The target is read at keydown; no filming control bar is rendered. */}
  function run(){const t=target();if(!t||locked)return;t.scrollIntoView({block:'nearest',behavior:'auto'});
   if(releaseTimer)clearTimeout(releaseTimer);
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const area=t.closest('.demo-recipient')?'recipient':t.closest('.demo-institution-strip')?'institution':'sender';const focusDelay=reduced?0:850;host.dataset.directorFocus=area;
   const box=t.getBoundingClientRect(),destination={x:box.left+box.width*.72,y:box.top+box.height*.55};
   if(!reduced){const cue=document.createElement('span');cue.className='recording-click-cue';cue.setAttribute('aria-hidden','true');cue.innerHTML='<svg viewBox="0 0 24 28"><path d="M3 2v20l5-5 4 8 4-2-4-8h8Z"/></svg>';document.body.append(cue);cues.add(cue);cue.animate([{left:`${cursor.x}px`,top:`${cursor.y}px`,opacity:0},{left:`${destination.x}px`,top:`${destination.y}px`,opacity:1}],{duration:850,fill:'forwards',easing:'ease-in-out'});cursor=destination;setTimeout(()=>{cue.remove();cues.delete(cue);},1700);}
   const perform=()=>{if(!t.isConnected||target()!==t||document.querySelector('[role="dialog"]')){locked=false;refresh();return;}
   if(!reduced){t.classList.add('recording-pressed');setTimeout(()=>t.classList.remove('recording-pressed'),400);}
   // Stopping media and analysis must never wait for staging.
   const immediate=reduced||t.matches('.phone-end,.call-analysis,.service-end');
   if(immediate){t.click();locked=false;releaseTimer=setTimeout(()=>{delete host.dataset.directorFocus;},1200);refresh();return;}
   actionTimer=setTimeout(()=>{actionTimer=undefined;if(t.isConnected&&target()===t&&!document.querySelector('[role="dialog"]'))t.click();locked=false;releaseTimer=setTimeout(()=>{delete host.dataset.directorFocus;},1200);refresh();},200);};
   locked=true;refresh();
   // Preserve the source's focus-then-pointer sequence, without delaying safety controls or user-gesture file pickers.
   if(focusDelay&&!t.matches('.phone-end,.call-analysis,.service-end'))focusTimer=setTimeout(()=>{focusTimer=undefined;perform();},focusDelay);else perform();
  }
  function down(event:KeyboardEvent){if(event.code!=='Space'||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.defaultPrevented)return;
   if(event.target instanceof Element&&event.target.closest('input,select,textarea,a,summary,[contenteditable]:not([contenteditable="false"]),[role="dialog"]'))return;
   if(document.querySelector('[role="dialog"]'))return;
   event.preventDefault();if(event.repeat||held)return;held=true;run();
  }
  const up=(event:KeyboardEvent)=>{if(event.code==='Space')held=false;};const blur=()=>{held=false;};
  const observer=new MutationObserver(refresh);observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','data-choice']});
  host.addEventListener('callsign-director-step',run);document.addEventListener('keydown',down);document.addEventListener('keyup',up);window.addEventListener('blur',blur);refresh();
  return()=>{if(focusTimer)clearTimeout(focusTimer);if(actionTimer)clearTimeout(actionTimer);if(releaseTimer)clearTimeout(releaseTimer);for(const cue of cues){cue.getAnimations().forEach(a=>a.cancel());cue.remove();}observer.disconnect();host.removeEventListener('callsign-director-step',run);document.removeEventListener('keydown',down);document.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 // Polling replaces the status object; only actionable changes may cancel the focus/click sequence.
 },[root,enabled,role,status.active,status.incoming,status.dialing,status.ending,status.accepting,status.terminal,status.error,status.analysis,connected,scene,identity]);
 return null;
}
