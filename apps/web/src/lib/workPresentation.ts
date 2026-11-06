// Use the distinguishing end of real IDs; shared test prefixes are not work numbers.
export function shortRecordId(id:string,ids:readonly string[]){
 for(let length=8;length<id.length;length+=4){const suffix=id.slice(-length);if(!ids.some(other=>other!==id&&other.endsWith(suffix)))return suffix;}
 return id;
}

// Work completion/cancellation and permission expiry are separate server facts.
export function contactWorkState(intent:{status:string;expiresAt?:number}|undefined,now=Math.floor(Date.now()/1000)){
 return intent?.status==='open'&&intent.expiresAt!==undefined&&intent.expiresAt<=now?'expired':intent?.status;
}
