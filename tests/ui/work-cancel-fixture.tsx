// Existing cancellation command, synthetic transport only.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkCancel} from '../../apps/web/src/components/WorkCancel';
const writes:unknown[]=[];Object.assign(window,{writes});
function Fixture(){const [busy,setBusy]=useState(false),[fail,setFail]=useState(true);return <><button onClick={()=>setFail(false)}>recover</button><WorkCancel intent={{id:'selected-work',recipientId:'synthetic-recipient'}} busy={busy} action={async fn=>{setBusy(true);try{await fn();}catch{/* Keep the confirmation on failed transport. */}finally{setBusy(false);}}} post={async(path,body)=>{writes.push({path,body});if(fail)throw Error('synthetic failure');}}/></>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
