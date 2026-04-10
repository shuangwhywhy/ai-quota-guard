import type { ResponseBroadcaster } from '../streams/broadcaster';

export class InFlightRegistry {
  private inFlight = new Map<string, ResponseBroadcaster | Promise<ResponseBroadcaster>>();

  set(key: string, value: ResponseBroadcaster | Promise<ResponseBroadcaster>): void {
    this.inFlight.set(key, value);
  }

  get(key: string): ResponseBroadcaster | Promise<ResponseBroadcaster> | undefined {
    return this.inFlight.get(key);
  }

  delete(key: string): void {
    this.inFlight.delete(key);
  }

  get size(): number {
    return this.inFlight.size;
  }

  clear(): void {
    this.inFlight.clear();
  }
}

const GLOBAL_KEY = '__QUOTA_GUARD_IN_FLIGHT_REGISTRY__';

// Use a truly global instance to survive multiple library loads in browser/node
if (!(globalThis as any)[GLOBAL_KEY]) {
  (globalThis as any)[GLOBAL_KEY] = new InFlightRegistry();
}

export const globalInFlightRegistry = (globalThis as any)[GLOBAL_KEY] as InFlightRegistry;


