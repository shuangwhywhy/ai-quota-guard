# Conflict Management & Philosophy

Quota Guard helps resolve the conflict between "saving AI costs" and "testing diverse business scenarios". This document explains how we handle overlapping logic and how you can tune the system.

## 1. Our Philosophy: "The Good Collision"

In **Development** and **Debug** environments, Quota Guard's primary goal is to **protect your wallet**. 

- **Acceptable Collisions**: If two requests have the same AI prompt but different metadata (e.g., different User IDs), Quota Guard might merge them by default. This saves 50% of your tokens!
- **Guidance**: Unless your code logic *strictly* depends on receiving unique responses for each identity during dev, **it is recommended to allow these collisions**. 

> [!TIP]
> Use standard settings in `development`. Choose carefully in `test` environments.

---

## 2. Common Conflict Types

### 2.1 [FINGERPRINT_COLLISION]
**What happened?**
Two requests mapped to the same internal hash key, even though some request parameters (like Headers) were different.

**How to solve?**
If you *must* separate these requests, add the missing distinguishing headers to your global configuration:
```javascript
// .quotaguardrc or window.__QUOTA_GUARD_CONFIG__
{
  keyHeaders: ['X-Client-Id', 'Authorization']
}
```

### 2.2 [BYPASS_IGNORED]
**What happened?**
You sent a bypass signal like `cache-control: no-cache`, but Quota Guard intercepted the request anyway to return a cached or in-flight result.

**Why?**
Quota Guard treats **Budget Safety** as a higher priority than "freshness" by default. This prevents a accidental loop or a "Hard Refresh" from triggering 100 parallel AI calls.

**How to solve?**
1. Use the explicit bypass header: `X-Quota-Guard-Bypass: true`. (Natively supported by default)
2. Send standard `Cache-Control: no-cache` or `Pragma: no-cache`.
3. Configure a **Rule** to allow passthrough for specific endpoints (see below).

---

## 3. The Centralized Rule Engine (Zero Intrusion)

Instead of changing your code, you can use Rules to adapt Quota Guard to your app's behavior.

### Typical Usage Examples

#### Scenario A: Bypassing specific "Live" features
If your app has a "Real-time" feature that should never be debounced or cached:
```javascript
{
  rules: [
    {
      match: { headers: { 'X-Feature': 'Realtime' } },
      override: { debounceMs: 0, cacheTtlMs: 0 }
    }
  ]
}
```

#### Scenario B: Narrowing the scope
Only apply strict protection to OpenAI while being lenient with local development proxies:
```javascript
{
  rules: [
    {
      match: { url: /api.openai.com/ },
      override: { breakerMaxFailures: 2 }
    }
  ]
}
```

---

## 4. Troubleshooting in Console

When a conflict is detected, Quota Guard will print a prominent box in your console:

```text
┌──────────────────────────────────────────────────────────────────┐
│ [Quota Guard] [FINGERPRINT_COLLISION]                            │
│ ──────────────────────────────────────────────────────────────── │
│ Target  : POST https://api.openai.com/v1/chat/completions        │
│ Conflict: Key [8f2b3ce] matches, but metadata differs.           │
│ ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```
Simply follow the **"Recommendation"** or **"How to Bypass"** tips directly from the console to resolve your issue.
