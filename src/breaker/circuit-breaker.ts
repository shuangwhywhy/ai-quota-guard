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
  private globalState: BreakerState = { failures: 0, lastFailureTime: 0 };

  recordFailure(key: string): void {
    // 1. Per-key failure
    const state = this.states.get(key) || { failures: 0, lastFailureTime: 0 };
    state.failures += 1;
    state.lastFailureTime = Date.now();
    this.states.set(key, state);

    // 2. Global failure
    this.globalState.failures += 1;
    this.globalState.lastFailureTime = Date.now();
  }

  recordSuccess(key: string): void {
    this.states.delete(key);
    // Reset global failures on any success to stay optimistic? 
    // Usually, a success means the network/proxy is healthy.
    this.globalState.failures = 0;
  }

  isOpen(key: string, maxFailures: number, resetTimeoutMs: number): boolean {
    const state = this.states.get(key);
    if (!state) return false;

    if (state.failures >= maxFailures) {
      if (Date.now() - state.lastFailureTime > resetTimeoutMs) {
        return false;
      }
      return true;
    }
    return false;
  }

  isGlobalOpen(maxFailures: number, resetTimeoutMs: number): boolean {
    if (this.globalState.failures >= maxFailures) {
      if (Date.now() - this.globalState.lastFailureTime > resetTimeoutMs) {
        // Optimistically clear global failures if timeout passed
        this.globalState.failures = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  clear(): void {
    this.states.clear();
    this.globalState = { failures: 0, lastFailureTime: 0 };
  }
}

export const globalBreaker = new CircuitBreaker();
