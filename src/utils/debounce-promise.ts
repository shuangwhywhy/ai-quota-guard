interface DebounceGroup {
  timeoutId: any;
  queue: Array<() => void>;
}

export class PromiseDebouncer {
  private groups = new Map<string, DebounceGroup>();

  /**
   * Acts as a debounce gate. All calls matching `key` within `delayMs`
   * will be held. When the timer expires, all waiting callers are released 
   * simultaneously, allowing them to perfectly hit the underlying In-Flight Deduplication.
   */
  async debounce(key: string, delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return;
    }

    return new Promise<void>((resolve) => {
      let group = this.groups.get(key);

      if (group) {
        clearTimeout(group.timeoutId);
      } else {
        group = { timeoutId: null, queue: [] };
        this.groups.set(key, group);
      }

      group.queue.push(resolve);

      group.timeoutId = setTimeout(() => {
        const currentGroup = this.groups.get(key);
        if (currentGroup === group) {
          this.groups.delete(key);
        }

        for (const res of group!.queue) {
          res();
        }
      }, delayMs);
    });
  }
}

export const globalDebouncer = new PromiseDebouncer();
