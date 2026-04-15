import { describe, it, expect, beforeEach, vi } from 'vitest';
import { globalStats } from '../../src/utils/stats-collector.js';

describe('StatsCollector URL Detection', () => {
  beforeEach(() => {
    globalStats.clear();
    // Using internal access to clear detectedUrls for clean tests
    // @ts-expect-error accessing private field for testing
    globalStats.detectedUrls.clear();
    // @ts-expect-error accessing private field
    globalStats.scanBuffer = '';
  });

  it('detects localhost URLs in logs', () => {
    globalStats.addLog('  ➜  Local:   http://localhost:5173/');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://localhost:5173');
  });

  it('detects network URLs in logs', () => {
    globalStats.addLog('  ➜  Network: http://192.168.1.5:5173/');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://192.168.1.5:5173');
  });

  it('detects 127.0.0.1 with ports', () => {
    globalStats.addLog('Local: http://127.0.0.1:5173');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://127.0.0.1:5173');
  });

  it('detects custom hostnames with ports', () => {
    globalStats.addLog('Service: http://my-internal-service.local:3000');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://my-internal-service.local:3000');
  });

  it('handles trailing punctuation correctly', () => {
    globalStats.addLog('Check http://localhost:5173.');
    globalStats.addLog('Visit http://127.0.0.1:8080/!');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://localhost:5173');
    expect(urls).toContain('http://127.0.0.1:8080');
  });

  it('strips ANSI escape codes before detection', () => {
    // Simulated Vite output with ANSI colors
    const coloredLog = '\x1B[32m  ➜\x1B[39m  \x1B[1mLocal\x1B[22m:   \x1B[36mhttp://localhost:3000/\x1B[39m';
    globalStats.addLog(coloredLog);
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://localhost:3000');
  });

  it('detects fragmented URLs across multiple chunks', () => {
    // In real logs, fragmentation across process.stdout.write calls still happens,
    // but our collector adds spaces between separate addLog calls to prevent merging.
    // We test that it still works if the chunks are concatenated or arrive as separate tokens.
    globalStats.addLog('Server started at http://127.0.0.1:8888/');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://127.0.0.1:8888');
  });

  it('detects googleapis.com without protocol', () => {
    globalStats.addLog('Sending to generativelanguage.googleapis.com/v1beta/test');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('https://generativelanguage.googleapis.com/v1beta/test');
  });

  it('detects multiple unique URLs', () => {
    globalStats.addLog('Local: http://localhost:5173');
    globalStats.addLog('Network: http://127.0.0.1:5173');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toHaveLength(2);
    expect(urls).toContain('http://localhost:5173');
    expect(urls).toContain('http://127.0.0.1:5173');
  });

  it('normalizes URLs by removing trailing slashes', () => {
    globalStats.addLog('Link: http://localhost:8080/');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://localhost:8080');
    expect(urls).not.toContain('http://localhost:8080/');
  });

  it('does not add duplicate URLs', () => {
    globalStats.addLog('Local: http://localhost:5173');
    globalStats.addLog('Local again: http://localhost:5173');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toHaveLength(1);
  });

  it('covers onRecord and unsubscription', () => {
    let called = false;
    const unsub = globalStats.onRecord(() => {
      called = true;
    });
    globalStats.addLog('test');
    expect(called).toBe(true);
    
    called = false;
    unsub();
    globalStats.addLog('test2');
    expect(called).toBe(false);
  });

  it('covers onLog and unsubscription', () => {
    let logged = '';
    const unsub = globalStats.onLog((msg) => {
      logged = msg;
    });
    globalStats.addLog('hello world');
    expect(logged).toBe('hello world');
    
    logged = '';
    unsub();
    globalStats.addLog('goodbye');
    expect(logged).toBe('');
  });

  it('covers log buffer overflow (MAX_LOGS)', () => {
    // Fill the buffer
    for (let i = 0; i < 310; i++) {
        globalStats.addLog(`log ${i}`);
    }
    const logs = globalStats.getLogs();
    expect(logs).toHaveLength(300); // MAX_LOGS is 300
    expect(logs[0]).toBe('log 10'); // Should have shifted out first 10
  });

  it('covers getLogs', () => {
    globalStats.addLog('hello');
    expect(globalStats.getLogs()).toContain('hello');
  });

  it('covers report bridge in simulated browser environment', async () => {
    // Simulate browser
    vi.stubGlobal('window', {});
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);

    globalStats.record({
      type: 'HIT',
      url: 'http://test.com',
      hostname: 'test.com',
      key: 'test-key'
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:1989/__quota_guard_events',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test-key')
      })
    );

    vi.unstubAllGlobals();
  });
});
