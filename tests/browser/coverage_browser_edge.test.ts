import { describe, it, expect } from 'vitest';
import { BrowserCache } from '../../src/cache/browser';

describe('Browser-Specific Coverage Edges', () => {
    it('covers BrowserCache line 24 (db initialization race)', async () => {
        const bc = new BrowserCache();
        const p1 = bc.get('key');
        const p2 = bc.get('key'); // Hits !this.db branch while p1 is initing
        await Promise.all([p1, p2]);
        expect(await bc.get('key')).toBeNull();
    });
});
