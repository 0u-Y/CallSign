import type {PurposePolicy,RuntimePolicy} from '@callsign/protocol';
export interface Workspace {
  analysisAvailability?:{mode:'fixture'|'disabled'|'expired'|'configured';speech:boolean;model:boolean};
  institutionUri:string;actor:{userId:string;role:string;institutionId:string};permissions:string[];policy:PurposePolicy;runtimePolicy:RuntimePolicy;services:string[];
  intents:Array<{id:string;agentId:string;recipientId:string;status:string;serviceDid:string;policyHash?:string;expiresAt?:number}>;
  attempts:Array<{id:string;intentId:string;status:string;firstConnectBy?:number;callEndBy?:number}>;
  credentials:Array<{digest:string;state:string;vc:{credentialSubject:{id:string}}}>;
}
