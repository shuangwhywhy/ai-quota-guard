# Scenarios & Recipes

Practical examples of how to configure Quota Guard for different development workflows.

## 1. Scenario: The "UI Double-Render" Problem
**Problem**: In React/Vue development, `useEffect` or lifecycle hooks often fire twice due to `StrictMode` or fast refreshes. This doubles your token cost and slows down the UI.

**Solution**: Use the default `debounceMs`.
```typescript
// .quotaguardrc.ts
export default {
  debounceMs: 500, // Slightly longer window to aggregate UI re-renders
  cacheKeyStrategy: 'intelligent'
};
```

---

## 2. Scenario: Extreme CI/CD Token Saving
**Problem**: You want to run your integration tests against real AI endpoints to verify data structures, but you don't want to hit the network (and pay/wait) every time a test runs.

**Solution**: Aggressive File-based caching.
```typescript
// .quotaguardrc.test.ts
import { FileCache } from '@shuangwhywhy/quota-guard';

export default {
  cacheTtlMs: 1000 * 60 * 60 * 24 * 30, // 30 Days
  cacheAdapter: new FileCache('.test-cache'), // Persist to disk
  breakerMaxFailures: 1 // Open breaker immediately on any failure
};
```

---

## 3. Scenario: Protecting local Proxies (Ollama / LocalAI)
**Problem**: You are developing against a local Ollama instance and want the same deduplication/caching benefits as remote providers.

**Solution**: Explicit `aiEndpoints` override.
```typescript
// .quotaguardrc.ts
export default {
  aiEndpoints: [
    /localhost:11434/, // Match Ollama default port
    /localhost:8080/   // Match LocalAI
  ]
};
```

---

## 4. Scenario: User-Dependent Responses
**Problem**: Your application behavior depends on personalized AI results. If User A and User B send the same prompt, they *must* get different results.

**Solution**: Use `keyHeaders`.
```typescript
// .quotaguardrc.ts
export default {
  keyHeaders: ['X-User-Id', 'Authorization'],
  cacheKeyStrategy: 'intelligent'
};
```

---

## 5. Scenario: Real-time "Reasoning" Models
**Problem**: You are working with high-latency models like `o1-preview` or `claude-3-opus` and want to ensure you never wait for two identical streams at once.

**Solution**: In-flight sharing is automatic!
No special configuration is needed. When the first request starts streaming chunks, the second request will automatically "join" and receive the same SSE (Server-Sent Events) chunks in real-time.
