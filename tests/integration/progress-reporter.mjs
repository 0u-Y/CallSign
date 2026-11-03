import {openSync,writeSync,closeSync,realpathSync,statSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export default class ProgressReporter {
 constructor(){
  const path=process.env.CALLSIGN_HTTP_PROGRESS,root=process.env.CALLSIGN_HTTP_PROGRESS_ROOT;
  if(process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION!=='integration'||!path||!root||realpathSync(dirname(path))!==realpathSync(root)||(statSync(root).mode&0o077)!==0)throw new Error('OWNED_PROGRESS_OUTPUT_REQUIRED');
  this.fd=openSync(resolve(path),'wx',0o600);
 }
 onTestCaseResult(test){writeSync(this.fd,JSON.stringify({name:test.fullName.slice(0,300),state:test.result().state,clock:'vitest-process-hrtime',observerMonotonicNs:process.hrtime.bigint().toString()})+'\n');}
 onTestRunEnd(){closeSync(this.fd);}
}
