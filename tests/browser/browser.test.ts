import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserCache } from '../../src/cache/browser';

// Browsers tests in Vitest 4 use the stable browser mode.
// This test runs in a real Chromium environment when started with --browser.
describe('BrowserCache (IndexedDB Integration)', { browser: true }, () => {
  let cache: BrowserCache;

  beforeEach(async () => {
    cache = new BrowserCache();
    await cache.clear();
  });

  it('sets and gets entries from IndexedDB', async () => {
    const entry = {
      responsePayloadBase64: 'browser-v4-data',
      headers: { 'X-Stable-Test': 'true' },
      status: 200,
      timestamp: Date.now()
    };

    await cache.set('b-key', entry);
    const result = await cache.get('b-key', 5000);
    
    expect(result).not.toBeNull();
    expect(result?.responsePayloadBase64).toBe('browser-v4-data');
  });

  it('persists data across instances (IndexedDB)', async () => {
    const entry = {
      responsePayloadBase64: 'persistent-v4',
      headers: {},
      status: 200,
      timestamp: Date.now()
    };

    await cache.set('p-key', entry);
    
    // Simulating a fresh session by creating a new instance
    const newCache = new BrowserCache();
    const result = await newCache.get('p-key', 5000);
    
    expect(result).not.toBeNull();
    expect(result?.responsePayloadBase64).toBe('persistent-v4');
  });
});
