import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserCache } from '../../src/cache/browser';

describe('BrowserCache (IndexedDB Integration)', () => {
    let cache: BrowserCache;

    beforeEach(async () => {
        cache = new BrowserCache();
        try {
            await cache.clear();
        } catch (e) {
            console.error('Clear failed (possibly first run)', e);
        }
    });

    it('sets and gets entries from IndexedDB', async () => {
        const entry = {
            responsePayloadBase64: 'browser-data',
            headers: { 'X-Test': 'true' },
            status: 200,
            timestamp: Date.now()
        };

        await cache.set('browser-key', entry);
        const result = await cache.get('browser-key', 10000);
        
        expect(result).not.toBeNull();
        expect(result?.responsePayloadBase64).toBe('browser-data');
    });

    it('persists data across "reloads" (new instance)', async () => {
        const entry = {
            responsePayloadBase64: 'persistent-data',
            headers: {},
            status: 200,
            timestamp: Date.now()
        };

        await cache.set('p-key', entry);
        
        // Create a new instance to simulate a reload/new session
        const newCache = new BrowserCache();
        const result = await newCache.get('p-key', 10000);
        
        expect(result).not.toBeNull();
        expect(result?.responsePayloadBase64).toBe('persistent-data');
    });

    it('clears all data', async () => {
        await cache.set('k1', { responsePayloadBase64: 'd1', headers: {}, status: 200, timestamp: Date.now() });
        await cache.clear();
        const result = await cache.get('k1', 10000);
        expect(result).toBeNull();
    });
});
