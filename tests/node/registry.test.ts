import { describe, it, expect } from 'vitest';

describe('Global Registry Singleton (in-flight)', () => {
  it('correctly exports the globalInFlightRegistry', async () => {
    // Importing index.ts hits the exports and setup code
    const index = await import('../../src/index');
    expect(index.globalInFlightRegistry).toBeDefined();
    expect(index.globalInFlightRegistry.size).toBeDefined();
  });

  it('survives re-import by using the global context', async () => {
    const GLOBAL_KEY = '__QUOTA_GUARD_IN_FLIGHT_REGISTRY__';
    await import('../../src/registry/in-flight');
    // @ts-expect-error - testing internal singleton logic
    const initial = globalThis[GLOBAL_KEY];
    expect(initial).toBeDefined();
    
    // Dynamically re-import the module to hit the branch
    const mod = await import('../../src/registry/in-flight?' + Date.now());
    expect(mod.globalInFlightRegistry).toBe(initial);
  });
});
