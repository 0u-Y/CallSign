import {posix} from 'node:path';

// A deployment archive is intentionally smaller than the repository. Pin omitted references to its reviewed source.
export function pinReleaseDocumentation(text:string,file:string,source:string,included:ReadonlySet<string>,tracked:ReadonlySet<string>){
 if(!/^[a-f0-9]{40}$/.test(source))throw new Error('RELEASE_DOCUMENTATION_SOURCE_REQUIRED');
 return text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g).map(block=>/^(?:```|~~~)/.test(block)?block:block.split(/(`[^`\n]*`)/g).map(part=>part.startsWith('`')?part:part.replace(/(!?\[[^\]\n]*\])\(([^\s)]+)\)/g,(match,label:string,destination:string)=>{
  if(/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(destination))return match;
  const [path,anchor]=destination.split('#',2),target=posix.normalize(posix.join(posix.dirname(file),decodeURIComponent(path!)));
  if(target==='..'||target.startsWith('../'))throw new Error('RELEASE_DOCUMENTATION_OUTSIDE_REPOSITORY');
  if(included.has(target))return match;
  if(target!=='.'&&!tracked.has(target)&&![...tracked].some(p=>p.startsWith(target+'/')))throw new Error('RELEASE_DOCUMENTATION_TARGET_MISSING:'+target);
  const encoded=target==='.'?'':target.split('/').map(encodeURIComponent).join('/'),suffix=anchor?'#'+anchor:'';
  const url=label.startsWith('!')?`https://raw.githubusercontent.com/0u-Y/CallSign/${source}/${encoded}`:`https://github.com/0u-Y/CallSign/${tracked.has(target)?'blob':'tree'}/${source}/${encoded}${suffix}`;
  return `${label}(${url})`;
 })).join('')).join('');
}
