import { describe, it, expect, vi, afterEach } from 'vitest';
import { getConfig, setConfig, getDefaultConfig, DEFAULT_AI_ENDPOINTS } from '../src/config';

describe('Quota Guard Config Management', () => {
  afterEach(() => {
    // Reset to defaults
    setConfig({});
  });

  it('instantiates cleanly with well-defined defaults', () => {
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

  it('sets debounceMs to 300 by default', () => {
    const defaults = getDefaultConfig();
    expect(defaults.debounceMs).toBe(300);
  });

  it('sets cacheKeyStrategy to intelligent by default', () => {
    const defaults = getDefaultConfig();
    expect(defaults.cacheKeyStrategy).toBe('intelligent');
  });

  it('sets breakerResetTimeoutMs to 30000 by default', () => {
    const defaults = getDefaultConfig();
    expect(defaults.breakerResetTimeoutMs).toBe(30000);
  });

  it('includes all 6 default AI endpoints', () => {
    expect(DEFAULT_AI_ENDPOINTS).toContain('api.openai.com');
    expect(DEFAULT_AI_ENDPOINTS).toContain('api.anthropic.com');
    expect(DEFAULT_AI_ENDPOINTS).toContain('api.deepseek.com');
    expect(DEFAULT_AI_ENDPOINTS).toContain('api.groq.com');
    expect(DEFAULT_AI_ENDPOINTS).toContain('api.perplexity.ai');
    expect(DEFAULT_AI_ENDPOINTS.length).toBe(9);
  });

  it('allows adding custom AI endpoints via override', () => {
    setConfig({
      aiEndpoints: ['api.my-custom-llm.com']
    });

    const conf = getConfig();
    expect(conf.aiEndpoints).toEqual(['api.my-custom-llm.com']);
  });

  it('allows injecting a custom cacheAdapter', () => {
    const mockAdapter = {
      get: async () => null,
      set: async () => {},
    };
    setConfig({ cacheAdapter: mockAdapter });

    const conf = getConfig();
    expect(conf.cacheAdapter).toBe(mockAdapter);
  });

  it('resets fully when setConfig is called again with empty overrides', () => {
    setConfig({ debounceMs: 999, breakerMaxFailures: 77 });
    expect(getConfig().debounceMs).toBe(999);
    
    setConfig({});
    expect(getConfig().debounceMs).toBe(300);
    expect(getConfig().breakerMaxFailures).toBe(3);
  });
});
