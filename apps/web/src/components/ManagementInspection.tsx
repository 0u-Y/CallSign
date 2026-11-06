import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/api.js';
export function ManagementInspection({extended,action}:{extended:boolean;action:(fn:()=>Promise<unknown>)=>Promise<void>}){
 const [result,setResult]=useState<{label:string;observedAt:number;value:unknown}>();
 const [loading,setLoading]=useState(''),[error,setError]=useState('');
 const request=useRef<AbortController|undefined>(undefined);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function load(label:string,path:string){
  request.current?.abort();const abort=new AbortController();request.current=abort;
  setResult(undefined);setError('');setLoading(label);
  try{const value=await api(path,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])});
   if(!abort.signal.aborted&&request.current===abort)setResult({label,observedAt:Date.now(),value});
  }catch(e){if(!abort.signal.aborted&&request.current===abort){setError(`${label} 조회 실패 · 이전 결과를 표시하지 않습니다.`);throw e;}}
  finally{if(!abort.signal.aborted&&request.current===abort)setLoading('');}
 }
 const queries=[['관리 상태','/v3/management'],...(extended?[['원장 작업·사용량','/v3/management/jobs'],['노드·복구 gate','/v3/management/health'],['처리 시간·실패','/v3/management/measurements']]:[])];
 return <details className="management-inspection"><summary>관리 상태 기술 상세</summary><div className="button-row">{queries.map(([label,path])=><button className="button secondary" key={path} onClick={()=>void action(()=>load(label!,path!))}>{label} 조회</button>)}</div>
 {loading&&<p role="status">{loading} 조회 중</p>}{error&&<p role="alert">{error}</p>}
 {result&&<><p>{result.label} · 관측 <time dateTime={new Date(result.observedAt).toISOString()}>{new Date(result.observedAt).toLocaleTimeString('ko-KR')}</time></p><pre>{JSON.stringify(result.value,null,2)}</pre></>}
 {!loading&&!error&&!result&&<p>아직 조회하지 않았습니다.</p>}</details>;
}
