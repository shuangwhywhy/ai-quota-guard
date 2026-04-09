import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerError } from '../src/breaker/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes in a closed state', () => {
    expect(breaker.isOpen('key1', 3, 1000)).toBe(false);
  });

  it('remains closed if failures are below the max limit', () => {
    breaker.recordFailure('key1');
    expect(breaker.isOpen('key1', 3, 1000)).toBe(false);

    breaker.recordFailure('key1');
    expect(breaker.isOpen('key1', 3, 1000)).toBe(false);
  });

  it('opens instantly when max failures are reached', () => {
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');

    expect(breaker.isOpen('key1', 3, 1000)).toBe(true);
  });

  it('segregates failures by key', () => {
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');

    expect(breaker.isOpen('key1', 3, 1000)).toBe(true);
    // Unrelated key should be perfectly safe
    expect(breaker.isOpen('key2', 3, 1000)).toBe(false);
  });

  it('resets back to closed (half-open) after reset timeout elapses', () => {
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');

    expect(breaker.isOpen('key1', 3, 1000)).toBe(true);

    // Fast-forward 1001 milliseconds
    vi.advanceTimersByTime(1001);

    // Timed out, allows request through again!
    expect(breaker.isOpen('key1', 3, 1000)).toBe(false);
  });

  it('fully clears failure history on success', () => {
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');
    
    // Near breaking point!
    expect(breaker.isOpen('key1', 3, 1000)).toBe(false);

    // Suddenly succeeds!
    breaker.recordSuccess('key1');

    expect(breaker.isOpen('key1', 3, 1000)).toBe(false);

    // Record two subsequent failures
    breaker.recordFailure('key1');
    breaker.recordFailure('key1');

    // STILL closed, because the previous 2 were erased by success
    expect(breaker.isOpen('key1', 3, 1000)).toBe(false);
  });

  it('creates CircuitBreakerError natively', () => {
    const err = new CircuitBreakerError('Test error');
    expect(err.name).toBe('CircuitBreakerError');
    expect(err.message).toBe('Test error');
  });
});
