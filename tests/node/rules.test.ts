import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GuardPipeline } from '../../src/core/pipeline';
import { setConfig, getDefaultConfig } from '../../src/config';

describe('Guard Engine - Rules & Overrides', () => {
  let pipeline: GuardPipeline;
  const emitAudit = vi.fn();

  beforeEach(() => {
    pipeline = new GuardPipeline(emitAudit);
    // Reset to default config
    setConfig(getDefaultConfig());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should apply global config by default', async () => {
    setConfig({ enabled: true, debounceMs: 500 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isGuarded = (pipeline as any).isGuarded('https://api.openai.com/v1/chat', 'POST', getDefaultConfig());
    expect(isGuarded).toBe(true);
  });

  it('should match rules based on URL regex', async () => {
    const config = {
      ...getDefaultConfig(),
      rules: [
        {
          match: { url: /.*\/special/ },
          override: { debounceMs: 0 }
        }
      ]
    };
    
    const headers = { 'content-type': 'application/json' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const effective = (pipeline as any).getEffectiveConfig('https://api.openai.com/v1/special', headers, config);
    expect(effective.debounceMs).toBe(0);
  });

  it('should match rules based on Headers', async () => {
    const config = {
      ...getDefaultConfig(),
      rules: [
        {
          match: { headers: { 'x-feature': 'fast' } },
          override: { debounceMs: 10 }
        }
      ]
    };
    
    const headers = { 'x-feature': 'fast', 'content-type': 'application/json' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const effective = (pipeline as any).getEffectiveConfig('https://api.openai.com/v1/chat', headers, config);
    expect(effective.debounceMs).toBe(10);
  });

  it('should NOT match rules if header value differs', async () => {
    const config = {
      ...getDefaultConfig(),
      rules: [
        {
          match: { headers: { 'x-feature': 'fast' } },
          override: { debounceMs: 10 }
        }
      ]
    };
    
    const headers = { 'x-feature': 'slow' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const effective = (pipeline as any).getEffectiveConfig('https://api.openai.com/v1/chat', headers, config);
    expect(effective.debounceMs).toBe(300); // Default
  });

  it('should recognize standard bypass headers', async () => {
    const config = {
      ...getDefaultConfig(),
      bypassCacheHeaders: ['cache-control']
    };
    
    const request = new Request('https://api.openai.com/v1/chat', { 
      method: 'POST',
      headers: { 'cache-control': 'no-cache' }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headersMap = (pipeline as any).getHeadersMap(request);
    
    const hasBypass = config.bypassCacheHeaders.some(h => headersMap[h] !== undefined);
    expect(hasBypass).toBe(true);
  });
});
