import { describe, it, expect, vi } from 'vitest';

describe('Buffer hiding experiment', () => {
  it('hides Buffer from code', () => {
    const originalBuffer = globalThis.Buffer;
    // @ts-ignore
    globalThis.Buffer = undefined;
    
    const checkBuffer = () => {
      return typeof Buffer === 'undefined';
    };
    
    const result = checkBuffer();
    // @ts-ignore
    globalThis.Buffer = originalBuffer;
    
    expect(result).toBe(true);
  });
});
