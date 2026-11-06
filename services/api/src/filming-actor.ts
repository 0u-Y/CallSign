import {HttpError} from './auth.js';
import {membership,type Actor,type InstitutionRecord} from './finals-model.js';

export function filmingActor(session:Actor,role:unknown,record:InstitutionRecord,config:{enabled:boolean;operatorId?:string|undefined;gatewayId?:string|undefined;recipientId?:string|undefined}):Actor{
 if(role===undefined)return session;
 if(!config.enabled||session.role!=='institution'||session.userId!==config.operatorId||!config.gatewayId||!config.recipientId||config.gatewayId===config.recipientId)throw new HttpError(403,'FILMING_NOT_ALLOWED');
 const userId:string|undefined=role==='gateway'?config.gatewayId:role==='recipient'?config.recipientId:undefined;
 if(!userId||userId===session.userId)throw new HttpError(403,'FILMING_ROLE_FORBIDDEN');
 const actor:Actor={userId,role:userId===config.gatewayId?'gateway':'recipient',institutionId:session.institutionId,membershipGeneration:record.members[userId]?.sessionGeneration??0};
 membership(record,actor,[actor.role]);
 return actor;
}
