// New protected Keycloak realm inputs only; no IdP/DB/network calls or existing-account updates.
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,lstat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertInitialAccounts} from '../services/api/src/finals-model.js';
function https(value:string,originOnly:boolean){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||(originOnly&&u.pathname!=='/')||!/^[a-z0-9.-]+$/i.test(u.hostname)||!u.hostname.includes('.')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||/(^|\.)(localhost|local|internal|example|invalid|test)$/.test(u.hostname)||/(^|\.)example\.(com|net|org)$/.test(u.hostname))throw Error('PUBLIC_HTTPS_IDENTITY_REQUIRED');return u.href.replace(/\/$/,'');}
export function demoOidcInputs(webOrigin:string,keycloakOrigin:string){
 const web=https(webOrigin,true),provider=https(keycloakOrigin,false),issuer=provider+'/realms/callsign-demo';
 const roles=['institution','gateway','recipient','approver','approver','approver'] as const;
 const identities=roles.map((role,index)=>({role,subject:randomUUID(),username:`callsign-${role}-${index+1}`,password:randomBytes(24).toString('base64url')}));
 const accounts=assertInitialAccounts(identities.map(x=>({id:issuer+'|'+x.subject,displayName:`합성 ${x.role}`,role:x.role,permissions:x.role==='institution'?['contact.manage','delegation.manage','institution.suspend','institution.recover','key.activate']:x.role==='approver'?['governance.approve']:[]})),issuer);
 const clients=['callsign-work','callsign-official'].map(clientId=>({clientId,enabled:true,protocol:'openid-connect',publicClient:true,standardFlowEnabled:true,implicitFlowEnabled:false,directAccessGrantsEnabled:false,serviceAccountsEnabled:false,redirectUris:[web+'/service'],webOrigins:[web],attributes:{'pkce.code.challenge.method':'S256'},defaultClientScopes:['basic','profile'],optionalClientScopes:[]}));
 const realm={realm:'callsign-demo',enabled:true,sslRequired:'all',registrationAllowed:false,resetPasswordAllowed:false,editUsernameAllowed:false,loginWithEmailAllowed:false,bruteForceProtected:true,failureFactor:5,defaultSignatureAlgorithm:'RS256',accessTokenLifespan:300,ssoSessionIdleTimeout:1800,clients,users:identities.map(x=>({id:x.subject,username:x.username,enabled:true,firstName:'합성',lastName:x.role,email:x.username+'@callsign.invalid',emailVerified:false,requiredActions:[],credentials:[{type:'password',value:x.password,temporary:false}]}))};
 return {realm,accounts,credentials:identities,serverSecrets:{databasePassword:randomBytes(32).toString('base64url'),bootstrapAdminPassword:randomBytes(32).toString('base64url')},environment:{OIDC_ISSUER:issuer,OIDC_JWKS_URL:issuer+'/protocol/openid-connect/certs',OIDC_AUTHORIZATION_URL:issuer+'/protocol/openid-connect/auth',OIDC_TOKEN_URL:issuer+'/protocol/openid-connect/token',OIDC_CLIENT_ID:clients[0]!.clientId,OFFICIAL_OIDC_CLIENT_ID:clients[1]!.clientId,OIDC_AUDIENCE:clients[0]!.clientId,OFFICIAL_OIDC_AUDIENCE:clients[1]!.clientId,WEB_ORIGIN:web,KC_HOSTNAME:provider,KC_HTTP_RELATIVE_PATH:new URL(provider).pathname||'/'},verification:{status:'INPUTS_ONLY_NOT_IMPORTED',subjects:'Verify actual signed login issuer/sub against imported UUIDs before application provisioning.',authority:'OIDC accounts do not contain signing keys. Register each independent approver key using the existing NEW procedure.',restart:'Import only into the new realm; preserve the real Keycloak DB on restart/RESTORE. Realm JSON is not a complete IdP backup.'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'plan',inputs:['WEB_ORIGIN','KEYCLOAK_PUBLIC_ORIGIN','new private output directory'],scope:'Offline protected realm, synthetic accounts and public-client configuration; no account exists until real import/login validation'}));}
 else{
  if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='infrastructure')throw Error('OIDC_PREPARATION_APPROVAL_REQUIRED');
  const path=process.argv[process.argv.indexOf('--apply')+1];if(!path||!process.env.WEB_ORIGIN||!process.env.KEYCLOAK_PUBLIC_ORIGIN)throw Error('ACTUAL_ORIGINS_AND_NEW_OUTPUT_REQUIRED');
  const output=resolve(path),parent=await lstat(dirname(output));if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid?.()||(parent.mode&0o077))throw Error('OWNED_PRIVATE_PARENT_REQUIRED');
  const inputs=demoOidcInputs(process.env.WEB_ORIGIN,process.env.KEYCLOAK_PUBLIC_ORIGIN);await mkdir(output,{mode:0o700});
  for(const [name,value]of Object.entries({'callsign-demo-realm.json':inputs.realm,'accounts.json':inputs.accounts,'login-credentials.protected.json':inputs.credentials,'oidc-inputs.json':{environment:inputs.environment,verification:inputs.verification}}))await writeFile(resolve(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(resolve(output,'oidc-database.password'),inputs.serverSecrets.databasePassword+'\n',{flag:'wx',mode:0o600});
  await writeFile(resolve(output,'oidc-server.env'),`KC_DB_PASSWORD=${inputs.serverSecrets.databasePassword}\nKC_BOOTSTRAP_ADMIN_USERNAME=callsign-bootstrap\nKC_BOOTSTRAP_ADMIN_PASSWORD=${inputs.serverSecrets.bootstrapAdminPassword}\n`,{flag:'wx',mode:0o600});
  console.log('Protected new realm inputs prepared. No IdP or application accounts were created; verify actual issuer/sub before provisioning.');
 }
}
