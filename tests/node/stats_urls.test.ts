import { describe, it, expect, beforeEach } from 'vitest';
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
    globalStats.addLog('Server started at http://127.');
    globalStats.addLog('0.0.1:');
    globalStats.addLog('8888/');
    const urls = globalStats.getDetectedUrls();
    expect(urls).toContain('http://127.0.0.1:8888');
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

  it('covers log buffer overflow (MAX_LOGS)', () => {
    // Fill the buffer
    for (let i = 0; i < 110; i++) {
        globalStats.addLog(`log ${i}`);
    }
    const logs = globalStats.getLogs();
    expect(logs).toHaveLength(100); // MAX_LOGS is 100
    expect(logs[0]).toBe('log 10'); // Should have shifted out first 10
  });

  it('covers getLogs', () => {
    globalStats.addLog('hello');
    expect(globalStats.getLogs()).toContain('hello');
  });
});
