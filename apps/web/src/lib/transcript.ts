import {transcriptRevisionSchema,type TranscriptRevision} from '@callsign/protocol';
export function nextTranscript(previous:TranscriptRevision[],value:unknown){
 const revision=transcriptRevisionSchema.parse(value),current=previous.filter(s=>s.streamId===revision.streamId),old=current.find(s=>s.segmentId===revision.segmentId);
 if(old&&(old.revision>=revision.revision||(old.final&&!revision.final)))return previous;
 const next=old?current.map(s=>s.segmentId===revision.segmentId?revision:s):[...current,revision];
 return next.sort((a,b)=>/^\d+(?:\.\d+)?$/.test(a.segmentId)&&/^\d+(?:\.\d+)?$/.test(b.segmentId)?Number(a.segmentId)-Number(b.segmentId):0).slice(-6);
}
