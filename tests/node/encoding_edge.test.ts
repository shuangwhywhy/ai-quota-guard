import { describe, it, expect } from 'vitest';
import { bufferToBase64, base64ToBuffer } from '../../src/utils/encoding';

describe('Encoding Utilities - Edge Cases & Fallbacks', () => {
  it('bufferToBase64 throws Error when Buffer and btoa are missing', () => {
    const originalBuffer = globalThis.Buffer;
    const originalBtoa = globalThis.btoa;
    
    // @ts-expect-error - simulate missing environment
    globalThis.Buffer = undefined;
    // @ts-expect-error - simulate missing environment
    globalThis.btoa = undefined;
    
    try {
      const buffer = new Uint8Array([1, 2, 3]).buffer;
      expect(() => bufferToBase64(buffer)).toThrow('No Base64 encoding utility found');
    } finally {
      globalThis.Buffer = originalBuffer;
      globalThis.btoa = originalBtoa;
    }
  });

  it('base64ToBuffer uses atob fallback when Buffer is missing', () => {
    const originalBuffer = globalThis.Buffer;
    const testBase64 = 'SGVsbG8='; // "Hello"
    
    // @ts-expect-error - simulate missing environment
    globalThis.Buffer = undefined;
    
    try {
      const buffer = base64ToBuffer(testBase64);
      const text = new TextDecoder().decode(buffer);
      expect(text).toBe('Hello');
    } finally {
      globalThis.Buffer = originalBuffer;
    }
  });

  it('base64ToBuffer throws Error when Buffer and atob are missing', () => {
    const originalBuffer = globalThis.Buffer;
    const originalAtob = globalThis.atob;
    
    // @ts-expect-error - simulate missing environment
    globalThis.Buffer = undefined;
    // @ts-expect-error - simulate missing environment
    globalThis.atob = undefined;
    
    try {
      expect(() => base64ToBuffer('SGVsbG8=')).toThrow('No Base64 decoding utility found');
    } finally {
      globalThis.Buffer = originalBuffer;
      globalThis.atob = originalAtob;
    }
  });

  it('base64ToBuffer handles correctly when Buffer is present (sanity check)', () => {
    const testBase64 = 'SGVsbG8=';
    const buffer = base64ToBuffer(testBase64);
    const text = new TextDecoder().decode(buffer);
    expect(text).toBe('Hello');
  });
});
