import { describe, it, expect, vi } from 'vitest';

describe('Buffer hiding experiment', () => {
  it('hides Buffer from code', () => {
    const originalBuffer = globalThis.Buffer;
    // @ts-expect-error - ignore type mismatch
    globalThis.Buffer = undefined;
    
    const checkBuffer = () => {
      return typeof Buffer === 'undefined';
    };
    
    const result = checkBuffer();
    // @ts-expect-error - ignore type mismatch
    globalThis.Buffer = originalBuffer;
    
    expect(result).toBe(true);
  });
});
