import {vi} from 'vitest';
// Vitest's module runner does not inherit Node resolve hooks. Only substitute driver transport.
vi.mock('postgres',async()=>({default:(await import('./postgres-unix.mjs')).default}));
