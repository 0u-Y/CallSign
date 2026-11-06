export const consentVoiceText = '외부 음성 분석 동의는 1번, 미동의는 2번입니다.';
export type ConsentVoiceResult = {state:'ended';durationMs:number}|{state:'unavailable'};

// Playback is local output only; never attach this voice to a media destination or recorder.
export function playConsentVoice(done:(result:ConsentVoiceResult)=>void):()=>void {
  if(typeof speechSynthesis==='undefined'||typeof SpeechSynthesisUtterance==='undefined'){
    done({state:'unavailable'});return()=>{};
  }
  const voice=speechSynthesis.getVoices().find(v=>v.localService&&/^ko(?:-|$)/i.test(v.lang));
  if(!voice){done({state:'unavailable'});return()=>{};}
  const utterance=new SpeechSynthesisUtterance(consentVoiceText);
  utterance.voice=voice;utterance.lang='ko-KR';utterance.rate=1.1;
  let stopped=false,started:number|undefined;
  const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);utterance.onstart=null;utterance.onend=null;utterance.onerror=null;speechSynthesis.cancel();};
  const finish=(result:ConsentVoiceResult)=>{if(stopped)return;stop();done(result);};
  const timer=setTimeout(()=>finish({state:'unavailable'}),15000);
  utterance.onstart=()=>{started=performance.now();};
  utterance.onend=()=>finish(started===undefined?{state:'unavailable'}:{state:'ended',durationMs:performance.now()-started});
  utterance.onerror=()=>finish({state:'unavailable'});
  try{speechSynthesis.speak(utterance);}catch{finish({state:'unavailable'});}
  return stop;
}
