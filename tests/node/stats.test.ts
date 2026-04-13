import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globalStats } from '../../src/utils/stats-collector.js';
import { computeUsage, estimateTokens, parseTokenUsage } from '../../src/providers/token-parser.js';

describe('Observability Logic', () => {
  beforeEach(() => {
    globalStats.clear();
  });

  describe('Token Parser', () => {
    it('estimates tokens based on character count', () => {
      expect(estimateTokens('hello')).toBe(2); // ceil(5/4)
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens(null)).toBe(0);
    });

    it('handles circular objects in estimateTokens', () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      expect(estimateTokens(circular)).toBe(0); // Should catch and return 0
    });

    it('parses OpenAI usage fields', () => {
      // Both present
      const body1 = { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } };
      expect(parseTokenUsage(body1)?.totalTokens).toBe(30);

      // Only prompt
      const body2 = { usage: { prompt_tokens: 10 } };
      expect(parseTokenUsage(body2)?.promptTokens).toBe(10);
      expect(parseTokenUsage(body2)?.totalTokens).toBe(10);

      // Only completion
      const body3 = { usage: { completion_tokens: 20 } };
      expect(parseTokenUsage(body3)?.completionTokens).toBe(20);
      expect(parseTokenUsage(body3)?.totalTokens).toBe(20);
      
      // Total tokens missing (recalculate)
      const body4 = { usage: { prompt_tokens: 5, completion_tokens: 5 } };
      expect(parseTokenUsage(body4)?.totalTokens).toBe(10);
    });

    it('parses Anthropic usage fields', () => {
      // Both present
      const body1 = { usage: { input_tokens: 5, output_tokens: 15 } };
      const usage1 = parseTokenUsage(body1);
      expect(usage1?.promptTokens).toBe(5);
      expect(usage1?.totalTokens).toBe(20);

      // Only input
      const body2 = { usage: { input_tokens: 5 } };
      expect(parseTokenUsage(body2)?.promptTokens).toBe(5);
      expect(parseTokenUsage(body2)?.totalTokens).toBe(5);
    });

    it('parses Gemini usage fields', () => {
      // Both present
      const body1 = { usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12, totalTokenCount: 20 } };
      const usage1 = parseTokenUsage(body1);
      expect(usage1?.promptTokens).toBe(8);
      expect(usage1?.completionTokens).toBe(12);

      // Partial fields
      const body2 = { usageMetadata: { promptTokenCount: 8 } };
      expect(parseTokenUsage(body2)?.promptTokens).toBe(8);
      expect(parseTokenUsage(body2)?.totalTokens).toBe(0); // UM has its own total field, defaults to 0
    });

    it('computes usage with fallback', () => {
      const usage1 = computeUsage('hello world', { some: 'response' });
      expect(usage1.isEstimated).toBe(true);
      expect(usage1.promptTokens).toBe(3); // ceil(11/4)

      const usage2 = computeUsage(null, { some: 'response' });
      expect(usage2.promptTokens).toBe(0);
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

    it('records LIVE events and tracks real spend', () => {
      globalStats.record({
        type: 'LIVE',
        key: 'live-key',
        url: 'https://api.openai.com/v1/chat',
        hostname: 'api.openai.com',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20, isEstimated: false }
      });

      const snapshot = globalStats.getSnapshot();
      expect(snapshot.totals.realSpentTokens).toBeGreaterThanOrEqual(20);
    });

    it('identifies top services', () => {
      globalStats.record({ type: 'LIVE', key: 'k1', url: 'u1', hostname: 'host-a' });
      globalStats.record({ type: 'LIVE', key: 'k2', url: 'u2', hostname: 'host-a' });
      globalStats.record({ type: 'LIVE', key: 'k3', url: 'u3', hostname: 'host-b' });

      const top = globalStats.getTopServices();
      expect(top[0].hostname).toBe('host-a');
      expect(top[0].frequency).toBe(2);
    });

    it('cleaned up old events from buffer', () => {
      vi.useFakeTimers();
      // Manually push an old event
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalStats as any).buffer.push({
        timestamp: Date.now() - 70000,
        type: 'HIT',
        url: 'old',
        hostname: 'old',
        key: 'old'
      });
      
      // Force cleanup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalStats as any).cleanup();
      expect(globalStats.getSnapshot().buffer.find(e => e.url === 'old')).toBeUndefined();
      vi.useRealTimers();
    });

    it('calculates tokens in window', () => {
      globalStats.record({ type: 'HIT', key: 'a', url: 'u', hostname: 'h', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10, isEstimated: false } });
      globalStats.record({ type: 'LIVE', key: 'b', url: 'u', hostname: 'h', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, isEstimated: false } });
      
      const promptSum = globalStats.calculateTokensInWindow('prompt');
      const completionSum = globalStats.calculateTokensInWindow('completion');
      
      expect(promptSum).toBe(15);
      expect(completionSum).toBe(25);
    });
  });
});
