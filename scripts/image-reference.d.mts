export function immutableImageReference(value: string | undefined): boolean;
export function ghcrImageReference(value: string | undefined): boolean;
export function reviewDeploymentImage(key:string,ref:string,info:{Id?:string;Os?:string;Architecture?:string;Size?:number;RepoDigests?:string[];Config?:{Labels?:Record<string,string>}},trustPin?:string):{reference:string;configId:string|undefined;architecture:string|undefined;os:string|undefined;sizeBytes:number|undefined;repoDigests:string[];sourceCommit:string|null};
