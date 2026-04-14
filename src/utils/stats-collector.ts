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

  public addLog(msg: string) {
    this.logBuffer.push(msg);
    if (this.logBuffer.length > this.MAX_LOGS) {
      this.logBuffer.shift();
    }

    // Attempt to extract localhost/network URLs (common in Vite/Next.js output)
    // Strip ANSI codes first to make regex cleaner
    // eslint-disable-next-line no-control-regex
    const cleanMsg = msg.replace(/\u001b\[[0-9;]*m/g, '');
    
    // Add to scan buffer to handle fragmented URLs across chunks
    this.scanBuffer += cleanMsg;
    if (this.scanBuffer.length > this.MAX_SCAN_BUFFER) {
        this.scanBuffer = this.scanBuffer.slice(-this.MAX_SCAN_BUFFER);
    }

    const urlRegex = /https?:\/\/[^\s"'<>]+?:\d+(?:\/[^\s"'<>]*?)?(?=[.,?!]?(?:\s|$))/g;
    const matches = this.scanBuffer.match(urlRegex);
    if (matches) {
      matches.forEach(url => {
        // Normalize URL (strip trailing slash)
        const normalized = url.endsWith('/') ? url.slice(0, -1) : url;
        this.detectedUrls.add(normalized);
      });
    }

    // Notify log listeners (re-using the same listener for simplicity or separate if needed)
    this.listeners.forEach(l => l({ type: 'HIT', url: '', hostname: '', key: '', timestamp: Date.now() })); // Trigger redraw
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
