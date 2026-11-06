export const deploymentServices:string[];
export function assertManagedDeployment(records:ReadonlyArray<{labels?:Record<string,string>|null}>,project:string|undefined,deploymentId:string|undefined):void;
export function safeStopRecords<T extends {labels?:Record<string,string>|null}>(records:ReadonlyArray<T>,project:string|undefined,deploymentId:string|undefined):{owned:T[];excluded:T[]};
export const serverStartStages:string[][];
export interface ExistingServerRecord {
 id:string; labels:Record<string,string>; state:string; imageReference:string; image:string;
 network:string; ports:Record<string,unknown>|null; privileged:boolean; memory:number; swap:number; cpu:number; restart:string; oom:boolean;
 entrypoint?:string[]|null; command?:string[]|null; environment?:string[]|null;
}
export function existingServerStages(records:ReadonlyArray<ExistingServerRecord>,env:Record<string,string|undefined>,issuerImage?:{id:string;labels?:Record<string,string>|null}):ExistingServerRecord[][];
export function assertLiveServerMonitor(
 ready:{deploymentId?:string;pid?:number;processStart?:string;policy?:string;expiresMonotonicNs?:number|null},
 sample:{observerPid?:number;monotonicNs?:number;stop?:unknown;memAvailableBytes?:number|null|undefined;ownedBytes?:number|null},
 observed:{deploymentId:string;pid:number;processStart:string;ageSeconds:number;nowNs:number;starting?:boolean;resourcePolicy?:string}
):void;
