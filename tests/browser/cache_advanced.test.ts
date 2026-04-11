import { describe, it, expect, beforeEach } from 'vitest';
import { BrowserCache } from '../../src/cache/browser';

describe('BrowserCache Class Depth', { browser: true }, () => {
    let cache: BrowserCache;

    beforeEach(async () => {
        cache = new BrowserCache();
        await cache.clear();
    });

    it('successfully deletes a specific key', async () => {
        const key = 'test-key';
        const data = {
            responsePayloadBase64: 'Y29udGVudA==',
            headers: { 'content-type': 'application/json' },
            status: 200,
            timestamp: Date.now()
        };

        await cache.set(key, data);
        let found = await cache.get(key, 10000);
        expect(found).not.toBeNull();

        await cache.delete(key);
        found = await cache.get(key, 10000);
        expect(found).toBeNull();
    });

    it('clears all entries from the store', async () => {
        await cache.set('k1', { responsePayloadBase64: 'MQ==', headers: {}, status: 200, timestamp: Date.now() });
        await cache.set('k2', { responsePayloadBase64: 'Mg==', headers: {}, status: 200, timestamp: Date.now() });

        await cache.clear();

        expect(await cache.get('k1', 10000)).toBeNull();
        expect(await cache.get('k2', 10000)).toBeNull();
    });

    it('enforces TTL during retrieval', async () => {
        const key = 'expired-key';
        const expiredData = {
            responsePayloadBase64: 'b2xk',
            headers: {},
            status: 200,
            timestamp: Date.now() - 5000 // 5 seconds ago
        };

        await cache.set(key, expiredData);

        // Get with 2s TTL - should be considered expired
        const found = await cache.get(key, 2000);
        expect(found).toBeNull();

        // Verify it was actually deleted from the DB
        // Wait a bit for the internal delete to happen if it's async
        const raw = await cache.get(key, 100000); // Very long TTL should still return null if deleted
        expect(raw).toBeNull();
    });

    it('handles large payloads reliably', async () => {
        const key = 'large-key';
        const largeString = 'a'.repeat(1024 * 1024); // 1MB string
        const data = {
            responsePayloadBase64: btoa(largeString),
            headers: {},
            status: 200,
            timestamp: Date.now()
        };

        await cache.set(key, data);
        const result = await cache.get(key, 10000);
        expect(result?.responsePayloadBase64).to.equal(data.responsePayloadBase64);
    });
});
