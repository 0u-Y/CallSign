// Operational observations only. This is never an authorization or Witness quorum decision.
export async function inspectLedgerNodes(o:{urls:string[];networkId:string;genesisHash:string;now:number;fetcher?:typeof fetch}){
 if(o.urls.length!==4)throw new Error('FOUR_LEDGER_ENDPOINTS_REQUIRED');
 const result:Array<{node:number;status:'current'|'stale'|'syncing'|'degraded'|'unavailable'|'wrong-network';height?:string;blockTimestamp?:number;peers?:number}>=[];let index=0;
 await Promise.all([0,1].map(async()=>{while(index<o.urls.length){const i=index++;try{
  const body=[{id:1,method:'eth_chainId',params:[]},{id:2,method:'eth_getBlockByNumber',params:['latest',false]},{id:3,method:'eth_syncing',params:[]},{id:4,method:'net_peerCount',params:[]},{id:5,method:'eth_getBlockByNumber',params:['0x0',false]}].map(r=>({jsonrpc:'2.0',...r}));
  const response=await(o.fetcher??fetch)(o.urls[i]!,{method:'POST',redirect:'error',signal:AbortSignal.timeout(1500),headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('RPC_UNAVAILABLE');const raw=await response.text();if(raw.length>65536)throw new Error('RPC_TOO_LARGE');const entries=JSON.parse(raw) as Array<{id:number;result:unknown;error?:unknown}>;if(!Array.isArray(entries)||entries.length!==5||new Set(entries.map(r=>r.id)).size!==5||entries.some(r=>r.error||r.id<1||r.id>5))throw new Error('RPC_INVALID_BATCH');
  const get=(id:number)=>entries.find(r=>r.id===id)!.result,head=get(2) as {number:string;timestamp:string},genesis=get(5) as {hash:string};
  if(BigInt(String(get(1))).toString()!==o.networkId||genesis.hash.toLowerCase()!==o.genesisHash.toLowerCase()){result[i]={node:i+1,status:'wrong-network'};continue;}
  const timestamp=Number(BigInt(head.timestamp)),peers=Number(BigInt(String(get(4)))),height=BigInt(head.number).toString();if(!Number.isSafeInteger(timestamp)||!Number.isSafeInteger(peers)||timestamp>o.now+1)throw new Error('RPC_INVALID_TIME');
  const syncing=get(3);if(syncing!==false&&(typeof syncing!=='object'||syncing===null))throw new Error('RPC_INVALID_SYNC_STATE');result[i]={node:i+1,status:syncing!==false?'syncing':o.now-timestamp>8?'stale':peers<2?'degraded':'current',height,blockTimestamp:timestamp,peers};
 }catch{result[i]={node:i+1,status:'unavailable'};}}}));return result;
}
