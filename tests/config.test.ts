import { describe, it, expect, vi } from 'vitest';
import { getConfig, setConfig, DEFAULT_AI_ENDPOINTS } from '../src/config';

describe('Quota Guard Config Management', () => {
  it('instantiates cleanly with well-defined defaults', () => {
    // Note: Vitest tests run in an isolated memory instance if run selectively,
    // but they might inherit state from other tests. We can test baseline values.
    
    // Simulate setting default by passing empty overrides
    setConfig({}); 
    
    const conf = getConfig();
    expect(conf.enabled).toBeDefined();
    expect(conf.aiEndpoints.length).toBeGreaterThanOrEqual(DEFAULT_AI_ENDPOINTS.length);
    expect(conf.cacheTtlMs).toBeGreaterThan(0);
    expect(conf.breakerMaxFailures).toBeGreaterThan(0);
  });

  it('allows precise selective overrides cleanly', () => {
    setConfig({
      debounceMs: 500,
      breakerMaxFailures: 99
    });

    const conf = getConfig();
    expect(conf.debounceMs).toBe(500);
    expect(conf.breakerMaxFailures).toBe(99);
    // Other defaults remain intact
    expect(conf.cacheTtlMs).toBe(3600000); 
  });

  it('allows injecting a custom audit logger', () => {
    const customAuditLog = vi.fn();
    setConfig({
      auditHandler: customAuditLog
    });

    const conf = getConfig();
    expect(conf.auditHandler).toBe(customAuditLog);
  });
});
