import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { hookFetch, unhookFetch } from '../../src/core/interceptor';
import { setConfig } from '../../src/config';

describe('Node.js Native Interception (Pure Node)', () => {
  beforeEach(() => {
    // Setup pure Node environment settings
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      cacheTtlMs: 1000,
      debounceMs: 0
    });

    // Mock the global fetch which handleRequest uses internally
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ node: 'native-success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    unhookFetch();
    hookFetch();
  });

  afterEach(() => {
    unhookFetch();
    vi.restoreAllMocks();
  });

  it('successfully intercepts http.request and returns mocked data', async () => {
    const postData = JSON.stringify({ model: 'gpt-4', messages: [] });
    
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const responsePromise = new Promise<{ status: number, body: string }>((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body: data });
        });
      });

      req.on('error', (e) => reject(e));
      req.write(postData);
      req.end();
    });

    const result = await responsePromise;
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).node).toBe('native-success');
    
    // Verify that our internal fetch was called (proving interception)
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('bypasses non-AI endpoints in native Node mode', async () => {
    const options = {
      hostname: 'google.com',
      path: '/',
      method: 'GET'
    };

    // This should attempt a real network connection or fail if offline,
    // but crucially, it shouldn't hit our mock fetch.
    const req = http.request(options);
    req.on('error', () => { /* ignore connection errors in air-gapped env */ });
    req.abort();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
