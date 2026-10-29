// Public node identities only. No node startup or private key reads.
export function besuPeerConfiguration(publicKeys:string[]){
 const keys=publicKeys.map(k=>k.trim().replace(/^0x/,''));
 if(keys.length!==4||keys.some(k=>!/^([0-9a-fA-F]{128})$/.test(k))||new Set(keys.map(k=>k.toLowerCase())).size!==4)throw new Error('FOUR_DISTINCT_BESU_NODE_IDENTITIES_REQUIRED');
 const nodes=keys.map((k,i)=>`enode://${k.toLowerCase()}@10.203.0.${11+i}:30303`);
 return {staticNodes:JSON.stringify(nodes,null,2)+'\n',permissions:`nodes-allowlist=${JSON.stringify(nodes)}\n`};
}
