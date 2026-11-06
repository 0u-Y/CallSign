import {expect,it,vi} from 'vitest';
import {finishPaidAnalysis} from '../media/analysis-path.js';
it('preserves the original analysis failure even when terminated-call cleanup also fails',async()=>{
 const primary=Error('ANALYSIS_COMPLETION_TIMEOUT'),cleanup=vi.fn(async()=>{throw Error('WITHDRAWAL_UNAVAILABLE');});
 await expect(finishPaidAnalysis(primary,cleanup)).rejects.toBe(primary);expect(cleanup).toHaveBeenCalledOnce();
});
it('does not turn cleanup failure into a passing completed analysis',async()=>{
 const cleanup=Error('CLEANUP_FAILED');await expect(finishPaidAnalysis(undefined,async()=>{throw cleanup;})).rejects.toBe(cleanup);
 await expect(finishPaidAnalysis(undefined,async()=>{})).resolves.toBeUndefined();
});
