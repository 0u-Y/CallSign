
import { readFile,writeFile } from 'node:fs/promises';
const path=process.argv.slice(2).find(v=>!v.startsWith('--')),address=process.env.DEPLOYER_PUBLIC_ADDRESS,network=Number(process.env.NETWORK_ID);
if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'dry-run',output:path??null,inputs:['NETWORK_ID','DEPLOYER_PUBLIC_ADDRESS','INITIAL_BALANCE_WEI'],next:'Review public inputs; --apply requires explicit infrastructure authorization and a new output file. No keys/nodes created.'}));process.exit(0);}
if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw new Error('NETWORK_PROVISIONING_EXECUTION_BLOCKED');
if(!path||!address||!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/.test(address)||!Number.isSafeInteger(network)||network<1)throw new Error('NEW_CONFIG_PATH_NETWORK_AND_DEPLOYER_PUBLIC_ADDRESS_REQUIRED');
const config=JSON.parse(await readFile(new URL('../infra/besu/network-config.json',import.meta.url),'utf8'));
config.genesis.config.chainId=network;
// This is a permissioned test-network balance, never a real-money transfer or a reward system.
const balance=BigInt(process.env.INITIAL_BALANCE_WEI??'1000000000000000000000');if(balance<0n)throw new Error('INITIAL_BALANCE_INVALID');
config.genesis.alloc={[address.slice(2).toLowerCase()]:{balance:`0x${balance.toString(16)}`}};
await writeFile(path,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write('New network configuration written with only the explicitly supplied deployer allocation. No validator keys generated or nodes started.\n');
