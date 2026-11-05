import {expect,it} from 'vitest';
import {nextTranscript} from '../../apps/web/src/lib/transcript.js';
const segment=(id:string,revision=1,text='상대 발화')=>({streamId:'current',segmentId:id,revision,text,final:true,source:'remote' as const});
it('keeps corrected remote segments ordered, bounded and isolated by stream',()=>{
 let state=nextTranscript([],segment('2'));state=nextTranscript(state,segment('1'));
 expect(state.map(s=>s.segmentId)).toEqual(['1','2']);state=nextTranscript(state,segment('1',2,'정정 발화'));
 expect(nextTranscript(state,segment('1',1))).toBe(state);expect(nextTranscript(state,{...segment('1',3),final:false})).toBe(state);
 for(let n=3;n<12;n++)state=nextTranscript(state,segment(String(n)));
 expect(state).toHaveLength(6);expect(nextTranscript(state,{...segment('0'),streamId:'new'})).toHaveLength(1);
 expect(()=>nextTranscript(state,{...segment('0'),source:'local'})).toThrow();
});
