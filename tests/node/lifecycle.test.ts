import { describe, it, expect, vi, afterEach } from 'vitest';
import { injectQuotaGuard } from '../../src/setup';
import * as interceptor from '../../src/core/interceptor';
import { getConfig } from '../../src/config';

describe('Setup & Lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injectQuotaGuard sets config and calls hookFetch', async () => {
    const hookSpy = vi.spyOn(interceptor, 'hookFetch').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    await injectQuotaGuard({
      debounceMs: 123
    });
    
    expect(getConfig().debounceMs).toBe(123);
    expect(hookSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('READY'));
  });

  it('injectQuotaGuard works without config argument', async () => {
    const hookSpy = vi.spyOn(interceptor, 'hookFetch').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    
    await injectQuotaGuard();
    
    expect(hookSpy).toHaveBeenCalled();
  });

  it('register.ts side effect works', async () => {
    const hookSpy = vi.spyOn(interceptor, 'hookFetch').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Dynamically importing register should trigger injection
    await import('../../src/register');
    
    expect(hookSpy).toHaveBeenCalled();
  });
});
