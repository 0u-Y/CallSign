export interface NodeObservation {node:number;status:string;height?:string;hash?:string;blockTimestamp?:number;peers?:number}
export function compareObservedHeads(nodes:NodeObservation[]){
 const current=nodes.filter(n=>n.status==='current'&&n.height!==undefined&&n.hash);
 const comparable=current.filter(n=>current.some(other=>other.node!==n.node&&other.height===n.height));
 if(!comparable.length)return '같은 높이의 비교 관측 없음';
 return comparable.some(n=>comparable.some(other=>other.height===n.height&&other.hash!==n.hash))?'같은 높이에서 hash 불일치 관측 · 운영 확인 필요':'같은 높이에서 조회한 hash 일치 · 합의 투표 증거 아님';
}

// Freshness is measured on the receiving browser's monotonic clock, not across machines.
export function observationFresh(receivedAt:number|undefined,now:number){return receivedAt!==undefined&&Number.isFinite(receivedAt)&&Number.isFinite(now)&&now>=receivedAt&&now-receivedAt<=10000;}
