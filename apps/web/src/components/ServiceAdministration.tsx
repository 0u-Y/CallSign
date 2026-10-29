import {ConfigurationReviewPanel,type ConfigurationManagement} from './ConfigurationReviewPanel.js';
import { useEffect,useRef,useState } from 'react';
import { api } from '../lib/api.js';
interface Management extends ConfigurationManagement {members:Array<{id:string;role:string;active?:boolean}>;epoch:string;observedEpoch?:string}
export function ServiceAdministration({permissions,action,post}:{permissions:string[];action:(fn:()=>Promise<unknown>)=>Promise<void>;post:<T=unknown>(path:string,body:unknown)=>Promise<T>}){
 const [state,setState]=useState<Management>();
 const [issuer,setIssuer]=useState(''),[subject,setSubject]=useState(''),[name,setName]=useState(''),[role,setRole]=useState('recipient'),[service,setService]=useState(''),[active,setActive]=useState(true),[grants,setGrants]=useState<string[]>([]);
 const [failure,setFailure]=useState('');const alive=useRef(true),polling=useRef(false);
 async function load(){if(polling.current)return;polling.current=true;try{const next=await api<Management>('/v3/management',{signal:AbortSignal.timeout(5000)});if(alive.current){setState(next);setFailure('');}}catch{if(alive.current)setFailure('관리 상태를 조회하지 못했습니다. 변경이 확정됐다고 간주하지 마세요.');}finally{polling.current=false;}}
 useEffect(()=>{alive.current=true;void load();const timer=setInterval(()=>void load(),3000);return()=>{alive.current=false;clearInterval(timer);};},[]);
 const manage=permissions.includes('institution.recover');
 return <section className="finals-controls"><h2>계정 등록 · 공동 정책 변경</h2>{failure&&<p role="alert">{failure}</p>}
 {manage&&<fieldset><legend>외부 로그인 계정과 내부 소속 연결</legend><p>외부 로그인 제공자에서 계정을 먼저 준비하세요. 기관이 지정한 issuer와 정확한 subject를 등록합니다. 이메일·이름으로 권한을 연결하지 않습니다. 신규·변경 계정은 다시 로그인해야 합니다.</p>
 <label>등록된 OIDC issuer<input value={issuer} onChange={e=>setIssuer(e.target.value)} type="url"/></label><label>계정 subject<input value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>표시 이름<input value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>역할<select value={role} onChange={e=>{setRole(e.target.value);setGrants([]);}}><option value="recipient">수신자</option><option value="gateway">상담원</option><option value="institution">기관 담당자</option></select></label>{role==='gateway'&&<label>등록된 콜센터 URI<input value={service} onChange={e=>setService(e.target.value)}/></label>}
 <label><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>활성 계정</label>{role==='institution'&&permissions.filter(p=>p!=='governance.approve').map(p=><label key={p}><input type="checkbox" checked={grants.includes(p)} onChange={e=>setGrants(e.target.checked?[...grants,p]:grants.filter(v=>v!==p))}/>{p}</label>)}
 <button className="button secondary" disabled={!issuer||!subject||!name} onClick={()=>void action(async()=>{await post('/v3/management/accounts',{issuer,subject,displayName:name,role,active,permissions:grants,...(role==='gateway'?{serviceUri:service}:{})});await load();})}>계정 등록·변경 및 이전 세션 회수</button><p>공동 승인자는 이 화면에서 생성하거나 권한을 부여할 수 없습니다. 공동 승인자의 키 등록은 별도 초기 신뢰 설정 절차를 따릅니다.</p>
 {state&&<ul>{state.members.map(m=><li key={m.id}>{m.id} · {m.role} · {m.active===false?'비활성':'활성'}</li>)}</ul>}</fieldset>}
 <ConfigurationReviewPanel state={state} permissions={permissions} action={action} post={post} reload={load}/></section>;
}
