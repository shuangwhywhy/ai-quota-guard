# Quota Guard Enterprise-Grade Refinement Plan

The previous plans lacked the depth required for a bulletproof network interceptor. Intercepting `fetch` at the global object level involves dealing with the raw, highly complex `Request` / `Response` streaming specifications which differ across Node, Edge, Bun, Deno, and standard browsers. 

This refined plan targets the fundamental blind spots: body stream consumption, cross-environment serialization, and strict Proxy transparency.

## User Review Required

> [!CAUTION]
> The most critical flaw currently is `readBody(init)`. If a developer calls `fetch(new Request('url', { body: 'data' }))`, `init` can be undefined, and the body exists purely as a stream on the `input` Request object. Reading it directly will exhaust the stream, causing the underlying `nativeFetch` to throw a `TypeError: body used already`. 
> 
> **Resolution**: We must systematically `clone()` the `Request` object if it is provided, extract its arrayBuffer, and use that for hashing, ensuring the pristine Request is passed to `nativeFetch`.

## Proposed Structural Changes

### 1. Robust Request Stream Normalization (Fixing Cache Poisoning & Crashes)
*Problem: We currently ignore `input.body` if `input` is a `Request` object. We also don't safely clone it.*

#### [MODIFY] [src/core/interceptor.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/core/interceptor.ts)
- **Implement `extractRequestData`**:
  - Check if `input` is an instance of `Request`.
  - If true, call `input.clone().arrayBuffer()` to extract the body without destroying the original input stream.
  - If it's standard `init.body`, read it gracefully.
- Ensure the extracted buffer is passed to the hash function.

---

### 2. Standardized Hashing (WebCrypto SHA-256)
*Problem: We need cryptographically secure hashing for massive JSON prompts, but must maintain universal compatibility (Edge, Browser, Node).*

#### [MODIFY] [src/keys/normalizer.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/keys/normalizer.ts)
- Implement `sha256Hash(text: string): Promise<string>`.
- Strictly utilize `globalThis.crypto.subtle.digest` which is the universal Web API standard (supported natively in Node 19+, Next.js Edge, Bun, Deno, and Modern Browsers).
- Provide a silent graceful fallback (e.g., returning the raw body combined string or dynamic Node `crypto`) if the environment is strictly legacy.
- Update `generateStableKey` to async `Promise<string>`.

---

### 3. Cache Protocol Standardization (IoC + Base64 Serialization)
*Problem: Developers building custom Cache adapters (like Redis or FileSystem) cannot easily store `ArrayBuffer` payloads passed to `CacheEntry`. It causes serialization errors in JSON stringification.*

#### [MODIFY] [src/cache/memory.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/cache/memory.ts)
- Create `ICacheAdapter` interface with generic type bounds:
  ```typescript
  export interface SerializedCacheEntry {
      responsePayloadBase64: string; // Guaranteed to be serializable
      headers: Record<string, string>;
      status: number;
      timestamp: number;
  }
  export interface ICacheAdapter {
      get(key: string, ttlMs: number): SerializedCacheEntry | null | Promise<SerializedCacheEntry | null>;
      set(key: string, data: SerializedCacheEntry): void | Promise<void>;
  }
  ```
- Manage the `ArrayBuffer <-> Base64` conversion securely inside Quota Guard's core **before** it hits the provided Adapter. This ensures the Adapter logic is strictly string-based and trivial to implement for developers (e.g., simple `redis.set(JSON.stringify(...))`).
- Convert `MemoryCache` to implement this.

---

### 4. Flawless Framework Transparency (Proxy Trap)
*Problem: Next.js patches `fetch` properties (like `const fetch = global.fetch; fetch.__next_internal = true;`). Modifying it globally deletes these properties.*

#### [MODIFY] [src/core/interceptor.ts](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/src/core/interceptor.ts)
- Install the hook via `Proxy`:
  ```typescript
  globalThis.fetch = new Proxy(originalFetch, {
      apply: async function(target, thisArg, argumentsList) {
          // interceptor logic
          return Reflect.apply(target, thisArg, argumentsList);
      }
  });
  ```
- This ensures any framework-specific prototype extensions or static caches are fully retained natively.
