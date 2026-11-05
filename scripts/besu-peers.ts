import {isIP} from 'node:net';
// Public node identities only. No node startup or private key reads.
export function ledgerAddresses(prefix='10.203.0'){
 const parts=prefix.split('.').map(Number);
 if(!/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){2}$/.test(prefix)||parts.some(p=>p>255)||!(parts[0]===10||parts[0]===172&&parts[1]! >= 16&&parts[1]! <= 31||parts[0]===192&&parts[1]===168))throw new Error('LEDGER_PRIVATE_IPV4_PREFIX_REQUIRED');
 return {subnet:`${prefix}.0/24`,nodes:[11,12,13,14].map(n=>`${prefix}.${n}`)};
}
export function ledgerOverlaps(prefix:string,cidrs:string[]){
 const network=ledgerAddresses(prefix).subnet;
 const range=(cidr:string)=>{const [ip,bits='32',extra]=cidr.split('/'),p=ip!.split('.').map(Number),n=Number(bits);if(extra!==undefined||isIP(ip!)!==4||p.length!==4||p.some(v=>!Number.isInteger(v)||v<0||v>255)||!/^\d+$/.test(bits)||n<0||n>32)throw new Error('OBSERVED_IPV4_CIDR_INVALID');const v=p.reduce((a,b)=>a*256+b,0),size=2**(32-n),start=Math.floor(v/size)*size;return [start,start+size-1] as const;};
 const [start,end]=range(network);return cidrs.filter(c=>{const [a,b]=range(c);return start<=b&&a<=end;});
}
export function besuPeerConfiguration(publicKeys:string[],prefix='10.203.0',mode:'private-network'|'host-loopback'='private-network'){
 const keys=publicKeys.map(k=>k.trim().replace(/^0x/,''));
 if(keys.length!==4||keys.some(k=>!/^([0-9a-fA-F]{128})$/.test(k))||new Set(keys.map(k=>k.toLowerCase())).size!==4)throw new Error('FOUR_DISTINCT_BESU_NODE_IDENTITIES_REQUIRED');
 if(!['private-network','host-loopback'].includes(mode))throw new Error('BESU_PEER_MODE_INVALID');
 const endpoints=mode==='host-loopback'?[30311,30312,30313,30314].map(port=>`127.0.0.1:${port}`):ledgerAddresses(prefix).nodes.map(address=>`${address}:30303`);
 const nodes=keys.map((k,i)=>`enode://${k.toLowerCase()}@${endpoints[i]}`);
 return {staticNodes:JSON.stringify(nodes,null,2)+'\n',permissions:`nodes-allowlist=${JSON.stringify(nodes)}\n`};
}
