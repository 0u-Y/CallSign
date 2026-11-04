import type {PurposePolicy} from '@callsign/protocol';
const states:Record<string,string>={open:'진행 중',completed:'업무 완료',cancelled:'취소됨',created:'발신 준비',authorized:'기관 승인됨',consumed:'이번 연결에 승인 사용됨',accepted:'수락됨 · 연결은 별도 확인',ended:'종료',declined:'수신 거절',failed:'연결 실패','no-answer':'부재'};
const riskLabels:Record<string,string>={OTP:'인증번호 요구',TRANSFER:'송금 요구',REMOTE_CONTROL:'원격제어 요구',SECRECY:'비밀 유지 요구'};
export function ServiceContactSummary({institutionUri,policy,intent,attempt,role}:{institutionUri:string;policy:PurposePolicy;intent?:{id:string;status:string;agentId:string;recipientId:string}|undefined;attempt?:{id:string;status:string}|undefined;role:string}){
 const next=role==='approver'?'공동 관리에서 변경 내용과 서명 대상을 검토하세요.':!intent?'업무 목록에서 연락을 선택하세요.':['completed','cancelled'].includes(intent.status)?'종료된 업무입니다. 새 연락은 새 업무로 진행하세요.':intent.status!=='open'?'업무 상태를 확인할 수 없습니다. 새로 조회한 뒤 진행하세요.':role==='gateway'?'위임과 개별 승인을 확인하고 마이크 준비 후 발신하세요.':role==='recipient'?'기관 승인과 현재 연결을 확인한 뒤 수락하세요. 음성 분석은 따로 동의합니다.':'업무와 회수 상태를 확인하고 필요한 경우 연락을 취소하세요.';
 return <section className="service-contact" aria-labelledby="service-contact-title"><h2 id="service-contact-title">승인할 연락의 목적</h2>
 <dl className="service-summary-list"><div><dt>연락 기관</dt><dd>{institutionUri}</dd></div><div><dt>이번 연락</dt><dd>이상거래 본인 확인</dd></div><div><dt>선택 업무</dt><dd>{intent?(states[intent.status]??'상태 확인 필요'):'선택 전'}</dd></div><div><dt>통화 시도</dt><dd>{attempt?(states[attempt.status]??'상태 확인 필요'):'선택 전 · 연결되지 않음'}</dd></div></dl>
 <p className="service-next-action"><strong>다음 행동</strong> {next}</p>
 <p><strong>허용된 확인</strong> {policy.allowedQuestions.join(' · ')}</p><p><strong>요구하면 안 되는 정보·행동</strong> {policy.forbiddenRequests.map(v=>riskLabels[v]??v).join(' · ')}</p>
 <details><summary>기관·업무 확인 근거</summary><dl className="service-summary-list"><div><dt>등록 기관 주소</dt><dd>{institutionUri}</dd></div><div><dt>목적 정책</dt><dd>버전 {policy.version}</dd></div>{intent&&<><div><dt>업무 식별자</dt><dd>{intent.id}</dd></div><div><dt>수신자 계정</dt><dd>{intent.recipientId}</dd></div><div><dt>상담원 계정</dt><dd>{intent.agentId}</dd></div></>}{attempt&&<div><dt>통화 시도 식별자</dt><dd>{attempt.id}</dd></div>}</dl><p>서명·현재 권한·연결 확인은 아래의 실제 검증 상태를 따릅니다. 이 업무 요약만으로 승인이 확인된 것은 아닙니다.</p></details>
 <a href={policy.followUpPath}>별도 인증한 공식 업무로 이동</a></section>;
}
