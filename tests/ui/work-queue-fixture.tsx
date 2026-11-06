// Synthetic queue data; no backend or identity provider.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {bankPolicy} from '@callsign/protocol';
import {WorkManagement} from '../../apps/web/src/components/WorkManagement';
import type {Workspace} from '../../apps/web/src/lib/serviceWorkspace';
const workspace={actor:{userId:'manager',role:'institution',institutionId:'fixture'},institutionUri:'https://fixture.invalid/bank',permissions:['contact.manage'],policy:bankPolicy,runtimePolicy:{},services:[],credentials:[],attempts:[],intents:Array.from({length:26},(_,i)=>({id:`public-demo-shared-prefix-${String(i).padStart(8,'0')}`,recipientId:'customer-long-12345678',agentId:i%2?'agent-long-23456789':'agent-long-34567890',status:i%3?'open':'cancelled',serviceDid:'https://fixture.invalid/center'}))} as Workspace;
function Fixture(){const [selected,select]=useState('');return <MemoryRouter><main className="demo-workspace"><WorkManagement workspace={workspace} active busy={false} selected={selected} select={select} recipient="" agent="" service="" setRecipient={()=>{}} setAgent={()=>{}} setService={()=>{}} create={async()=>{throw Error('Unexpected write')}} action={async fn=>{await fn()}} post={async()=>{throw Error('Unexpected write')}}/></main></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
