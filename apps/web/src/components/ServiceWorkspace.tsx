import type {ReactNode} from 'react';
import {Headphones,Phone,ClipboardList,ShieldCheck} from 'lucide-react';

export function ServiceWorkspace({role,roleName,account,notice,queue,contact,verification,controls,analysis,operations,notifications,audio}:{role?:string|undefined;roleName:string;account:ReactNode;notice:ReactNode;queue:ReactNode;contact:ReactNode;verification:ReactNode;controls:ReactNode;analysis:ReactNode;operations:ReactNode;notifications:ReactNode;audio:ReactNode;transcript?:ReactNode;evidence?:ReactNode;outcome?:ReactNode;work?:ReactNode;workActive?:boolean}){
 const operator=role==='institution'||role==='gateway',approver=role==='approver';
 const title=role==='institution'?'연락 업무':role==='gateway'?'상담 업무':approver?'공동 승인':'기관 승인 연락';
 const Icon=role==='institution'?ClipboardList:role==='gateway'?Headphones:approver?ShieldCheck:Phone;
 return <div className={`service-app service-workspace ${!role?'is-login':operator?'is-operator':'is-receiver'}`}>
  <header className="workspace-toolbar"><div className="workspace-title"><Icon size={25} aria-hidden="true"/><div><h1>{title}</h1><p>현재 역할: {roleName}</p></div></div><div className="workspace-account">{account}</div></header>
  {notice}
  {approver?<div className="workspace-governance">{operations}</div>:<>
   <div className="workspace-grid">
    {operator&&<aside className="workspace-queue" aria-label="업무 목록과 생성">{queue}</aside>}
    <section className="workspace-focus" aria-label="선택 연락과 통화"><div className="workspace-contact">{contact}</div>{verification}{controls}{audio}</section>
    {role&&!operator&&<aside className="workspace-insight" aria-label="통화 내용 안내">{analysis}<div className="workspace-queue">{queue}</div></aside>}
   </div>
   {operator&&analysis}
   {operations&&<details className="workspace-operations"><summary>기관 운영 · 긴급 정지 · 공동 변경</summary>{operations}</details>}
  </>}
  {notifications}
  <p className="workspace-scope">모의 기관 연락 서비스입니다. 기관의 연락 승인은 통화 내용 전체의 안전 보장이 아닙니다.</p>
 </div>;
}
