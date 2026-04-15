/**
 * Stats Collector: Manages a 1-minute sliding window of intercepted requests
 * and tracks cumulative aggregate metrics.
 */

import { TokenUsage } from '../providers/token-parser.js';

export interface GuardEvent {
  timestamp: number;
  type: 'HIT' | 'LIVE' | 'SHARED' | 'BREAKER';
  url: string;
  hostname: string;
  key: string;
  usage?: TokenUsage;
}

export class StatsCollector {
  private static instance: StatsCollector;
  private buffer: GuardEvent[] = [];
  
  // Totals
  private totalReceivedTokens = 0;
  private totalResponseTokens = 0;
  private totalSavedTokens = 0;
  private totalRealSpentTokens = 0;
  private totalRequests = 0;

  private listeners: Array<(event: GuardEvent) => void> = [];
  private logListeners: Array<(msg: string) => void> = [];
  private logBuffer: string[] = [];
  private readonly MAX_LOGS = 300; // Increased to allow a larger terminal output block
  private detectedUrls = new Set<string>();
  private scanBuffer = '';
  private readonly MAX_SCAN_BUFFER = 4096;

  private constructor() {
    // 1-minute cleanup interval
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 10000);
    }
  }

  public static getInstance(): StatsCollector {
    if (!this.instance) {
      this.instance = new StatsCollector();
    }
    return this.instance;
  }

  public onRecord(cb: (event: GuardEvent) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  public onLog(cb: (msg: string) => void) {
    this.logListeners.push(cb);
    return () => {
      this.logListeners = this.logListeners.filter(l => l !== cb);
    };
  }

  public addLog(msg: string) {
    this.logBuffer.push(msg);
    if (this.logBuffer.length > this.MAX_LOGS) {
      this.logBuffer.shift();
    }

    // Notify log listeners immediately for real-time dashboard updates
    this.logListeners.forEach(l => l(msg));

    // Attempt to extract localhost/network URLs (common in Vite/Next.js output)
    // Strip ANSI codes first to make regex cleaner
    // eslint-disable-next-line no-control-regex
    const cleanMsg = msg.replace(/\u001b\[[0-9;]*m/g, '');
    
    // Add to scan buffer with space delimiter to avoid merging adjacent logs into single tokens.
    // Note: This might break tests that depend on cross-chunk URL fragmentation without spaces.
    this.scanBuffer = (this.scanBuffer + ' ' + cleanMsg).slice(-this.MAX_SCAN_BUFFER);

    // Catch both localhost:port and common AI hostnames (googleapis, openai, etc.)
    const urlRegex = /(?:https?:\/\/|www\.)[^\s"'<> ]+?(?=[.,?!]?(?:\s|$|["'<>]))|(?:\w+\.)*(?:googleapis\.com|openai\.com|anthropic\.com|deepseek\.com)[^\s"'<> ]*/gi;
    const matches = this.scanBuffer.match(urlRegex);
    if (matches) {
      matches.forEach(url => {
        // Normalize URL: ensure it starts with https:// if it's a known AI host match without protocol
        let normalized = url;
        if (!normalized.startsWith('http')) {
            normalized = `https://${normalized}`;
        }
        normalized = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
        this.detectedUrls.add(normalized);
      });
    }

    // Notify general listeners that state changed
    this.listeners.forEach(l => l({ type: 'HIT', url: '', hostname: '', key: '', timestamp: Date.now() }));
  }

  public getLogs() {
    return this.logBuffer;
  }

  public getDetectedUrls() {
    return Array.from(this.detectedUrls);
  }

  public record(event: Omit<GuardEvent, 'timestamp'>) {
    const fullEvent: GuardEvent = { ...event, timestamp: Date.now() };
    this.buffer.push(fullEvent);
    this.totalRequests++;

    if (event.usage) {
      const u = event.usage;
      this.totalReceivedTokens += u.promptTokens;
      this.totalResponseTokens += u.completionTokens;

      if (event.type === 'HIT' || event.type === 'SHARED') {
        this.totalSavedTokens += u.totalTokens;
      } else if (event.type === 'LIVE') {
        this.totalRealSpentTokens += u.totalTokens;
      }
    }

    // Notify listeners
    this.listeners.forEach(l => l(fullEvent));

    // If in browser, report back to the Node proxy server to keep terminal dashboard synced
    // We bypass this during tests to avoid interfering with fetch spies and mock environments.
    const isBrowser = typeof window !== 'undefined';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTest = isBrowser && ((window as any).process?.env?.NODE_ENV === 'test' || (window as any).VITEST || (window as any).__vitest_browser__);

    if (isBrowser && typeof fetch !== 'undefined' && !isTest) {
      fetch('http://localhost:1989/__quota_guard_events', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-quota-guard-internal': 'true'
        },
        body: JSON.stringify(fullEvent)
      }).catch(() => {
        // Silently fail browser reporting if proxy is down
      });
    }
  }

  private cleanup() {
    const now = Date.now();
    const minuteAgo = now - 60000;
    this.buffer = this.buffer.filter(e => e.timestamp > minuteAgo);
  }

  public getSnapshot() {
    return {
      buffer: this.buffer,
      totals: {
        requests: this.totalRequests,
        receivedTokens: this.totalReceivedTokens,
        responseTokens: this.totalResponseTokens,
        savedTokens: this.totalSavedTokens,
        realSpentTokens: this.totalRealSpentTokens
      }
    };
  }

  public getTopServices(limit = 10) {
    const counts: Record<string, number> = {};
    for (const e of this.buffer) {
      counts[e.hostname] = (counts[e.hostname] || 0) + 1;
    }
    
    return Object.entries(counts)
      .map(([hostname, frequency]) => ({ hostname, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  public getFrequencyPerMinute() {
    return this.buffer.length;
  }

  public calculateTokensInWindow(type: 'prompt' | 'completion') {
    return this.buffer.reduce((sum, e) => {
      if (!e.usage) return sum;
      return sum + (type === 'prompt' ? e.usage.promptTokens : e.usage.completionTokens);
    }, 0);
  }

  /** @internal For testing only */
  public clear() {
    this.buffer = [];
    this.totalReceivedTokens = 0;
    this.totalResponseTokens = 0;
    this.totalSavedTokens = 0;
    this.totalRealSpentTokens = 0;
    this.totalRequests = 0;
  }
}

export const globalStats = StatsCollector.getInstance();
