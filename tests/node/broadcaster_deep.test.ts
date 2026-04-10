import { describe, it, expect } from 'vitest';
import { ResponseBroadcaster } from '../../src/streams/broadcaster';

describe('ResponseBroadcaster Deep Coverage', () => {
  it('handles late joining after stream is finished', async () => {
    const payload = new TextEncoder().encode('full content');
    const response = new Response(payload);
    const broadcaster = new ResponseBroadcaster(response);

    // Give it time to finish broadcasting to internal buffer
    await new Promise(r => setTimeout(r, 50));

    // Subscribe LATE
    const lateRes = broadcaster.subscribe();
    const text = await lateRes.text();
    expect(text).toBe('full content');
  });

  it('handles subscription cancellation', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        // Keep it open
      }
    });
    const response = new Response(stream);
    const broadcaster = new ResponseBroadcaster(response);

    const subRes = broadcaster.subscribe();
    const reader = subRes.body!.getReader();
    
    // Read one chunk
    await reader.read();
    
    // Explicitly cancel
    await reader.cancel();
    
    // Wait for the broadcaster set to be updated via the 'cancel' hook
    await new Promise(r => setTimeout(r, 10));
    
    // Internal controllers set is private, but we verify it doesn't crash 
    // and we can still subscribe again
    const subRes2 = broadcaster.subscribe();
    expect(subRes2).toBeDefined();
  });

  it('handles upstream stream errors and propagates them', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
        setTimeout(() => {
          controller.error(new Error('Upstream Failure'));
        }, 10);
      }
    });
    const response = new Response(stream);
    const broadcaster = new ResponseBroadcaster(response);

    const subRes = broadcaster.subscribe();
    const reader = subRes.body!.getReader();
    
    await reader.read(); // Get first chunk
    await expect(reader.read()).rejects.toThrow('Upstream Failure');
  });

  it('handles responses without bodies Gracefully', async () => {
    const response = new Response(null, { status: 204 });
    const broadcaster = new ResponseBroadcaster(response);
    
    const subRes = broadcaster.subscribe();
    expect(subRes.body).toBeNull();
    expect(subRes.status).toBe(204);
    
    const buffer = await broadcaster.getFinalBuffer();
    expect(buffer.byteLength).toBe(0);
  });

  it('handles subscribers that error mid-stream without breaking the broadcaster', async () => {
    const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
          setTimeout(() => controller.enqueue(new Uint8Array([2])), 10);
          setTimeout(() => controller.close(), 20);
        }
      });
      const response = new Response(stream);
      const broadcaster = new ResponseBroadcaster(response);
  
      const subRes1 = broadcaster.subscribe();
      // "Break" the first consumer by closing its reader or similar
      // Actually, we'll just check if it continues to broadcaster 2
      const subRes2 = broadcaster.subscribe();
      
      const reader1 = subRes1.body!.getReader();
      await reader1.cancel(); // Subscriber 1 leaves

      const reader2 = subRes2.body!.getReader();
      const chunk1 = await reader2.read();
      const chunk2 = await reader2.read();
      expect(chunk1.value).toEqual(new Uint8Array([1]));
      expect(chunk2.value).toEqual(new Uint8Array([2]));
  });
});
