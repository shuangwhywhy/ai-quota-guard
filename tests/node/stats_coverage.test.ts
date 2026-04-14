import { describe, it, expect, beforeEach } from 'vitest';
import { globalStats, StatsCollector } from '../../src/utils/stats-collector.js';

describe('StatsCollector Coverage Gaps', () => {
  beforeEach(() => {
    globalStats.clear();
  });

  it('covers getFrequencyPerMinute', () => {
    globalStats.record({ type: 'LIVE', key: 'k1', url: 'u1', hostname: 'h1' });
    globalStats.record({ type: 'LIVE', key: 'k2', url: 'u2', hostname: 'h2' });
    expect(globalStats.getFrequencyPerMinute()).toBe(2);
  });

  it('covers SHARED event type in record', () => {
    globalStats.record({ 
      type: 'SHARED', 
      key: 'k1', 
      url: 'u1', 
      hostname: 'h1',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, isEstimated: false }
    });
    
    const snapshot = globalStats.getSnapshot();
    expect(snapshot.totals.savedTokens).toBe(15);
  });

  it('covers calculateTokensInWindow with events missing usage', () => {
    // Record one with usage
    globalStats.record({ 
      type: 'LIVE', 
      key: 'k1', 
      url: 'u1', 
      hostname: 'h1',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, isEstimated: false }
    });
    // Record one WITHOUT usage
    globalStats.record({ type: 'LIVE', key: 'k2', url: 'u2', hostname: 'h2' });
    
    expect(globalStats.calculateTokensInWindow('prompt')).toBe(10);
    expect(globalStats.calculateTokensInWindow('completion')).toBe(5);
  });

  it('covers getTopServices limit and sorting', () => {
    globalStats.record({ type: 'LIVE', key: 'k1', url: 'u1', hostname: 'service-a' });
    globalStats.record({ type: 'LIVE', key: 'k2', url: 'u2', hostname: 'service-b' });
    globalStats.record({ type: 'LIVE', key: 'k3', url: 'u3', hostname: 'service-a' });
    globalStats.record({ type: 'LIVE', key: 'k4', url: 'u4', hostname: 'service-c' });
    
    // Test with limit 1
    const top1 = globalStats.getTopServices(1);
    expect(top1).toHaveLength(1);
    expect(top1[0].hostname).toBe('service-a');
    
    // Test default limit (should return all 3)
    const topDefault = globalStats.getTopServices();
    expect(topDefault).toHaveLength(3);
    expect(topDefault[0].hostname).toBe('service-a');
    expect(topDefault[1].frequency).toBe(1);
  });

  it('covers setInterval environment check (constructor)', () => {
    // We can't easily re-instantiate a singleton without hacking it,
    // but we can try to trigger the constructor logic if needed.
    // However, the check `typeof setInterval !== 'undefined'` is a branch.
    // To trigger it, we need to create a new instance.
    
    // @ts-expect-error accessing private constructor for coverage
    const privateCollector = new StatsCollector();
    expect(privateCollector).toBeDefined();
    
    // Mocking missing setInterval
    const originalSetInterval = global.setInterval;
    // @ts-expect-error intentional mock
    delete global.setInterval;
    
    // @ts-expect-error accessing private constructor
    const noSetIntervalCollector = new StatsCollector();
    expect(noSetIntervalCollector).toBeDefined();
    
    global.setInterval = originalSetInterval;
  });

  it('covers events with non-token-tracking types (e.g. BREAKER)', () => {
    globalStats.record({ 
      type: 'BREAKER', 
      key: 'k1', 
      url: 'u1', 
      hostname: 'h1',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, isEstimated: false }
    });
    
    const snapshot = globalStats.getSnapshot();
    // Should not increment saved or spent tokens
    expect(snapshot.totals.savedTokens).toBe(0);
    expect(snapshot.totals.realSpentTokens).toBe(0);
    expect(snapshot.totals.requests).toBe(1);
  });

  it('covers singleton getInstance branch', () => {
    // Accessing private instance to force branch
    const originalInstance = (StatsCollector as unknown as Record<string, unknown>).instance;
    // Forcefully clear it
    (StatsCollector as unknown as Record<string, unknown>).instance = undefined;
    // Also try to find if it's mangled or symbol-based (highly unlikely but playing safe)
    Object.getOwnPropertySymbols(StatsCollector).forEach(sym => {
      if (sym.toString().includes('instance')) {
        (StatsCollector as unknown as Record<string, unknown>)[sym.toString()] = undefined;
      }
    });

    const newInstance = StatsCollector.getInstance();
    expect(newInstance).toBeDefined();
    
    // Restore
    (StatsCollector as unknown as Record<string, unknown>).instance = originalInstance;
  });
});
