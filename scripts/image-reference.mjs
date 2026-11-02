// Registry manifest digests and local image config IDs are different, immutable identities.
export function immutableImageReference(value){
 const match=/^(?:[A-Za-z0-9._:/-]+@)?sha256:([0-9a-f]{64})$/.exec(value??'');
 return !!match&&!/^0{64}$/.test(match[1]);
}
export function ghcrImageReference(value){
 return /^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$/.test(value??'')&&!(value??'').split('/').some(part=>['','.','..'].includes(part))&&immutableImageReference(value);
}
// Docker inspect data is local evidence, not a registry manifest or runtime success result.
export function reviewDeploymentImage(key,ref,info,trustPin){
 if(!immutableImageReference(ref)||!/^sha256:[0-9a-f]{64}$/.test(info.Id??''))throw new Error('IMMUTABLE_IMAGE_REQUIRED');
 if(info.Os!=='linux'||info.Architecture!=='amd64')throw new Error('LINUX_AMD64_IMAGE_REQUIRED');
 if(key==='CALLSIGN_WEB_IMAGE'&&(!/^[0-9a-f]{64}$/.test(trustPin??'')||info.Config?.Labels?.['org.callsign.trust-sha256']!==trustPin))throw new Error('AWS_WEB_REBUILD_WITH_CURRENT_TRUST_REQUIRED');
 return {reference:ref,configId:info.Id,architecture:info.Architecture,os:info.Os,sizeBytes:info.Size,repoDigests:info.RepoDigests??[],sourceCommit:info.Config?.Labels?.['org.callsign.source-commit']??null};
}
