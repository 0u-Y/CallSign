import {useEffect,useState} from 'react';
import {api,ApiError} from '../lib/api.js';
import {compareObservedHeads,observationFresh,type NodeObservation} from '../lib/ledgerObservations.js';
interface Observation {checkedAt:number;institution:string;epoch:string;ledger:NodeObservation[]}
export function LedgerObservation({enabled,identity}:{enabled:boolean;identity:string}){
 const [snapshot,setSnapshot]=useState<{identity:string;value:Observation;receivedAt:number}>(),[failure,setFailure]=useState('');const [clock,setClock]=useState(()=>performance.now());
 useEffect(()=>{let alive=true,running=false,revision=0;const abort=new AbortController();setSnapshot(undefined);setFailure('');if(!enabled)return()=>abort.abort();
  async function load(){if(running)return;running=true;const request=revision;try{const next=await api<Observation>('/v3/management/health',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});if(alive&&request===revision&&!document.hidden){const receivedAt=performance.now();setClock(receivedAt);setSnapshot({identity,value:next,receivedAt});setFailure('');}}catch(e){if(alive&&request===revision&&!document.hidden){setSnapshot(undefined);setFailure(e instanceof ApiError&&e.status===401?'세션 만료 · 다시 로그인하세요.':e instanceof ApiError&&e.status===403?'노드 관측 조회 권한이 없습니다.':'노드 관측 조회 실패 · 현재 상태 확인 불가');}}finally{running=false;}}
  const visibility=()=>{revision++;setSnapshot(undefined);if(!document.hidden)void load();};document.addEventListener('visibilitychange',visibility);void load();const timer=setInterval(()=>{if(!document.hidden)void load();},5000),expiry=setInterval(()=>setClock(performance.now()),1000);return()=>{alive=false;abort.abort();clearInterval(timer);clearInterval(expiry);document.removeEventListener('visibilitychange',visibility);};
 },[enabled,identity]);
 const expired=snapshot?.identity===identity&&!observationFresh(snapshot.receivedAt,clock);
 const observed=snapshot?.identity===identity&&!expired?snapshot.value:undefined;
 return <section aria-label="Besu 네 노드 관측"><h2>Besu 네 노드</h2><p>같은 호스트의 시험 노드는 독립 기관 운영 실증이 아닙니다. 선과 투표 애니메이션은 표시하지 않습니다.</p>{failure&&<p role="alert">{failure}</p>}{enabled&&expired&&<p role="status">관측 유효시간이 지났습니다. 현재 상태를 다시 확인하세요.</p>}
  <div className="demo-node-grid">{[1,2,3,4].map(id=>{const node=enabled?observed?.ledger.find(n=>n.node===id):undefined;return <article key={id}><h3>노드 {id}</h3><p>{node?({current:'현재 블록 관측',stale:'블록 갱신 지연',syncing:'동기화 중',degraded:'peer 부족',unavailable:'조회 불가',"wrong-network":'체인 식별 불일치'}[node.status]??'확인 불가'):'미관측'}</p>{node?.height&&<p>블록 {node.height}</p>}<small>validator 소속: 이 응답에서 미확인</small>{node?.hash&&<details><summary>블록 hash</summary><code>{node.hash}</code></details>}</article>;})}</div>
  <p>{enabled&&observed?compareObservedHeads(observed.ledger):'실제 조회 결과가 없어 정상·일치로 표시하지 않습니다.'}</p>
  {enabled&&observed&&<dl><dt>기관 서버 상태 / epoch</dt><dd>{observed.institution} / {observed.epoch}</dd><dt>서버 관측 시각</dt><dd>{new Date(observed.checkedAt*1000).toLocaleTimeString('ko-KR')}</dd></dl>}
  {!enabled&&<p>기관 복구 권한의 인증 세션에서만 기존 운영 관측 API를 조회합니다.</p>}<p>Witness 정족수: 이 노드 조회로는 확인하지 않습니다. 원장 명령과 연결된 검증 결과가 필요합니다.</p>
 </section>;
}
