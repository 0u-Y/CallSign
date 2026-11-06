// Use the distinguishing end of real IDs; shared test prefixes are not work numbers.
export function shortRecordId(id:string,ids:readonly string[]){
 for(let length=8;length<id.length;length+=4){const suffix=id.slice(-length);if(!ids.some(other=>other!==id&&other.endsWith(suffix)))return suffix;}
 return id;
}

// Work completion/cancellation and permission expiry are separate server facts.
export function contactWorkState(intent:{status:string;expiresAt?:number}|undefined,now=Math.floor(Date.now()/1000)){
 return intent?.status==='open'&&intent.expiresAt!==undefined&&intent.expiresAt<=now?'expired':intent?.status;
}

// Presentation aliases for synthetic demo identities only; never used for authorization.
export function demoAccountLabel(id:string,role:'고객'|'상담원'){
 if(!id.includes('/realms/callsign-demo|'))return `${role} · ${shortRecordId(id,[id])}`;
 let hash=2166136261;for(const char of id)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 const family=['이','김','박','최','정','한','윤','서'][hash%8];
 return role==='상담원'?`${family}상담`:`${family}*${['민','영','준','희','현','진','우','연'][(hash>>>3)%8]}`;
}
export function demoOrganizationLabel(name:string){return name==='demo-bank'?'시그널카드':name==='demo-center'?'시그널 콜센터':name;}

// Keep actionable work ahead of preserved history; do not mutate API data.
export function compareContactWork(a:{status:string;expiresAt?:number},b:{status:string;expiresAt?:number},now=Math.floor(Date.now()/1000)){
 return Number(contactWorkState(b,now)==='open')-Number(contactWorkState(a,now)==='open')||(b.expiresAt??0)-(a.expiresAt??0);
}
