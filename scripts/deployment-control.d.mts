export const deploymentServices:string[];
export function assertManagedDeployment(records:ReadonlyArray<{labels?:Record<string,string>|null}>,project:string|undefined,deploymentId:string|undefined):void;
