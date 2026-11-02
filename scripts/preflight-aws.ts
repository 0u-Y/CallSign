// Pure configuration checks. No AWS client, DNS lookup, key generation or service startup.
import type {PreflightCheck} from './preflight.js';
import {ghcrImageReference,immutableImageReference} from './image-reference.mjs';
export const deploymentImages=['CALLSIGN_APP_IMAGE','CALLSIGN_WEB_IMAGE','ASTERISK_IMAGE','TURN_IMAGE','BESU_IMAGE','POSTGRES_IMAGE','HTTPS_IMAGE'] as const;
// Reserved documentation hosts are never deployment identities, even when their URLs parse.
function placeholder(value:string){
 if(/REPLACE|CHANGEME|<[^>]+>/i.test(value))return true;
 return value.split(',').some(part=>{let host=part.trim().toLowerCase();try{host=new URL(host.replace(/^turns?:/, 'https://')).hostname||host;}catch{/* Bare hostname/identifier/path; only reserved host suffixes are checked here. */}
 host=host.replace(/:[0-9]+$/,'');
 return /(?:^|\.)(?:example|invalid|test)$/.test(host)||/(?:^|\.)example\.(?:com|net|org)$/.test(host);});
}
export function awsPreflight(env:Record<string,string|undefined>,step='prepare',developmentHosts:string[]=[]):PreflightCheck[]{
 if(!['prepare','runtime'].includes(step))throw new Error('AWS_STEP_INVALID');
 const out:PreflightCheck[]=[];
 const check=(id:string,pass:boolean,detail:string,missing=false)=>out.push({id,status:pass?'PASS':missing?'BLOCKED':'FAIL',detail});
 const required=(key:string)=>{const v=env[key];const valid=!!v&&!placeholder(v);if(!valid)check(key,false,'승인된 AWS 입력 또는 보호 파일 참조가 필요합니다.',true);return valid?v:undefined;};
 check('aws-target',env.CALLSIGN_DEPLOYMENT_TARGET==='aws','최종 실행 대상은 AWS이며 개발 서버는 runtime에 참여하지 않습니다.');
 check('aws-mode',['new','restore'].includes(env.AWS_DEPLOYMENT_MODE??''),'새 초기화와 기존 배포 복원을 명시적으로 구분합니다.');
 check('aws-public-auth',env.PUBLIC_DEPLOYMENT==='true'&&env.DEMO_MODE==='false','공개 배포는 OIDC를 사용하며 데모 로그인을 허용하지 않습니다.');
 for(const key of ['AWS_RELEASE_DIR','AWS_VOLUME_ROOT','FINALS_DATA_DIR','AWS_WEB_TLS_DIR']){const v=required(key);if(v)check(key,v.startsWith('/')&&!/(?:^|\/)(?:home|tmp|\.local)(?:\/|$)/.test(v),'AWS의 영속 mount/배포 경로를 사용하며 개발 홈·임시 경로를 금지합니다.');}
 for(const key of ['ISSUER_URI','SERVICE_URI','WEB_ORIGIN','OIDC_ISSUER','OIDC_JWKS_URL','OIDC_AUTHORIZATION_URL','OIDC_TOKEN_URL','CONSUMPTION_ANCHOR_URL']){const value=required(key);if(!value)continue;try{const u=new URL(value);check(key,u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','0.0.0.0','::1','[::1]'].includes(u.hostname)&&!u.hostname.startsWith('127.')&&!developmentHosts.includes(u.hostname),'AWS 또는 선택한 외부 HTTPS 주소여야 하며 개발 서버·loopback을 거절합니다.');}catch{check(key,false,'HTTPS URL 형식이 잘못됐습니다.');}}
 for(const key of ['OIDC_CLIENT_ID','OFFICIAL_OIDC_CLIENT_ID','OIDC_AUDIENCE','OFFICIAL_OIDC_AUDIENCE','INSTITUTION_ID','DEPLOYMENT_ID','CALLSIGN_PROJECT','NETWORK_ID'])required(key);
 check('aws-chain-id',/^[1-9][0-9]*$/.test(env.NETWORK_ID??'')&&Number.isSafeInteger(Number(env.NETWORK_ID)),'NETWORK_ID는 새 genesis/계약/서비스가 공유하는 양의 안전 정수여야 합니다.',!env.NETWORK_ID);
 if(env.WEB_ORIGIN)try{const origin=new URL(env.WEB_ORIGIN);check('aws-web-origin',origin.origin===env.WEB_ORIGIN,'WEB_ORIGIN에는 경로·query·fragment를 넣지 않습니다.');}catch{/* URL validation above reports the error. */}
 check('aws-oidc-separation',!!env.OIDC_CLIENT_ID&&!!env.OIDC_AUDIENCE&&!!env.OFFICIAL_OIDC_CLIENT_ID&&!!env.OFFICIAL_OIDC_AUDIENCE&&env.OIDC_CLIENT_ID!==env.OFFICIAL_OIDC_CLIENT_ID&&env.OIDC_AUDIENCE!==env.OFFICIAL_OIDC_AUDIENCE,'업무/공식 public client와 audience를 분리합니다.',true);
 if(env.WEB_ORIGIN&&env.SIP_WSS_URL)try{const w=new URL(env.WEB_ORIGIN),s=new URL(env.SIP_WSS_URL);check('aws-wss',s.protocol==='wss:'&&s.host===w.host&&s.pathname==='/pbx/ws','WSS는 AWS 웹과 같은 origin의 /pbx/ws를 사용합니다.');}catch{check('aws-wss',false,'WSS/웹 주소가 잘못됐습니다.');}else required('SIP_WSS_URL');
 // Scan all supplied connection values as well as the public endpoints above; never print a value.
 for(const [key,value] of Object.entries(env)){if(!value||! /^(?:AWS_|FINALS_|SERVICE_|OIDC_|OFFICIAL_OIDC_|SIP_|PBX_|TURN_|ISSUER_|AUTH_|WORKER_|DATABASE_|MIGRATOR_|BESU_|ANCHOR_|CONSUMPTION_ANCHOR_|REGISTRY_|TRUST_|DEPLOYMENT_)/.test(key)||!/(?:URLS?|ORIGIN|HOST|ADDRESS|PATH|DIR|ROOT)$/.test(key))continue;const hosts=value.split(',').map(v=>{try{return new URL(v).hostname;}catch{return v;}});check('standalone:'+key,!hosts.some(h=>developmentHosts.includes(h))&&!/(?:\/home\/|\/\.local\/|ssh:\/\/|callsign_test_)/.test(value),'실행 연결·경로에서 개발 서버/시험 DB 의존성을 검사합니다.');}
 if(step==='runtime'){
  for(const key of deploymentImages){const v=required(key);if(v)check(key,key==='CALLSIGN_WEB_IMAGE'?immutableImageReference(v):ghcrImageReference(v),key==='CALLSIGN_WEB_IMAGE'?'실제 trust로 AWS에서 생성한 웹의 불변 참조가 필요합니다.':'GHCR의 실제 manifest digest로 고정한 참조가 필요하며 로컬 config ID나 태그는 허용하지 않습니다.');}
  if(env.REGISTRY_ADDRESS)check('aws-registry-address',/^0x[0-9a-fA-F]{40}$/.test(env.REGISTRY_ADDRESS)&&!/^0x0{40}$/.test(env.REGISTRY_ADDRESS),'실제로 배포된 0이 아닌 계약 주소가 필요합니다.');
  check('aws-web-pin',/^[0-9a-f]{64}$/.test(env.VITE_SERVICE_TRUST_SHA256??''),'새 PBX 인증서·계약·공개키로 만든 trust pin이 필요합니다.',true);
  for(const key of ['ISSUER_DATABASE_URL','AUTH_DATABASE_URL','WORKER_DATABASE_URL','SERVICE_EXTRA_CA_PATH','REGISTRY_ADDRESS','CALLSIGN_DOMAIN','PBX_PUBLIC_HOST','PBX_PUBLIC_ADDRESS','SIP_DOMAIN','SIP_REALM','TURN_URLS'])required(key);
 }
 out.push({id:'aws-external-runtime',status:'SKIPPED',detail:'AWS 자원·DNS/TLS·IdP·NAT/TURN·EBS 재시작·전체 통화는 실제 환경에서 별도 판정합니다.'});
 return out;
}
