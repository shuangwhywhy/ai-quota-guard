import { describe, it, expect, beforeEach } from 'vitest';
import { PromiseDebouncer } from '../src/utils/debounce-promise';

describe('PromiseDebouncer', () => {
  let debouncer: PromiseDebouncer;

  beforeEach(() => {
    debouncer = new PromiseDebouncer();
  });

  it('resolves immediately when delayMs is 0', async () => {
    let resolved = false;
    await debouncer.debounce('key1', 0);
    resolved = true;
    expect(resolved).toBe(true);
  });

  it('resolves immediately when delayMs is negative', async () => {
    let resolved = false;
    await debouncer.debounce('key1', -100);
    resolved = true;
    expect(resolved).toBe(true);
  });

  it('holds callers until delay expires, then releases all simultaneously', async () => {
    const results: number[] = [];

    const p1 = debouncer.debounce('key1', 50).then(() => results.push(1));
    const p2 = debouncer.debounce('key1', 50).then(() => results.push(2));
    const p3 = debouncer.debounce('key1', 50).then(() => results.push(3));

    // None should have resolved yet
    expect(results.length).toBe(0);

    await Promise.all([p1, p2, p3]);

    // All should resolve together
    expect(results.length).toBe(3);
    expect(results).toContain(1);
    expect(results).toContain(2);
    expect(results).toContain(3);
  });

  it('isolates different keys into separate groups', async () => {
    const groupA: number[] = [];
    const groupB: number[] = [];

    const pA1 = debouncer.debounce('keyA', 30).then(() => groupA.push(1));
    const pA2 = debouncer.debounce('keyA', 30).then(() => groupA.push(2));
    const pB1 = debouncer.debounce('keyB', 30).then(() => groupB.push(1));

    await Promise.all([pA1, pA2, pB1]);

    expect(groupA.length).toBe(2);
    expect(groupB.length).toBe(1);
  });

  it('resets the timer on each new call within the window', async () => {
    const start = Date.now();
    
    // First call with 100ms delay
    const p1 = debouncer.debounce('key1', 100);
    
    // After 50ms, add another call — this resets the timer
    await new Promise(r => setTimeout(r, 50));
    const p2 = debouncer.debounce('key1', 100);

    await Promise.all([p1, p2]);
    const elapsed = Date.now() - start;

    // Should have taken at least ~150ms (50ms wait + 100ms reset), not just 100ms
    expect(elapsed).toBeGreaterThanOrEqual(140);
  });
});
