import { describe, it, expect, vi } from 'vitest';
import { globalStats } from '../../src/utils/stats-collector.js';
import { computeUsage, estimateTokens, parseTokenUsage } from '../../src/providers/token-parser.js';

describe('Token Parser', () => {
  it('estimates tokens based on character count', () => {
    expect(estimateTokens('hello')).toBe(2); // ceil(5/4)
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
  });

  it('parses OpenAI usage fields', () => {
    const body = { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
    const usage = parseTokenUsage(body);
    expect(usage?.promptTokens).toBe(10);
    expect(usage?.totalTokens).toBe(30);
    expect(usage?.isEstimated).toBe(false);
  });

  it('parses Anthropic usage fields', () => {
    const body = { usage: { input_tokens: 5, output_tokens: 15 } };
    const usage = parseTokenUsage(body);
    expect(usage?.promptTokens).toBe(5);
    expect(usage?.totalTokens).toBe(20);
  });

  it('parses Gemini usage fields', () => {
    const body = { usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12, totalTokenCount: 20 } };
    const usage = parseTokenUsage(body);
    expect(usage?.promptTokens).toBe(8);
    expect(usage?.completionTokens).toBe(12);
  });

  it('computes usage with fallback', () => {
    const usage = computeUsage('hello world', { some: 'response' });
    expect(usage.isEstimated).toBe(true);
    expect(usage.promptTokens).toBe(3); // ceil(11/4)
  });
});

describe('Stats Collector', () => {
  it('records events and tracks totals', () => {
    globalStats.record({
      type: 'HIT',
      key: 'test-key',
      url: 'https://api.openai.com/v1/chat',
      hostname: 'api.openai.com',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, isEstimated: false }
    });

    const snapshot = globalStats.getSnapshot();
    expect(snapshot.totals.requests).toBeGreaterThan(0);
    expect(snapshot.totals.savedTokens).toBeGreaterThanOrEqual(20);
  });

  it('identifies top services', () => {
    globalStats.record({ type: 'LIVE', key: 'k1', url: 'u1', hostname: 'host-a' });
    globalStats.record({ type: 'LIVE', key: 'k2', url: 'u2', hostname: 'host-a' });
    globalStats.record({ type: 'LIVE', key: 'k3', url: 'u3', hostname: 'host-b' });

    const top = globalStats.getTopServices();
    expect(top[0].hostname).toBe('host-a');
    expect(top[0].frequency).toBeGreaterThanOrEqual(2);
  });

  it('cleaned up old events from buffer', () => {
    // Manually push an old event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalStats as any).buffer.push({
      timestamp: Date.now() - 70000,
      type: 'HIT',
      url: 'old',
      hostname: 'old',
      key: 'old'
    });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalStats as any).cleanup();
    expect(globalStats.getSnapshot().buffer.find(e => e.url === 'old')).toBeUndefined();
  });

  it('calculates tokens in window', () => {
    // Reset or prepare data
    globalStats.record({ type: 'HIT', key: 'a', url: 'u', hostname: 'h', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10, isEstimated: false } });
    globalStats.record({ type: 'LIVE', key: 'b', url: 'u', hostname: 'h', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, isEstimated: false } });
    
    const promptSum = globalStats.calculateTokensInWindow('prompt');
    const completionSum = globalStats.calculateTokensInWindow('completion');
    
    expect(promptSum).toBeGreaterThanOrEqual(15);
    expect(completionSum).toBeGreaterThanOrEqual(25);
  });
});
