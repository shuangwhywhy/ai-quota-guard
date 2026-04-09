import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hookAxios } from '../src/axios';
import { setConfig } from '../src/config';

describe('Axios Interceptor Hook', () => {
  let mockAxios: any;

  beforeEach(() => {
    mockAxios = {
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
    };
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com'] });
  });

  it('bypasses gracefully if axios instance is invalid', () => {
    // Should not throw
    hookAxios(undefined);
    hookAxios({});
    hookAxios({ interceptors: null });
  });

  it('registers request interceptor successfully', () => {
    hookAxios(mockAxios);
    expect(mockAxios.interceptors.request.use).toHaveBeenCalledTimes(1);
    expect(typeof mockAxios.interceptors.request.use.mock.calls[0][0]).toBe('function');
  });

  it('mutates the adapter to "fetch" if URL matches an AI endpoint', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: any = { url: 'https://api.openai.com/v1/chat/completions' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('computes baseURL cleanly when targeting AI endpoints', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: any = { baseURL: 'https://api.openai.com', url: '/v1/chat/completions' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('ignores completely irrelevant host URLs', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: any = { url: 'https://api.google.com/search' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBeUndefined(); // Unchanged
  });

  it('ignores completely if config.enabled is turned off', () => {
    setConfig({ enabled: false, aiEndpoints: ['api.openai.com'] });

    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    // Even if it targets openai, the system is globally disabled
    const config: any = { url: 'https://api.openai.com/v1/chat' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBeUndefined();
  });
});
