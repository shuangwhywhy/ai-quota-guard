import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../src/cache/memory';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets and gets cache entries perfectly', async () => {
    const entry = {
      responsePayloadBase64: 'base64data',
      headers: { 'Content-Type': 'application/json' },
      status: 200,
      timestamp: Date.now()
    };

    await cache.set('key1', entry);
    const result = await cache.get('key1', 5000);

    // It should strictly equal the same object/content inserted
    expect(result).toBeDefined();
    expect(result?.responsePayloadBase64).toBe('base64data');
    expect(result?.status).toBe(200);
  });

  it('rejects keys that have expired (TTL validation)', async () => {
    const entry = {
      responsePayloadBase64: 'stale-data',
      headers: {},
      status: 200,
      timestamp: Date.now()
    };

    await cache.set('key1', entry);

    // Fast-forward 5001ms (past the TTL of 5000)
    vi.advanceTimersByTime(5001);

    const result = await cache.get('key1', 5000);
    // Should be automatically swept away
    expect(result).toBeNull();
  });

  it('maintains valid keys strictly within TTL window', async () => {
    const entry = {
      responsePayloadBase64: 'fresh-data',
      headers: {},
      status: 200,
      timestamp: Date.now()
    };

    await cache.set('key1', entry);

    // Fast-forward 4999ms (just brushing the edge of TTL validity)
    vi.advanceTimersByTime(4999);

    const result = await cache.get('key1', 5000);
    expect(result).not.toBeNull();
    expect(result?.responsePayloadBase64).toBe('fresh-data');
  });

  it('clears all entries strictly via clear()', async () => {
    await cache.set('key1', { responsePayloadBase64: 'data', headers: {}, status: 200, timestamp: Date.now() });
    
    expect(await cache.get('key1', 5000)).not.toBeNull();
    
    await cache.clear();
    
    expect(await cache.get('key1', 5000)).toBeNull();
  });
});
