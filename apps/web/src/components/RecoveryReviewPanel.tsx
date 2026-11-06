import {useState} from 'react';
import {verifyRecoveryRequest,verifyRecoverySignature,type RecoveryManagement,type RecoveryReview} from '../lib/recoveryReview.js';

function download(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
export function RecoveryReviewPanel({state,permissions,action,post,reload,busy=false,loadError=false}:{state:RecoveryManagement|undefined;permissions:string[];action:(fn:()=>Promise<unknown>)=>Promise<void>;post:<T=unknown>(path:string,body:unknown)=>Promise<T>;reload:()=>Promise<void>;busy?:boolean;loadError?:boolean}){
 const [request,setRequest]=useState<RecoveryReview['request']>(),[signatures,setSignatures]=useState<Record<string,string>>({}),[message,setMessage]=useState('');
 const now=Math.floor(Date.now()/1000);let review:RecoveryReview|undefined,invalid='';
 if(request&&state)try{review=verifyRecoveryRequest(request,state,now);}catch(e){invalid=(e as Error).message;}
 async function read(file:File|undefined){if(!file||file.size>65536)throw new Error('64KB 이하의 공개 JSON 파일을 선택하세요.');try{return JSON.parse(await file.text()) as unknown;}catch{throw new Error('공개 요청 또는 서명 JSON 파일을 선택하세요. 개인키는 웹에 넣지 않습니다.');}}
 async function importRequest(file:File|undefined){if(!state)throw new Error('현재 기관 상태를 먼저 조회하세요.');const next=verifyRecoveryRequest(await read(file),state,Math.floor(Date.now()/1000));setRequest(next.request);setSignatures({});setMessage('현재 기관·원장 세대·서명 대상을 확인했습니다. 각 승인자의 공개 서명 파일을 가져오세요.');}
 async function importSignature(file:File|undefined){if(!state||!review)throw new Error('유효한 현재 복구 요청을 먼저 가져오세요.');const next=await verifyRecoverySignature(await read(file),review,state.approvers,Math.floor(Date.now()/1000));if(signatures[next.signer])throw new Error('이 승인키의 서명은 이미 가져왔습니다. 서로 다른 승인키가 필요합니다.');setSignatures({...signatures,[next.signer]:next.signature});setMessage('같은 복구 요청의 등록 승인키 서명을 로컬에서 검증했습니다. 아직 서버 제출 전입니다.');}
 const count=Object.keys(signatures).length,manage=permissions.includes('institution.recover');
 return <fieldset className="recovery-review" disabled={busy}><legend>공동 복구 · 독립 서명 검토</legend><div className="recording-recovery-grid"><section className="recording-approval-panel"><h2><small>01</small> 복구 공동 승인</h2><div className="recording-approval-count"><strong>{count}</strong><span>/ 2개 독립 서명 필요</span></div>
 <p>기관 정지 후, 등록 승인키 3개 중 서로 다른 2개의 서명으로 새 권한을 준비합니다.</p>
 <details className="recording-recovery-context"><summary>현재 상태 · 권한 세대</summary><dl className="service-summary-list"><div><dt>기관 상태</dt><dd>{state?state.status==='suspended'?'정지':state.status==='active'?'활성':'확인 필요':loadError?'확인 불가':'조회 중'}</dd></div><div><dt>서버 / 원장 관측 세대</dt><dd>{state?`${state.epoch} / ${state.observedEpoch??'미관측'}`:'미관측'}</dd></div><div><dt>복구 접수</dt><dd>{!state?'미관측':state.recovery?.submitted?'서버 접수 기록 있음 · 원장 확정·활성화와 구분':'현재 접수 기록 없음'}</dd></div></dl></details>
 <div className="approver-list" aria-label="등록 승인키별 로컬 서명 검증">{state?.approvers.map((address,index)=><article key={address}><span className={`avatar ${review&&signatures[address.toLowerCase()]?'signed':''}`}>{index+1}</span><div><strong>등록 승인키 {index+1}</strong><small>{review&&signatures[address.toLowerCase()]?'같은 요청의 서명 검증됨':review?'서명 파일 대기':'복구 요청 검토 전'}</small></div></article>)}</div>
 <label>검토할 공개 복구 요청 파일<input disabled={!state} type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void action(()=>importRequest(file));}}/></label>
 {!request&&<p>운영자가 현재 원장 세대와 실제 배치할 새 공개키·관리 주소·nonce·만료로 준비한 요청을 가져오세요.</p>}
 {invalid&&<p role="alert">{invalid} 이전 서명은 새 요청에 사용하지 않습니다.</p>}
 {review&&<><h3>복구 목표 · 권한 세대 {review.request.expectedEpoch} → {String(BigInt(review.request.expectedEpoch)+1n)}</h3><p>서버 접수 후에도 원장 확인과 배치된 새 승인키 활성화가 필요합니다. 이전 통화·위임은 되살아나지 않습니다.</p>
 <p role="status">로컬 검증 <strong>{count}/3</strong> · 서로 다른 2개부터 제출 가능 · 원장 확정 전</p>

 <label>각 승인자의 공개 서명 파일<input type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void action(()=>importSignature(file));}}/></label>
 <button className="button secondary" onClick={()=>download(`callsign-recovery-${review.operation}.json`,review.request)}>같은 복구 요청 내보내기</button>
 {manage&&<button className="button primary" disabled={count<2||state?.recovery?.hash===review.operation} onClick={()=>void action(async()=>{if(!state||!request)throw new Error('현재 복구 요청이 필요합니다.');const current=verifyRecoveryRequest(request,state,Math.floor(Date.now()/1000));await post('/v3/management/recover',{request:current.request,signatures:Object.values(signatures)});setMessage('서버가 복구 요청을 접수했습니다. 원장 확정과 새 키 활성화는 별도로 확인하세요.');await reload();})}>검증한 공동 복구 요청 제출</button>}
 {!manage&&<p>승인자는 같은 요청을 별도 서명 도구로 검토·서명합니다. 최종 제출은 기관 복구 권한자가 수행합니다.</p>}
 <details><summary>서명 대상 · 공개 변경 내용</summary><dl className="service-summary-list"><div><dt>체인 / 계약</dt><dd>{review.chainId} / {review.registryAddress}</dd></div><div><dt>기관</dt><dd>{review.request.institutionId}</dd></div><div><dt>새 관리자</dt><dd>{review.request.newAdministrator}</dd></div><div><dt>새 정지 권한자</dt><dd>{review.request.newEmergencyStopper}</dd></div><div><dt>새 승인 공개키</dt><dd>{review.request.newApprovalPublicKey}</dd></div><div><dt>일회 nonce</dt><dd>{review.request.nonce}</dd></div><div><dt>만료</dt><dd>{new Date(Number(review.request.deadline)*1000).toLocaleString('ko-KR')}</dd></div><div><dt>검토한 EIP-712 digest</dt><dd>{review.digest}</dd></div></dl><p>현재 관리자·정지 권한자 주소는 이 관리 응답에 포함되지 않습니다. 변경 전 원장은 운영 절차로 별도 대조하세요.</p><pre>{JSON.stringify(review.request,null,2)}</pre></details></>}
 {message&&<p role="status">{message}</p>}
 <details><summary>독립 서명과 이후 활성화</summary><p>각 승인자는 같은 공개 요청과 digest·체인·계약을 대조하고 기존 sign-recovery.ts에서 자기 보호 키 하나만 사용합니다. 개인키는 웹에 넣지 않습니다.</p><p>이 화면의 서명 수는 가져온 공개 파일의 암호 검증 결과입니다. 로그인 세션이 특정 승인키의 소유자라는 뜻은 아닙니다.</p><p>기존 서명 명령: <code>pnpm exec tsx scripts/sign-recovery.ts REQUEST_FILE KEY_FILE DIGEST recover --sign --output SIGNATURE_FILE</code>. 체인·계약 환경과 기존 chain 실행 허가도 확인합니다.</p><p>원장 복구 후 운영자는 실제 배치한 새 승인키를 활성화하고 공개 trust를 갱신합니다. 그다음 새 위임·업무로 연락합니다.</p></details>
 </section><section className="recording-recovery-process"><h2><small>02</small> 복구 반영 과정</h2><ol>
 <li><span>1</span><div><strong>공동 승인</strong><p>서로 다른 등록 승인키 2개 이상</p></div><small>{review?`${count}개 서명 검증됨`:'요청 검토 전'}</small></li>
 <li><span>2</span><div><strong>원장 확정</strong><p>서버 접수와 원장 확정은 별도입니다.</p></div><small>{state?.recovery?.submitted?'접수 기록 있음':'확정 미관측'}</small></li>
 <li><span>3</span><div><strong>Witness 확인</strong><p>문맥·최신성·서명을 검증한 증거 확인</p></div><small>아래 관측에서 확인</small></li>
 <li><span>4</span><div><strong>서비스 적용</strong><p>새 권한과 배치된 키의 활성화 확인</p></div><small>{state?state.status==='active'?'현재 기관 활성':state.status==='suspended'?'현재 기관 정지':'확인 필요':'미관측'}</small></li>
 </ol><p className="recording-recovery-note">복구해도 종료된 통화와 취소된 업무는 되살아나지 않습니다.</p><p>현재 기관 상태는 이번 복구 명령의 완료 증거와 구분합니다.</p></section></div></fieldset>;
}
