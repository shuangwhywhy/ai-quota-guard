import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { applyGlobalGuards, removeGlobalGuards } from '../../src/core/interceptor';
import { setConfig } from '../../src/config';

describe('Node.js Native Interception (Pure Node)', () => {
  // Use a mock audit logger to verify interception deterministically
  const auditLog = vi.fn();

  beforeEach(async () => {
    auditLog.mockClear();
    setConfig({
      enabled: true,
      aiEndpoints: ['api.openai.com'],
      cacheTtlMs: 1000,
      debounceMs: 0,
      auditHandler: (e) => auditLog(e) // Wrap it to ensure it's always the latest mock
    });

    // Mock the global fetch which handleRequest uses internally
    // We must do this BEFORE applyGlobalGuards to ensure the interceptor sees the mock
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ node: 'native-success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    removeGlobalGuards();
    applyGlobalGuards();
    // Small delay to ensure interceptors are applied in the environment
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(() => {
    removeGlobalGuards();
    vi.restoreAllMocks();
  });

  it('successfully intercepts http.request and returns mocked data', async () => {
    const postData = JSON.stringify({ model: 'gpt-4', messages: [] });
    
    const options = {
      // Use a domain that DEFINITELY exists in AI endpoints but NO real server
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
    
    // Diagnostic: check if http.request is patched
    console.log('[Test Debug] http.request is patched:', http.request.toString().includes('interceptor') || http.request.toString().includes('bound'));
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).node).toBe('native-success');
    
    // Verify that the audit handler recorded the interception correctly
    // It should have recorded 'request_started' and 'live_called' (to our mock fetch)
    const eventTypes = auditLog.mock.calls.map(call => call[0].type);
    expect(eventTypes).toContain('request_started');
    expect(eventTypes).toContain('live_called');
  });

  it('bypasses non-AI endpoints in native Node mode', async () => {
    const options = {
      hostname: 'google.com',
      path: '/',
      method: 'GET'
    };

    // We expect this to either fail due to air-gap or succeed with real network,
    // but it MUST NOT trigger our audit handler's AI-specific events.
    const req = http.request(options);
    req.on('error', () => { /* ignore */ });
    req.abort();

    const eventTypes = auditLog.mock.calls.map(call => call[0].type);
    expect(eventTypes).not.toContain('live_called');
  });
});
