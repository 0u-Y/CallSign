import * as Dialog from '@radix-ui/react-dialog';
import type {ComponentProps} from 'react';
import {NavLink} from 'react-router-dom';
import {Phone,ShieldCheck,ArrowRight} from 'lucide-react';
import type {ServiceWorkspace} from './ServiceWorkspace.js';
import {LedgerObservation} from './LedgerObservation.js';

type Props=ComponentProps<typeof ServiceWorkspace>&{governance:boolean;connected:boolean;connection:string;end:()=>void;canObserve:boolean;identity:string;observedAt?:number|undefined;stale:boolean};
export function DemoWorkspace(p:Props){
 return <div className="service-app demo-workspace">
  <header className="demo-heading"><div><h1>{p.governance?'한 사람의 결정으로 복구할 수 없는 권한':'승인된 연락, 확인하는 통화'}</h1><p>{p.governance?'관리 승인 · 원장 확정 · 서비스 반영을 각각 확인합니다.':'기관의 연락 승인과 현재 연결, 통화 내용의 위험을 따로 확인합니다.'}</p></div><span className="demo-environment">{p.role?`인증된 역할: ${p.roleName}`:'역할 연결 전'}</span></header>
  <nav className="demo-navigation" aria-label="시연 화면"><NavLink to="/demo/call"><Phone size={20} aria-hidden="true"/>연락과 통화</NavLink><NavLink to="/demo/governance"><ShieldCheck size={20} aria-hidden="true"/>공동 관리와 복구</NavLink></nav>
  <div className="demo-tools"><details className="demo-preparation"><summary>실행 준비 · 역할 연결 · 공식 업무</summary><p>조작은 현재 로그인한 역할의 권한으로만 실행됩니다. 다른 역할은 독립 브라우저 프로필에서 로그인하세요. 이 화면은 다른 역할의 세션을 공유하지 않습니다.</p><div className="workspace-account">{p.account}</div><NavLink to="/official">별도 인증한 공식 업무 열기</NavLink><p>선택 업무: {p.identity||'미선택'}</p></details>
  <Dialog.Root><Dialog.Trigger asChild><button className="button quiet">상세 확인 근거 열기</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="demo-drawer-overlay"/><Dialog.Content className="demo-evidence-drawer"><Dialog.Title>현재 실행의 확인 근거</Dialog.Title><Dialog.Description>현재 로그인 역할에 허용된 정보만 표시합니다. 이 창을 여는 동작은 통화·승인·권한을 변경하지 않습니다.</Dialog.Description><dl><dt>역할</dt><dd>{p.roleName}</dd><dt>선택 문맥</dt><dd>{p.identity||'미선택'}</dd><dt>업무 조회 현재성</dt><dd>{p.stale?'조회 실패 · 과거 성공 미표시':p.observedAt?new Date(p.observedAt).toLocaleTimeString('ko-KR'):'미관측'}</dd><dt>연결 controller 상태</dt><dd>{p.connection}</dd></dl><p>개별 서명·nonce·만료·hash는 해당 업무 또는 공동 변경의 검토 상세에서 확인하세요. 노드 조회만으로 Witness나 PBX 회수 성공을 확인하지 않습니다.</p><Dialog.Close asChild><button className="button secondary">확인 근거 닫기</button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root></div>
  {p.notice}
  <div className="demo-live-bar" role="status" hidden={!p.connected}><span>현재 통화 · {p.connection}</span><button className="button service-end" disabled={!p.connected} onClick={p.end}>진행 통화 종료</button></div>
  <section hidden={p.governance} aria-label="연락과 통화 화면">
   <ol className="demo-process" aria-label="연락의 처리 순서"><li>연락 준비</li><li><ArrowRight size={16} aria-hidden="true"/>승인·연결</li><li><ArrowRight size={16} aria-hidden="true"/>동의·분석</li><li><ArrowRight size={16} aria-hidden="true"/>권한 회수</li></ol>
   <p className="demo-process-note">처리 순서 안내입니다. 화면 이동은 승인·연결·명령을 실행하지 않습니다.</p>
   <div className="demo-call-grid"><aside className="demo-institution"><h2>기관·상담원</h2>{p.queue||<p>로그인 후 허용된 연락 업무를 선택하세요.</p>}<p>기관 정지와 공동 복구는 <NavLink to="/demo/governance">공동 관리 화면</NavLink>에서 진행합니다.</p></aside>
    <section className="demo-recipient" aria-label="이번 연락과 수신 상태"><p className="demo-view-scope">현재 역할의 조회 범위입니다. 수락·분석 동의는 수신자 세션에서만 가능합니다.</p><div className="workspace-contact">{p.contact}</div>{p.verification}{p.controls}{p.analysis}</section></div>
   <section className="demo-evidence"><h2>이번 연락의 확인 근거</h2><p>{p.stale?'최신 업무 조회 실패 · 이전 성공 상태로 판단하지 마세요.':p.observedAt?`업무 응답 관측: ${new Date(p.observedAt).toLocaleTimeString('ko-KR')}`:'업무·승인·소비·연결의 실제 응답을 아직 관측하지 않았습니다.'}</p><p>현재 연결과 분석 상태는 위 통화 controller의 관측입니다. PBX 자원 부재는 상대 음성 중단의 증거와 구분합니다.</p>
    <details><summary>분석 발화 준비 · 입력과 근거의 한계</summary><p>정상: “어제 해외 결제는 본인이 하셨나요?”</p><p>위험 요구: “문자로 받은 인증번호를 알려주세요.”</p><p>목적 이탈: “저금리 대출 상품도 안내해드리겠습니다.”</p><p>사용 허가된 녹음은 아직 등록되지 않았습니다. 실제 통화 마이크로 발화하며, 수신자의 분석 동의 후 상대 track만 전달합니다. 이 문장을 누르거나 읽는 것만으로 분석 결과를 만들지 않습니다.</p></details></section>
  </section>
  <section hidden={!p.governance} aria-label="공동 관리 화면"><div className="demo-governance-grid"><section className="demo-commands"><h2>변경 검토와 독립 승인</h2>{p.operations||<p>기관 관리 또는 공동 승인 권한으로 로그인하세요. 관람만으로 변경 권한을 얻지 않습니다.</p>}</section><aside className="demo-ledger"><LedgerObservation enabled={p.governance&&p.canObserve&&!p.stale} identity={p.identity}/></aside></div><section className="demo-evidence"><h2>변경이 반영되는 세 계층</h2><dl className="demo-propagation"><div><dt>관리 승인 · 2-of-3</dt><dd>등록된 서로 다른 승인키의 유효 서명을 검토합니다. 정지 권한자의 단독 정지는 별도 정책입니다.</dd></div><div><dt>원장 · QBFT</dt><dd>제출·블록 포함·확정을 구분합니다. 노드 조회만으로 개별 투표나 명령 확정을 판단하지 않습니다.</dd></div><div><dt>Witness · 3-of-4 / 서비스</dt><dd>서명·freshness·문맥 검증 결과가 있어야 상태 증언을 확인할 수 있습니다. 노드 수를 세어 성공으로 표시하지 않습니다.</dd></div></dl><p>복구는 종료된 통화와 철회된 승인을 부활시키지 않습니다. 새 권한에 맞는 새 업무·통화 시도를 준비하세요.</p></section></section>
  <div className="demo-audio">{p.audio}</div>{p.notifications}
  <p className="workspace-scope">합성 기관 시연입니다. 기관의 연락 승인은 통화 내용 전체의 안전 보장이 아닙니다.</p>
 </div>;
}
