// Synthetic component lifecycle; no API, microphone, provider, or PBX.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CallConsentKeypad} from '../../apps/web/src/components/CallConsentKeypad';
const state={calls:[] as boolean[],resolve:undefined as undefined|(()=>void),voiceStarts:0,voiceStops:0};
Object.assign(window,{keypadFixture:state});
function Fixture(){const [active,setActive]=useState(true),[available,setAvailable]=useState(true),[id,setId]=useState(1),[withdrawn,setWithdrawn]=useState(false);
 return <><button onClick={()=>setActive(false)}>fixture end</button><button onClick={()=>setAvailable(false)}>fixture off</button><button onClick={()=>setId(x=>x+1)}>fixture next</button><div className="demo-workspace"><div className="demo-recipient demo-phone-live"><CallConsentKeypad key={id} onEnd={()=>setActive(false)} active={active} connected={active} available={available} withdrawn={withdrawn} onVoiceStart={()=>{state.voiceStarts++;return()=>{state.voiceStops++;};}} onConsent={value=>{state.calls.push(value);if(!value)setWithdrawn(true);return value?new Promise<void>(r=>{state.resolve=r;}):Promise.resolve();}}/></div></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
