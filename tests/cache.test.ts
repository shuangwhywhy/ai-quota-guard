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

  it('sweeps expired entries automatically after SWEEP_THRESHOLD operations', async () => {
    // Insert an entry with a known short ttlMs
    const entry = {
      responsePayloadBase64: 'gc-test',
      headers: {},
      status: 200,
      timestamp: Date.now(),
      ttlMs: 1000, // 1 second TTL
    };
    await cache.set('stale-key', entry);

    // Advance time past the entry's ttlMs
    vi.advanceTimersByTime(1500);

    // The entry is stale but hasn't been swept yet (lazy get would catch it,
    // but the GC sweep hasn't triggered). Let's verify it's gone after enough ops.
    // Trigger 50 more set() operations to hit the SWEEP_THRESHOLD (50)
    for (let i = 0; i < 50; i++) {
      await cache.set(`filler-${i}`, {
        responsePayloadBase64: 'filler',
        headers: {},
        status: 200,
        timestamp: Date.now(),
        ttlMs: 999999,
      });
    }

    // After sweep, the stale entry should be gone
    // Use a very large ttlMs in get() so the get() itself doesn't filter it out
    const result = await cache.get('stale-key', 999999);
    expect(result).toBeNull();

    // But the fresh filler entries should still be present
    const freshy = await cache.get('filler-0', 999999);
    expect(freshy).not.toBeNull();
  });
});
