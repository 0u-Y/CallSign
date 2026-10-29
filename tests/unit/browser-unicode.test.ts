import { expect,it } from 'vitest';
import { ucs2 } from '../../apps/web/src/lib/unicodeEscapes.js';
import { parseJsonNoDuplicateKeys } from '../../packages/protocol/src/index.js';
it('decodes escaped Korean and surrogate code units without a Node browser builtin',()=>{expect(ucs2.encode([0xd55c,0xae00])).toBe('한글');expect(ucs2.encode([0xd83d,0xde00])).toBe('😀');expect(parseJsonNoDuplicateKeys('{"label":"\\uD55C\\uAE00"}')).toEqual({label:'한글'});expect(()=>parseJsonNoDuplicateKeys('{"a":1,"\\u0061":2}')).toThrow('INVALID_JSON');});
