import {hashCanonical} from '@callsign/protocol';
import type {TrustBundle} from '@callsign/verifier';
import type {InstitutionRecord} from './finals-model.js';
import {HttpError} from './auth.js';
// Only the deployment-pinned trust may authorize new work; management/recovery must remain accessible.
export function assertPublishedTrust(record:InstitutionRecord,trust:TrustBundle&{service?:{institutionUri:string;issuerKid:string;approvalKeyVersion:number;issuerPublicKey:unknown;policy?:unknown;serviceUri?:string;serviceKid?:string;serviceKeyVersion?:number;servicePublicKey?:unknown}},expectedPin?:string,runtimePolicy?:unknown){
 const profile=trust.service,service=profile?.serviceUri?record.services[profile.serviceUri]:undefined;
 if(!service||!service.active||profile?.serviceKid!==service.kid||profile?.serviceKeyVersion!==service.keyVersion||!profile?.servicePublicKey||hashCanonical(profile.servicePublicKey)!==hashCanonical(service.publicKey)||trust.registryProfile!=='CALLSIGN_SERVICE_JOINT_CONFIGURATION_1'||trust.policyVersion!==String(record.policy.version)||!profile||profile.institutionUri!==record.institutionUri||profile.issuerKid!==record.approvalKid||profile.approvalKeyVersion!==record.approvalKeyVersion||hashCanonical(profile.issuerPublicKey)!==hashCanonical(record.approvalPublicKey)||(expectedPin&&hashCanonical(trust)!==expectedPin)||(runtimePolicy&&(!profile.policy||hashCanonical(profile.policy)!==hashCanonical(runtimePolicy))))throw new HttpError(503,'TRUST_PUBLICATION_REQUIRED');
}
