import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hookAxios } from '../src/axios';
import { setConfig } from '../src/config';

describe('Axios Interceptor Hook', () => {
  let mockAxios: {
    interceptors: { 
      request: { use: ReturnType<typeof vi.fn> } 
    };
    VERSION?: string;
  };

  beforeEach(() => {
    mockAxios = {
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
    };
    setConfig({ enabled: true, aiEndpoints: ['api.openai.com', 'api.anthropic.com', 'api.deepseek.com', 'generativelanguage.googleapis.com', 'api.cohere.ai', 'api.mistral.ai'] });
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

  it('mutates the adapter to "fetch" for OpenAI endpoint', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.openai.com/v1/chat/completions' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('mutates the adapter to "fetch" for Anthropic endpoint', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.anthropic.com/v1/messages' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('mutates the adapter to "fetch" for DeepSeek endpoint', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.deepseek.com/chat/completions' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('mutates the adapter to "fetch" for Google Gemini endpoint', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('mutates the adapter to "fetch" for Cohere endpoint', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.cohere.ai/v1/chat' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('mutates the adapter to "fetch" for Mistral endpoint', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.mistral.ai/v1/chat/completions' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('computes baseURL cleanly when targeting AI endpoints', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { baseURL: 'https://api.openai.com', url: '/v1/chat/completions' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBe('fetch');
  });

  it('ignores completely irrelevant host URLs', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.google.com/search' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBeUndefined(); // Unchanged
  });

  it('ignores completely if config.enabled is turned off', () => {
    setConfig({ enabled: false, aiEndpoints: ['api.openai.com'] });

    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    // Even if it targets openai, the system is globally disabled
    const config: Record<string, unknown> = { url: 'https://api.openai.com/v1/chat' };
    const modifiedConfig = interceptorFn(config);

    expect(modifiedConfig.adapter).toBeUndefined();
  });

  it('warns and skips adapter mutation for old Axios versions (< 1.7.0)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    mockAxios.VERSION = '1.6.8';
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.openai.com/v1/chat' };
    const result = interceptorFn(config);

    expect(result.adapter).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1.6.8'));
    warnSpy.mockRestore();
  });

  it('warns and skips adapter mutation for very old Axios versions (0.x)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    mockAxios.VERSION = '0.27.2';
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.openai.com/v1/chat' };
    const result = interceptorFn(config);

    expect(result.adapter).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('0.27.2'));
    warnSpy.mockRestore();
  });

  it('allows adapter mutation for Axios >= 1.7.0', () => {
    mockAxios.VERSION = '1.7.0';
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.openai.com/v1/chat' };
    const result = interceptorFn(config);

    expect(result.adapter).toBe('fetch');
  });

  it('allows adapter mutation for Axios >= 2.0.0', () => {
    mockAxios.VERSION = '2.1.0';
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.openai.com/v1/chat' };
    const result = interceptorFn(config);

    expect(result.adapter).toBe('fetch');
  });

  it('allows adapter mutation when VERSION is undefined (unknown version)', () => {
    // No VERSION property — defensive bypass
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = { url: 'https://api.openai.com/v1/chat' };
    const result = interceptorFn(config);

    expect(result.adapter).toBe('fetch');
  });

  it('handles empty url and empty baseURL gracefully', () => {
    hookAxios(mockAxios);
    const interceptorFn = mockAxios.interceptors.request.use.mock.calls[0][0];

    const config: Record<string, unknown> = {};
    const result = interceptorFn(config);

    expect(result.adapter).toBeUndefined();
  });
});
