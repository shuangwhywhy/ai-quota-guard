import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GuardPipeline } from '../../src/core/pipeline';
import { setConfig, getDefaultConfig } from '../../src/config';
import { globalInFlightRegistry } from '../../src/registry/in-flight';
import { globalCache } from '../../src/cache/memory';

describe('Guard Engine - Diagnostics & Warnings', () => {
  let pipeline: GuardPipeline;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let emitAudit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emitAudit = vi.fn();
    pipeline = new GuardPipeline(emitAudit);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setConfig(getDefaultConfig());
    globalInFlightRegistry.clear();
    globalCache.clear();
    consoleWarnSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log a FINGERPRINT_COLLISION warning when headers differ on in-flight hit', async () => {
    const key = 'test-key';
    const originalSnapshot = {
      url: 'https://api.openai.com/v1/chat',
      method: 'POST',
      headers: { 'authorization': 'Bearer token-A', 'x-api-key': 'key-A' }
    };
    
    // Simulate an existing in-flight request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalInFlightRegistry.set(key, { broadcaster: {} as any, snapshot: originalSnapshot } as any);

    // Current request has different metadata but same key (simulated by using the same key)
    const currentSnapshot = {
      url: 'https://api.openai.com/v1/chat',
      method: 'POST',
      headers: { 'authorization': 'Bearer token-B', 'x-api-key': 'key-B' }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pipeline as any).logFingerprintConflict(currentSnapshot, originalSnapshot, key);

    expect(consoleWarnSpy).toHaveBeenCalled();
    const lastWarning = consoleWarnSpy.mock.calls[0][0];
    expect(lastWarning).toContain('[FINGERPRINT_COLLISION]');
    expect(lastWarning).toContain('Bearer token-B');
    expect(lastWarning).toContain('Bearer token-A');
  });

  it('should log a BYPASS_IGNORED warning when no-cache is present', async () => {
    const url = 'https://api.openai.com/v1/chat';
    const key = 'test-key';
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pipeline as any).logIntentConflict('BYPASS_IGNORED', url, key, 'cache-control: no-cache', 'Served from cache');

    expect(consoleWarnSpy).toHaveBeenCalled();
    const lastWarning = consoleWarnSpy.mock.calls.find((call: [string]) => call[0].includes('[BYPASS_IGNORED]'))![0];
    expect(lastWarning).toContain('no-cache');
    expect(lastWarning).toContain('How to Bypass');
  });

  it('should include keyHeaders in collision detection', async () => {
    setConfig({ ...getDefaultConfig(), keyHeaders: ['X-Project-ID'] });
    
    const original = { url: 'u', method: 'M', headers: { 'x-project-id': 'proj-1' } };
    const current = { url: 'u', method: 'M', headers: { 'x-project-id': 'proj-2' } };
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pipeline as any).logFingerprintConflict(current, original, 'k');
    
    const lastWarning = consoleWarnSpy.mock.calls[0][0];
    expect(lastWarning).toContain('x-project-id');
    expect(lastWarning).toContain('proj-1');
    expect(lastWarning).toContain('proj-2');
  });
});
