import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFetchInterceptor, removeGlobalGuards } from '../../src/core/interceptor';
import { globalStats } from '../../src/utils/stats-collector';
import { setConfig } from '../../src/config';
import { GuardPipeline } from '../../src/core/pipeline';

describe('Interceptor Observability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalStats.clear();
    setConfig({ enabled: true, aiEndpoints: [/openai/] });
  });

  afterEach(() => {
    removeGlobalGuards();
  });

  it('handles non-JSON responses from cache (isJson branch)', async () => {
    const mockResponse = new Response('not json', {
      headers: { 'content-type': 'text/plain' }
    });
    
    // Mock pipeline to return a HIT from cache
    vi.spyOn(GuardPipeline.prototype, 'processRequest').mockResolvedValue({
      status: 'HIT',
      key: 'test-key',
      response: mockResponse
    });

    const mockFetch = vi.fn();
    const guardedFetch = createFetchInterceptor(mockFetch);
    
    await guardedFetch('https://api.openai.com/v1/chat');
    
    // Wait for async logging task
    await new Promise(r => setTimeout(r, 50));
    
    const snapshot = globalStats.getSnapshot();
    const event = snapshot.buffer.find(e => e.key === 'test-key');
    expect(event).toBeDefined();
    // Non-JSON response will be estimated
    expect(event?.usage?.isEstimated).toBe(true);
  });

  it('handles errors in async logging task (catch block)', async () => {
    const mockResponse = new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' }
    });
    
    // Mock pipeline to return a HIT
    vi.spyOn(GuardPipeline.prototype, 'processRequest').mockResolvedValue({
      status: 'HIT',
      key: 'crash-key',
      response: mockResponse
    });

    // Mock response.clone to throw to trigger catch block
    const cloneSpy = vi.spyOn(Response.prototype, 'clone').mockImplementation(() => {
      throw new Error('Clone crash');
    });

    const mockFetch = vi.fn();
    const guardedFetch = createFetchInterceptor(mockFetch);
    
    // This should NOT crash the main request
    await guardedFetch('https://api.openai.com/v1/chat');
    
    await new Promise(r => setTimeout(r, 50));
    cloneSpy.mockRestore();
  });

  it('respects consoleLog configuration', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // 1. consoleLog = true (default)
    setConfig({ consoleLog: true, aiEndpoints: [/openai/] });
    vi.spyOn(GuardPipeline.prototype, 'processRequest').mockResolvedValue({
      status: 'HIT',
      key: 'log-key',
      response: new Response('{}')
    });
    
    const guardedFetch = createFetchInterceptor(vi.fn());
    await guardedFetch('https://api.openai.com/v1/chat');
    await new Promise(r => setTimeout(r, 50));
    expect(logSpy).toHaveBeenCalled();

    // 2. consoleLog = false
    logSpy.mockClear();
    setConfig({ consoleLog: false, aiEndpoints: [/openai/] });
    await guardedFetch('https://api.openai.com/v1/chat');
    await new Promise(r => setTimeout(r, 50));
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('handles BREAKER logging and stats', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setConfig({ consoleLog: true, aiEndpoints: [/openai/] });

    // Mock pipeline to return an error (which triggers BREAKER path in interceptor)
    vi.spyOn(GuardPipeline.prototype, 'processRequest').mockResolvedValue({
      error: new Error('Breaker open'),
      key: 'breaker-key'
    });

    const guardedFetch = createFetchInterceptor(vi.fn());
    await guardedFetch('https://api.openai.com/v1/chat');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('BREAKER'));
    const snapshot = globalStats.getSnapshot();
    expect(snapshot.buffer.some(e => e.type === 'BREAKER')).toBe(true);
  });
});
