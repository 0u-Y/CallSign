// Synthetic queue data; no backend or identity provider.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {bankPolicy} from '@callsign/protocol';
import {WorkManagement} from '../../apps/web/src/components/WorkManagement';
import type {Workspace} from '../../apps/web/src/lib/serviceWorkspace';
const workspace={actor:{userId:'manager',role:'institution',institutionId:'fixture'},institutionUri:'https://fixture.invalid/bank',permissions:['contact.manage'],policy:bankPolicy,runtimePolicy:{},services:[],credentials:[],attempts:[],intents:Array.from({length:26},(_,i)=>({id:`public-demo-shared-prefix-${String(i).padStart(8,'0')}`,recipientId:'customer-long-12345678',agentId:i%2?'agent-long-23456789':'agent-long-34567890',status:i%3?'open':'cancelled',serviceDid:'https://fixture.invalid/center'}))} as Workspace;
function Fixture(){const [selected,select]=useState('');return <MemoryRouter><div id="callsign-recording" className="app-shell demo-shell workpage"><main id="main"><article className="demo-workspace workspace demo-recording-work"><header className="demo-heading intro"><h1>업무 관리</h1><p>합성 fixture · 실제 통화 아님</p></header><WorkManagement workspace={workspace} active busy={false} selected={selected} select={select} recipient="" agent="" service="" setRecipient={()=>{}} setAgent={()=>{}} setService={()=>{}} create={async()=>{throw Error('Unexpected write')}} action={async fn=>{await fn()}} post={async()=>{throw Error('Unexpected write')}}/></article></main></div></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
