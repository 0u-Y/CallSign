import {it,expect} from 'vitest';
import {immutableImageReference} from '../../scripts/image-reference.mjs';
it('accepts immutable registry digests and archive image IDs, never mutable tags or zero digests',()=>{
 const digest='a'.repeat(64);
 expect(immutableImageReference(`example.test/app@sha256:${digest}`)).toBe(true);
 expect(immutableImageReference(`sha256:${digest}`)).toBe(true);
 for(const value of [undefined,'app:latest','app:v1',`sha256:${'0'.repeat(64)}`,`app@sha256:${'0'.repeat(64)}`,`sha256:${digest};id`])expect(immutableImageReference(value)).toBe(false);
});
