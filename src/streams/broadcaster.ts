/**
 * Utility to broadcast a single Body (ReadableStream) to multiple consumers in real-time.
 * This solves the "sequential streaming" problem where subsequent deduplicated requests
 * had to wait for the first one to finish.
 */
export class ResponseBroadcaster {
  private controllers: Set<ReadableStreamDefaultController> = new Set();
  private isFinished = false;
  private bufferedChunks: Uint8Array[] = [];
  private originalResponse: Response;

  constructor(response: Response) {
    this.originalResponse = response;
    this.startBroadcasting();
  }

  /**
   * Creates a new Response that will receive the stream in real-time.
   */
  subscribe(): Response {
    if (this.isFinished) {
      const totalLength = this.bufferedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of this.bufferedChunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return new Response(result, {
        status: this.originalResponse.status,
        statusText: this.originalResponse.statusText,
        headers: this.originalResponse.headers
      });
    }

    const self = this;
    const stream = new ReadableStream({
      start(controller) {
        // Send all chunks we've already collected to catch up the late subscriber
        // (Though for AI calls, they usually start at the same time due to debounce)
        for (const chunk of self.bufferedChunks) {
          controller.enqueue(chunk);
        }

        if (self.isFinished) {
          controller.close();
        } else {
          self.controllers.add(controller);
        }
      },
      cancel(reason) {
        self.controllers.delete(this as any);
      }
    });

    return new Response(stream, {
      status: this.originalResponse.status,
      statusText: this.originalResponse.statusText,
      headers: this.originalResponse.headers
    });
  }

  private async startBroadcasting() {
    if (!this.originalResponse.body) {
      this.isFinished = true;
      return;
    }

    const reader = this.originalResponse.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Store for late-joiners (e.g. cache recording)
        this.bufferedChunks.push(value);

        // Broadcast to all active subscribers
        for (const controller of this.controllers) {
          try {
            controller.enqueue(value);
          } catch {
            this.controllers.delete(controller);
          }
        }
      }
    } catch (err) {
      for (const controller of this.controllers) {
        controller.error(err);
      }
    } finally {
      this.isFinished = true;
      for (const controller of this.controllers) {
        try {
          controller.close();
        } catch { /* ignore */ }
      }
      this.controllers.clear();
    }
  }

  /**
   * Utility to get the full final buffer (for caching). 
   * Awaits completion if still streaming.
   */
  async getFinalBuffer(): Promise<ArrayBuffer> {
    if (!this.isFinished) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (this.isFinished) resolve();
          else setTimeout(check, 10);
        };
        check();
      });
    }
    const totalLength = this.bufferedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.bufferedChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result.buffer;
  }

}
