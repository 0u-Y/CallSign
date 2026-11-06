import Fastify from 'fastify';
import {expect,it} from 'vitest';
import {keccak256,stringToHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {hashCanonical} from '@callsign/protocol';
import {registerServiceManagement} from './service-management.js';
import {configurationTypedData,initialDirectory} from './configuration.js';
import {serviceFixture} from '../../../tests/unit/service-fixture.js';
import type {Actor} from './finals-model.js';
it('collects distinct approvals but keeps policy inactive until a matching confirmed event and current witness check',async()=>{
 const f=await serviceFixture(),accounts=[1,2,3].map(n=>privateKeyToAccount(`0x${String(n).padStart(64,'0')}`));let actor:Actor=f.institution;const app=Fastify();app.setErrorHandler((e,_r,p)=>p.code((e as {statusCode?:number}).statusCode??409).send({code:(e as Error).message}));
 registerServiceManagement(app,{authority:f.authority,actorFor:async()=>actor,approvers:accounts.map(a=>a.address),confirmKey:async()=>{throw new Error('NOT_USED');},confirmConfiguration:async()=>{throw new Error('NO_QUORUM_IN_FIXTURE');}});
 await f.store.transact(f.institution.institutionId,async r=>{r.registrationState='confirmed';r.directory={hash:`0x${hashCanonical(initialDirectory)}`,version:1,entries:initialDirectory};r.members['joint-user']={role:'approver',permissions:['governance.approve']};});
 let sequence=0;const post=(url:string,payload:unknown)=>app.inject({method:'POST',url,headers:{'idempotency-key':`configuration-${++sequence}`,'content-type':'application/json'},payload:JSON.stringify(payload)});
 try{
  const proposed=await post('/v3/management/configuration',{directory:initialDirectory,policy:{...(await f.store.read(f.institution.institutionId)).policy,version:2}});expect(proposed.statusCode).toBe(200);const {operation,request}=proposed.json();
  expect((await post('/v3/management/configuration/submit',{operation})).statusCode).toBe(409);
  actor={...f.institution,userId:'joint-user',role:'approver'};
  const sig=await Promise.all(accounts.slice(0,2).map(a=>a.signTypedData(configurationTypedData(20260914,`0x${'1'.repeat(40)}`,request))));
  expect((await post('/v3/management/configuration/approve',{operation,signature:sig[0]})).statusCode).toBe(200);expect((await post('/v3/management/configuration/approve',{operation,signature:sig[0]})).statusCode).toBe(409);expect((await post('/v3/management/configuration/approve',{operation,signature:sig[1]})).statusCode).toBe(200);
  actor=f.institution;expect((await post('/v3/management/configuration/submit',{operation})).statusCode).toBe(200);const record=await f.store.read(f.institution.institutionId);expect(record.policy.version).toBe(1);expect(record.configurationProposals![operation]!.status).toBe('submitted');expect(record.pendingEvents!.some(e=>e.kind==='institution.configure')).toBe(true);
  expect((await post('/v3/management/configuration/activate',{operation})).statusCode).toBe(409);
  await f.store.transact(f.institution.institutionId,async r=>{const p=r.configurationProposals![operation]!;p.status='confirmed';p.transactionHash='confirmed-fixture';p.block='12';r.observedEpoch='2';});
  expect((await post('/v3/management/configuration/activate',{operation})).json().code).toBe('NO_QUORUM_IN_FIXTURE');expect((await f.store.read(f.institution.institutionId)).policy.version).toBe(1);
 }finally{await app.close();}
});
it('blocks a normal manager from granting joint approval or modifying a joint approver',async()=>{const f=await serviceFixture(),app=Fastify();registerServiceManagement(app,{authority:f.authority,actorFor:async()=>f.institution,approvers:[],confirmKey:async()=>{throw new Error('NOT_USED');}});await f.store.transact(f.institution.institutionId,async r=>{r.members.joint={role:'approver',permissions:['governance.approve']};r.members['other-staff']={role:'institution',permissions:[]};});try{for(const userId of ['joint','other-staff']){const result=await app.inject({method:'POST',url:'/v3/management/member',headers:{'idempotency-key':`joint-${userId}`},payload:{userId,active:true,permissions:['governance.approve']}});expect(result.statusCode).toBeGreaterThanOrEqual(400);}}finally{await app.close();}});

it('requires fresh confirmation for directory-only activation and preserves the authority generation',async()=>{
 const f=await serviceFixture(),app=Fastify();let confirmed=false,checks=0;
 app.setErrorHandler((e,_r,p)=>p.code(409).send({code:(e as Error).message}));
 registerServiceManagement(app,{authority:f.authority,actorFor:async()=>f.institution,approvers:[],confirmKey:async()=>{throw new Error('NOT_USED');},confirmConfiguration:async()=>{checks++;if(!confirmed)throw new Error('WITNESS_REQUIRED');}});
 await f.store.transact(f.institution.institutionId,async r=>{r.registrationState='confirmed';r.directory={hash:`0x${hashCanonical(initialDirectory)}`,version:1,entries:initialDirectory};});
 const post=(url:string,payload:unknown)=>app.inject({method:'POST',url,headers:{'idempotency-key':crypto.randomUUID(),'content-type':'application/json'},payload:JSON.stringify(payload)});
 try{
  const response=await post('/v3/management/configuration',{directory:[{path:'/official',title:'Changed display title'}],policy:(await f.store.read(f.institution.institutionId)).policy});expect(response.statusCode).toBe(200);const {operation}=response.json();
  await f.store.transact(f.institution.institutionId,async r=>{const p=r.configurationProposals![operation]!;p.status='confirmed';p.transactionHash='fixture';p.block='12';});
  expect((await post('/v3/management/configuration/activate',{operation})).json().code).toBe('WITNESS_REQUIRED');expect((await f.store.read(f.institution.institutionId)).configurationProposals![operation]!.activatedAt).toBeUndefined();
  confirmed=true;expect((await post('/v3/management/configuration/activate',{operation})).json()).toEqual({active:true,newDelegationAndTrustPublicationRequired:false});const r=await f.store.read(f.institution.institutionId);expect(r.epoch).toBe('1');expect(r.policy.version).toBe(1);expect(r.configurationProposals![operation]!.activatedAt).toBeDefined();expect(checks).toBe(2);
 }finally{await app.close();}
});

it('records recovery activation only after installed-key and Witness confirmation succeeds',async()=>{
 const f=await serviceFixture(),app=Fastify();let confirmed=false;
 const {generateEd25519KeyPair}=await import('@callsign/protocol'),next=await generateEd25519KeyPair();
 app.setErrorHandler((e,_r,p)=>p.code(409).send({code:(e as Error).message}));
 registerServiceManagement(app,{authority:f.authority,actorFor:async()=>f.institution,approvers:[],confirmKey:async()=>{if(!confirmed)throw new Error('WITNESS_REQUIRED');}});
 const request={institutionId:keccak256(stringToHex(f.institution.institutionId)),expectedEpoch:'2',newAdministrator:`0x${'1'.repeat(40)}`,newApprovalPublicKey:`0x${Buffer.from(next.publicJwk.x!,'base64url').toString('hex')}`,newEmergencyStopper:`0x${'2'.repeat(40)}`,nonce:`0x${'c'.repeat(64)}`,deadline:'1800000300'};
 await f.store.transact(f.institution.institutionId,async r=>{r.status='suspended';r.recovery={hash:hashCanonical(request),request,submitted:true,signatures:{}};});
 const post=()=>app.inject({method:'POST',url:'/v3/management/activate-key',headers:{'idempotency-key':crypto.randomUUID()},payload:{kid:next.kid,publicKey:next.publicJwk,epoch:'3',version:2}});
 try{
  expect((await post()).json().code).toBe('WITNESS_REQUIRED');
  expect((await f.store.read(f.institution.institutionId)).recovery?.activation).toBeUndefined();
  confirmed=true;expect((await post()).statusCode).toBe(200);
  expect((await f.store.read(f.institution.institutionId)).recovery?.activation).toEqual({epoch:'3',keyVersion:2,verifiedAt:1800000000});
 }finally{await app.close();}
});
