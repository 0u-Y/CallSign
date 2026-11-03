import {expect,it} from 'vitest';
import {analysisFixture,assertAnalysisFixtureEntry,fixtureSpeech} from '../integration/runtime-analysis-fixture.js';
import {analysisControl} from '../media/analysis-path.js';
import {bankPolicy} from '../../packages/protocol/src/index.js';
it('keeps the media provider fixture opt-in and refuses unsafe controller targets before credentials',async()=>{
 expect(()=>assertAnalysisFixtureEntry({},[])).toThrow('OWNED_ANALYSIS_FIXTURE_REQUIRED');
 const env={CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'integration',CALLSIGN_RUNTIME_IMAGE_CONFIRMATION:'OWNED_FINAL_IMAGE',CALLSIGN_MEDIA_FIXTURE_RUN_ID:'media-unit',DEPLOYMENT_ID:'test:unit',SERVICE_ROLE:'issuer'};
 expect(()=>assertAnalysisFixtureEntry(env,['--owned-analysis-fixture'])).not.toThrow();expect(()=>assertAnalysisFixtureEntry({...env,DEEPGRAM_API_KEY:'synthetic'},['--owned-analysis-fixture'])).toThrow();
 await expect(analysisControl({CALLSIGN_MEDIA_ANALYSIS_MODE:'fixture',CALLSIGN_ALLOW_EXTERNAL_EXECUTION:'media',CALLSIGN_MEDIA_ANALYSIS_CONTROL_URL:'https://external.invalid/__fixture/analysis'})).rejects.toThrow('LOOPBACK_FIXTURE_CONTROL_REQUIRED');
});
it('observes frames and aborts without retaining audio or treating synthetic responses as model quality',async()=>{
 const f=analysisFixture(),revisions:any[]=[],stream=f.providers.stream({apiKey:'test',model:'test',streamId:'remote-stream',onRevision:r=>revisions.push(r),onUnavailable(){}});stream.connect();stream.push(new Uint8Array([0,0]),1);
 f.control({op:'emit',stream:0,revision:1});expect(revisions[0].text).toBe(fixtureSpeech);
 const abort=new AbortController(),pending=f.providers.analyze!(fixtureSpeech,bankPolicy,abort.signal);abort.abort();const state=f.control({op:'state'}) as any;expect(state.streams[0].frames).toBe(1);expect(state.requests[0].aborted).toBe(true);expect(JSON.stringify(state)).not.toContain(fixtureSpeech);
 expect(()=>f.control({op:'reset'})).toThrow('FIXTURE_NOT_DRAINED');f.control({op:'resolve',request:0,mode:'suspected'});expect((await pending).purpose?.relation).toBe('suspected');stream.stop();f.control({op:'reset'});expect((f.control({op:'state'}) as any).streams).toEqual([]);
 expect(()=>f.control({op:'emit',stream:0,revision:1,url:'https://bad.invalid'})).toThrow('FIXTURE_COMMAND_INVALID');
});
