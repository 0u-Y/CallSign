import { expect,it } from 'vitest';
import { assertRecentAuthentication } from '../../services/api/src/auth.js';
it('requires a real recent OIDC authentication time, not a fresh token issue time',()=>{const now=1800000000000;expect(()=>assertRecentAuthentication({authenticatedAt:new Date(now-1000)},now)).not.toThrow();for(const session of [{},{authenticatedAt:new Date(0)},{authenticatedAt:new Date(now-300001)},{authenticatedAt:new Date(now+1001)},{authenticatedAt:new Date('invalid')}])expect(()=>assertRecentAuthentication(session,now)).toThrow('RECENT_AUTHENTICATION_REQUIRED');});
