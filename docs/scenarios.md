# Core Scenarios & Recipes

Practical examples of how AI Quota Guard protects your development workflow.

---

## 1. Scenario: The HMR & StrictMode Noise
**Problem**: In React/Vue development, `useEffect` or lifecycle hooks often fire twice due to `StrictMode` or fast refreshes (HMR). This doubles your token cost and slows down the UI.

**Solution**: Quota Guard automatically merges in-flight requests. You can tune the aggregation window using `debounceMs`.

```typescript
// .quotaguardrc.ts
export default {
  // A slightly longer window to catch UI re-renders
  debounceMs: 500, 
  cacheKeyStrategy: 'intelligent'
};
```

---

## 2. Scenario: Iterative Workflow Debugging
**Problem**: You are debugging a complex business chain (e.g., *Generate Report -> Send Email -> Log to Analytics*). You need to run the code 20 times to get the CSS right, but you don't want to hit the OpenAI API 20 times for the report.

**Solution**: Use persistent local caching. This allows you to "lock" the AI response while you iterate on the surrounding code.

```typescript
// .quotaguardrc.dev.ts
export default {
  // Cache for 24 hours during deep work sessions
  cacheTtlMs: 1000 * 60 * 60 * 24, 
  // Ensure we save to disk so it survives server restarts
  cacheAdapter: 'file', 
};
```

---

## 3. Scenario: The Infinite Loop Safety Net
**Problem**: While writing a recursive Agent or a complex `useEffect` state dependency, you accidentally trigger an infinite request loop.

**Solution**: The **Circuit Breaker** acts as a physical fuse. It monitors request frequency and "trips" the fuse if thresholds are exceeded.

```typescript
// .quotaguardrc.ts
export default {
  // If 5 requests fail or trigger rapidly within a window...
  breakerMaxFailures: 5,
  // ...stay open (blocked) for 30 seconds to let the developer fix the code
  breakerResetTimeoutMs: 30000 
};
```

---

## 4. Scenario: Deterministic CI Testing
**Problem**: You want to run your integration tests against real SDKs to verify data structures, but you want them to be fast, free, and deterministic (no "hallucinations" breaking tests).

**Solution**: Use a dedicated test cache.

```typescript
// .quotaguardrc.test.ts
export default {
  // Long-term cache for tests
  cacheTtlMs: 1000 * 60 * 60 * 24 * 30, 
  // Isolate test cache from dev cache
  cacheAdapter: new FileCache('.test-cache-dir'), 
  // Open breaker immediately on any failure to fail tests fast
  breakerMaxFailures: 1 
};
```

---

## 5. Recipe: User-Sensitive Requests
**Problem**: Your application behavior depends on personalized AI results. If User A and User B send the same prompt, they *must* get different results.

**Solution**: Include identity headers in the cache key.

```typescript
// .quotaguardrc.ts
export default {
  // Differentiate cache by User ID or Auth token
  keyHeaders: ['X-User-Id', 'Authorization'],
  cacheKeyStrategy: 'intelligent'
};
```

---

## 6. Recipe: Local AI Proxies (Ollama / LocalAI)
**Problem**: You are developing against a local Ollama instance and want the same deduplication/caching benefits.

**Solution**: Explicitly add your local endpoint to the interception list.

```typescript
// .quotaguardrc.ts
export default {
  aiEndpoints: [
    /localhost:11434/, // Ollama
    /localhost:8080/   // LocalAI
  ]
};
```
