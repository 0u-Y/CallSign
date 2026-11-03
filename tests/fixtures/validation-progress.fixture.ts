import {it,expect} from 'vitest';
it('synthetic completed assertion',()=>expect(1).toBe(1));
it('synthetic failed assertion preserved before environment stop',()=>expect(1).toBe(2));
