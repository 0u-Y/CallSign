export const publicReleaseFiles: string[];
export function verifyReleaseFiles(directory:string):Promise<{status:string;scope:string;files:Array<{name:string;bytes:number;sha256:string}>}>;
