export class InFlightRegistry {
  private inFlight = new Map<string, Promise<any>>();

  set(key: string, promise: Promise<any>): void {
    this.inFlight.set(key, promise);
  }

  get(key: string): Promise<any> | undefined {
    return this.inFlight.get(key);
  }

  delete(key: string): void {
    this.inFlight.delete(key);
  }
}

export const globalInFlightRegistry = new InFlightRegistry();
