// Registry manifest digests and local image config IDs are different, immutable identities.
export function immutableImageReference(value){
 const match=/^(?:[A-Za-z0-9._:/-]+@)?sha256:([0-9a-f]{64})$/.exec(value??'');
 return !!match&&!/^0{64}$/.test(match[1]);
}
