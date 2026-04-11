# Advanced: Safety & Diagnostics

This guide covers how to handle complex scenarios, debug unexpected behavior, and deep-dive into the "Safety-First" philosophy of Quota Guard.

## 1. Conflict Management: "The Good Collision"

Quota Guard is opinionated about **Budget Safety**. By default, it prioritizes saving tokens over "freshness" in development.

### [FINGERPRINT_COLLISION] Warnings
If you see this in your console:
- **What it means**: Two requests have the same semantic prompt (same model, same message) but differ in metadata that Quota Guard is ignoring (like headers or noise parameters).
- **The Result**: They share the same cache entry.
- **How to fix**: If they *must* be separate, add distinguishing headers to `keyHeaders` in your config.

### Safety Guards Override Headers
Standard headers like `Cache-Control: no-cache` or `Pragma: no-cache` are **ignored** by Quota Guard by default. This prevents a accidental browser "Hard Refresh" or infinite loop from triggering dozens of live AI calls.

**To explicitly bypass the cache, you must use:**
- **Header**: `X-Quota-Guard-Bypass: true`
- **Rule**: Define a matching rule with `override: { cacheTtlMs: 0 }`.

---

## 2. Real-time Diagnostics

### Response Headers
Every intercepted response contains diagnostic headers that help you understand its lifecycle:

- `X-Quota-Guard: HIT` -> Served from disk/memory cache.
- `X-Quota-Guard: SHARED` -> Joined an in-flight request.
- `X-Quota-Guard: LIVE` -> Actually hit the network.
- `X-Quota-Guard-Key: <hash>` -> The internal fingerprint hash used.

### In-Console Guard Boxes
When a significant event occurs (Circuit Breaker opening, Conflict detected), a prominent block is printed to your stdout/console. These blocks include a **"Recommendation"** field tailored to your current situation.

---

## 3. Circuit Breakers (The Panic Button)

Quota Guard implements two levels of protection:

1. **Per-Key Breaker**: If `POST /v1/chat` with "Prompt A" fails 3 times, further attempts at "Prompt A" are blocked for 30s. Other prompts remain unaffected.
2. **Global Breaker**: If 10 total failures occur across *any* AI calls, Quota Guard blocks **ALL** AI traffic for 30s to prevent budget depletion during an outage.

### Testing Failures
If you are intentionally testing failure scenarios and Quota Guard blocks you (Status `599`), adjust the following:
```typescript
{
  breakerMaxFailures: 999,
  globalBreakerMaxFailures: 999
}
```
