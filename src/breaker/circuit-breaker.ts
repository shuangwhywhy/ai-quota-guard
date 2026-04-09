export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

interface BreakerState {
  failures: number;
  lastFailureTime: number;
}

export class CircuitBreaker {
  private states = new Map<string, BreakerState>();

  recordFailure(key: string): void {
    const state = this.states.get(key) || { failures: 0, lastFailureTime: 0 };
    state.failures += 1;
    state.lastFailureTime = Date.now();
    this.states.set(key, state);
  }

  recordSuccess(key: string): void {
    this.states.delete(key);
  }

  isOpen(key: string, maxFailures: number, resetTimeoutMs: number): boolean {
    const state = this.states.get(key);
    if (!state) return false;

    if (state.failures >= maxFailures) {
      if (Date.now() - state.lastFailureTime > resetTimeoutMs) {
        // Half-open (timeout passed) -> we allow it to try again, but we don't reset failure count completely until success
        return false;
      }
      return true; // Still open
    }
    return false;
  }
}

export const globalBreaker = new CircuitBreaker();
