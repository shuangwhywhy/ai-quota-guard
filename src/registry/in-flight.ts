import type { ResponseBroadcaster } from '../streams/broadcaster';
import type { RequestMetadata } from '../cache/memory';

export interface InFlightEntry {
  broadcaster: ResponseBroadcaster | Promise<ResponseBroadcaster>;
  snapshot: RequestMetadata;
}

export class InFlightRegistry {
  private inFlight = new Map<string, InFlightEntry>();

  set(key: string, value: ResponseBroadcaster | Promise<ResponseBroadcaster>, snapshot: RequestMetadata): void {
    this.inFlight.set(key, { broadcaster: value, snapshot });
  }

  get(key: string): InFlightEntry | undefined {
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

const globalRegistry = globalThis as unknown as Record<string, InFlightRegistry>;

// Use a truly global instance to survive multiple library loads in browser/node
if (!globalRegistry[GLOBAL_KEY]) {
  globalRegistry[GLOBAL_KEY] = new InFlightRegistry();
}

export const globalInFlightRegistry = globalRegistry[GLOBAL_KEY];


