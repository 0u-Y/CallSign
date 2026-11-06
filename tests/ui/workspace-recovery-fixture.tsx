// Synthetic fetch responses only; no identity provider, backend or call.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {bankPolicy} from '@callsign/protocol';
import {ServicePage} from '../../apps/web/src/pages/Service';
const state={mode:'ok',reads:0};Object.assign(window,{fixture:state});
window.fetch=async input=>{const path=String(input).split('?')[0];
 if(path==='/api/v3/auth/start')return Response.json({error:{code:'ROLE_FORBIDDEN'}},{status:403});
 if(path==='/api/v3/auth/me')return Response.json({csrfToken:'synthetic',user:{id:'synthetic-manager',role:'institution'}});
 if(path==='/api/v3/workspace'){state.reads++;if(state.mode==='timeout')throw new DOMException('signal timed out','TimeoutError');return Response.json({actor:{userId:'synthetic-manager',role:'institution',institutionId:'fixture'},institutionUri:'https://fixture.invalid/bank',permissions:[],policy:bankPolicy,runtimePolicy:{},services:[],intents:[],attempts:[],credentials:[],analysisAvailability:{mode:'disabled',speech:false,model:false}});}
 if(path==='/api/v3/notifications')return Response.json({enabled:true,items:[]});
 throw Error('Unexpected fixture request');
};
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/demo/work']}><ServicePage/></MemoryRouter>);
