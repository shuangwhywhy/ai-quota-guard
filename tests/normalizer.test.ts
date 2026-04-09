import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateStableKey } from '../src/keys/normalizer';

describe('Key Normalizer (Crypto Branches)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates consistent async crypto keys for identical payloads', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body = { messages: [{ role: 'user', content: 'test' }] };
    
    const key1 = await generateStableKey(url, 'POST', body);
    const key2 = await generateStableKey(url, 'POST', body);
    
    expect(key1).toBe(key2);
    expect(key1?.length).toBeGreaterThan(32); // SHA-256 hex is 64 chars
  });

  it('filters out noise and ensures hash stability using intelligent strategy', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const body1 = { model: 'gpt-4', messages: [], stream: true, temperature: 0.5 };
    const body2 = { model: 'gpt-4', messages: [], stream: false, temperature: 0.7, top_p: 1.0 };
    
    // With 'intelligent' strategy, noisy params are ignored
    const key1 = await generateStableKey(url, 'POST', body1, 'intelligent');
    const key2 = await generateStableKey(url, 'POST', body2, 'intelligent');
    expect(key1).toBe(key2);

    // With 'exact' strategy, they result in different keys
    const keyExact1 = await generateStableKey(url, 'POST', body1, 'exact');
    const keyExact2 = await generateStableKey(url, 'POST', body2, 'exact');
    expect(keyExact1).not.toBe(keyExact2);
  });

  it('falls back to node crypto when globalThis.crypto is unavailable', async () => {
    // Hide WebCrypto temporarily
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    const key = await generateStableKey('https://api.openai.com', 'POST', 'fallback test');
    expect(key).toBeTruthy();
    expect(key?.length).toBe(64); // Node crypto also outputs 64 hex SHA-256
    
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
  });

  it('falls back to fnv1a if web crypto and node crypto completely fail', async () => {
    const originalCrypto = globalThis.crypto;
    const originalProcess = globalThis.process;
    
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    // Simulate pure browser with absolutely NO node environment for node fallback
    Object.defineProperty(globalThis, 'process', { value: { release: { name: 'unknown' } }, configurable: true });

    const key = await generateStableKey('https://api.openai.com', 'POST', 'ultimate fallback test');
    expect(key).toBeTruthy();
    expect(key?.length).toBeLessThan(10); // fnv1a yields an 8 char hex typically
    
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    Object.defineProperty(globalThis, 'process', { value: originalProcess, configurable: true });
  });
});
