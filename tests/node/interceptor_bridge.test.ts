import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyGlobalGuards, removeGlobalGuards } from '../../src/core/interceptor';


describe('Interceptor Bridge Failure (Node)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        removeGlobalGuards();
        // Mock the dynamic import to fail BEFORE applyGlobalGuards is called
        vi.doMock('@mswjs/interceptors/ClientRequest', () => {
            throw new Error('bridge_import_fail');
        });
    });

    afterEach(() => {
        removeGlobalGuards();
        vi.doUnmock('@mswjs/interceptors/ClientRequest');
    });

    it('covers Node bridge failure paths (Line 58 & 73)', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        
        // This will trigger the dynamic import which we've mocked to fail
        await applyGlobalGuards();
        
        // 1st call has 2 arguments (message, error)
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to load Node.js ClientRequestInterceptor'),
            expect.anything()
        );
        
        // 2nd call has 1 argument
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Node.js bridge unavailable')
        );
        
        warnSpy.mockRestore();
    });
});
