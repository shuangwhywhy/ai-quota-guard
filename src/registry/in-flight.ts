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

  clear(): void {
    this.inFlight.clear();
  }
}

export const globalInFlightRegistry = new InFlightRegistry();


