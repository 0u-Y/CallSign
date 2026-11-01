// Local files and configuration only. Never reads private key contents or contacts RPC/Docker.
import {readFile,lstat} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {besuPeerConfiguration,ledgerAddresses,ledgerOverlaps} from './besu-peers.js';
import type {PreflightCheck} from './preflight.js';
export const chainSteps=['prepare','nodes','deploy','witness'] as const;
export async function chainPreflight(env:Record<string,string|undefined>,step:string,root=process.cwd()):Promise<PreflightCheck[]>{
 if(!(chainSteps as readonly string[]).includes(step))throw new Error('CHAIN_STEP_REQUIRED');
 const checks:PreflightCheck[]=[],check=(id:string,status:PreflightCheck['status'],detail:string)=>checks.push({id,status,detail});
 const required=(key:string)=>{if(!env[key]){check(key,'BLOCKED','해당 단계 입력/생성물을 준비하세요. 값을 출력하지 않습니다.');return false;}return true;};
 const file=async(key:string,path:string|undefined,secret=false)=>{if(!path){check(key,'BLOCKED','역할별 파일 참조가 필요합니다.');return false;}try{const i=await lstat(resolve(root,path));if(!i.isFile()||i.isSymbolicLink()||i.size===0||i.size>1048576||secret&&(i.mode&0o077)!==0)throw new Error();check(key,'PASS',secret?'일반 보호 파일의 metadata만 검사; 키 내용/등록 상태 미검증.':'로컬 일반 파일 존재 확인.');return true;}catch{check(key,'BLOCKED','파일 부재/형식/권한 문제. 생성/복원을 승인받아 준비하며 기존 파일을 대체하지 마세요.');return false;}};
 check('execution-guard',env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION?'FAIL':'PASS','preflight에는 실행 허용 변수를 지정하지 않습니다.');
 check('CALLSIGN_PROJECT',/^[a-z0-9][a-z0-9_-]{2,62}$/.test(env.CALLSIGN_PROJECT??'')?'PASS':'BLOCKED','새 배포의 고유 Compose project. 기존 project 재사용 여부는 운영자가 확인.');
 check('FINALS_DATA_DIR',isAbsolute(env.FINALS_DATA_DIR??'')?'PASS':'BLOCKED','호스트의 배포 전용 절대 경로. container 경로와 구분.');
 check('NETWORK_ID',/^[1-9][0-9]*$/.test(env.NETWORK_ID??'')&&Number.isSafeInteger(Number(env.NETWORK_ID))?'PASS':'BLOCKED','검토한 chain ID. 기존 genesis/identity를 재생성하지 않습니다.');
 if(!env.LEDGER_IPV4_PREFIX)check('LEDGER_IPV4_PREFIX','BLOCKED','신규 배포 또는 기존 배포의 검토된 prefix가 필요합니다.');else try{const a=ledgerAddresses(env.LEDGER_IPV4_PREFIX);check('ledger-addresses','PASS',`${a.subnet}; validators .11~.14, RPC는 내부 besu1~4 DNS.`);
 check('ledger-media-separation',ledgerOverlaps(env.LEDGER_IPV4_PREFIX,['10.205.0.0/24']).length?'FAIL':'PASS','현재 별도 media subnet과도 분리되어야 합니다.');
 if(!env.LEDGER_OBSERVED_CIDRS)check('ledger-overlap','BLOCKED','같은 호스트의 최신 interface/모든 IPv4 route(Docker 포함) CIDR 관측을 전달하세요. default route는 제외.');
 else {const conflicts=ledgerOverlaps(env.LEDGER_IPV4_PREFIX,env.LEDGER_OBSERVED_CIDRS.split(','));check('ledger-overlap',conflicts.length?'FAIL':'PASS',conflicts.length?'관측된 IPv4 망과 중복됩니다.':'전달된 CIDR 관측과 비중복. 숨은 VPN/조직망/GCP 또는 관측 시각 이후 변경은 미확인.');}
 }catch{check('ledger-addresses','FAIL','private IPv4 세 옥텟 prefix와 유효한 관측 CIDR 필요. 임의 shell 문자열은 거절.');}
 if(step==='prepare')return checks;
 check('BESU_IMAGE',/^[\w./:-]+@sha256:[0-9a-f]{64}$/.test(env.BESU_IMAGE??'')?'PASS':'BLOCKED','검토한 실제 digest 필요. 로컬 이미지 존재/아키텍처/모듈은 별도 읽기 전용 확인.');
 const base=env.FINALS_DATA_DIR;
 if(base){try{
 const keys=await Promise.all([1,2,3,4].map(n=>readFile(resolve(base,`besu/keys/node${n}/key.pub`),'utf8'))),expected=besuPeerConfiguration(keys,env.LEDGER_IPV4_PREFIX);
 const genesis=JSON.parse(await readFile(resolve(base,'besu/genesis.json'),'utf8'));
 if(genesis.config?.chainId!==Number(env.NETWORK_ID)||genesis.config?.qbft?.blockperiodseconds===undefined)throw new Error();
 if(await readFile(resolve(base,'besu/static-nodes.json'),'utf8')!==expected.staticNodes||await readFile(resolve(base,'besu/permissions_config.toml'),'utf8')!==expected.permissions)throw new Error();
 check('prepared-network','PASS','chain ID와 QBFT/공개 peer/allowlist 일치. validator 주소와 extraData·실제 합의는 노드 실행 후 확인.');
 }catch{check('prepared-network','BLOCKED','생성 genesis/공개키/peer/allowlist 부재 또는 설정 불일치. 기존 genesis·키를 재생성하지 말고 검토.');}
 for(const n of [1,2,3,4])await file(`validator-${n}`,resolve(base,`besu/keys/node${n}/key`),true);
 }
 if(step==='nodes')return checks;
 check('CALLSIGN_APP_IMAGE',/^[\w./:-]+@sha256:[0-9a-f]{64}$/.test(env.CALLSIGN_APP_IMAGE??'')?'PASS':'BLOCKED','deployer/Witness에 실제 runtime 이미지 digest 필요. 웹 pin/PBX/OIDC/AI 불필요.');
 if(step==='deploy'){
 const defaults=parseEnv(await readFile(resolve(root,'.env.example'),'utf8'));
 const artifact=env.REGISTRY_ARTIFACT_PATH??defaults.REGISTRY_ARTIFACT_PATH,hash=env.REGISTRY_ARTIFACT_SHA256??defaults.REGISTRY_ARTIFACT_SHA256;
 if(await file('registry-artifact',artifact)){const raw=await readFile(resolve(root,artifact!));check('artifact-hash',createHash('sha256').update(raw).digest('hex')===hash?'PASS':'FAIL','실제 파일 SHA-256과 검토 hash 대조; bytecode 배포 증거 아님.');}
 const approvers=(env.REGISTRY_APPROVERS??'').split(',').map(v=>v.toLowerCase());check('joint-approvers',approvers.length===3&&new Set(approvers).size===3&&approvers.every(v=>/^0x[0-9a-f]{40}$/.test(v)&&!/^0x0{40}$/.test(v))?'PASS':'BLOCKED','서로 다른 공동 승인자 공개 주소3개. 서명 개인키는 각 소유자가 보관.');
 if(required('INSTITUTION_ID'))check('INSTITUTION_ID',env.INSTITUTION_ID!.length>=16&&env.INSTITUTION_ID!.length<=128?'PASS':'FAIL','배포 metadata의 기관 문맥. 원장 기관 등록은 별도 공동 승인.');
 await file('deployer-key',env.DEPLOYER_KEY_PATH,true);
 try{if(!isAbsolute(env.DEPLOYMENT_WORK_DIR??'')||!(await lstat(env.DEPLOYMENT_WORK_DIR!)).isDirectory())throw new Error();check('DEPLOYMENT_WORK_DIR','PASS','호스트 디렉터리 존재만 확인. runtime UID의 쓰기 권한은 운영자가 별도 확인.');}catch{check('DEPLOYMENT_WORK_DIR','BLOCKED','새 release 디렉터리가 필요합니다. 개인키/receipt/pending을 덮어쓰지 않습니다.');}
 check('genesis-observation','SKIPPED','4개 실제 RPC identity 관측 후 EXPECTED_GENESIS_HASH 확정. 지금 값을 만들지 않습니다.');return checks;}
 await file('public-manifest',base&&resolve(base,'public-manifest.json'));
 const deployment=base&&resolve(base,'deployment.json');if(await file('deployment',deployment)){try{const d=JSON.parse(await readFile(deployment!,'utf8'));if(d.networkId!==env.NETWORK_ID||d.registryProfile!=='CALLSIGN_SERVICE_JOINT_CONFIGURATION_1'||!/^0x[0-9a-fA-F]{40}$/.test(d.registryAddress)||!/^0x[0-9a-fA-F]{64}$/.test(d.genesisHash))throw new Error();check('deployment-context','PASS','로컬 metadata의 chain/profile 형식. 실제 code/receipt/current state는 실행 후 확인.');}catch{check('deployment-context','FAIL','배포 metadata chain/profile/주소/hash 불일치.');}}
 for(const n of [1,2,3,4])await file(`witness-${n}`,base&&resolve(base,`witness-keys/witness-${n}.json`),true);
 check('runtime-consensus-contract-witness','SKIPPED','합의 진행·계약 receipt/code·독립 Witness 서명3/4/freshness는 별개 실행 assertion.');return checks;
}
