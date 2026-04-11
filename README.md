# AI Quota Guard

[![NPM Version](https://img.shields.io/npm/v/@shuangwhywhy/quota-guard.svg)](https://www.npmjs.com/package/@shuangwhywhy/quota-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **The Zero-Intrusive Engine for AI Cost Savings & Stability.**
> Automatically deduplicate, cache, and guard your LLM calls without changing a single line of business logic.

---

## 📖 Documentation

Visit our **[Interactive Documentation Site](file:///Users/yizhouqiang/MyProjects/AI/quota-guard/docs/index.html)** for a deep dive into configuration, features, and troubleshooting.

## ⚡️ Why Quota Guard?

During development, UI re-renders, automatic effects, and repetitive debugging sessions can cause hundreds of identical LLM API calls. This leads to blown budgets, rate-limiting (`429 Too Many Requests`), and interrupted development high.

AI Quota Guard is a **zero-preference, zero-intrusion engine** that seamlessly intercepts network calls — specifically those bound for AI endpoints. It is a purely passive observer: it doesn't care what library you use (Axios, Fetch, Got, XHR) and it doesn't modify your configurations. It simply "catches" whatever flows through the network:

- **🏦 Save Money**: Intelligent caching eliminates costs for identical prompts across sessions.
- **🚀 Faster DX**: In-flight deduplication and aggregation make your app feel snappier.
- **🛡️ Safety First**: Per-key and Global Circuit Breakers stop infinite loops from nuking your API quota.
- **🔌 Zero-Intrusion**: Works with ANY SDK (OpenAI, LangChain, etc.) via native global interception.

---

## 🚀 Quick Start

### 1. Node.js (Backend)

Run your app with Quota Guard injected natively using standard Node flags. No code imports required!

```bash
# Debug Mode (Auto-intercept, auto-cache, auto-dedup)
NODE_ENV=development node --require @shuangwhywhy/quota-guard/register app.js
```

**Using ESM (`"type": "module"`)?** Use `--import` instead:
```bash
# Node >= 20.6.0
NODE_ENV=development node --import @shuangwhywhy/quota-guard/register app.js
```

### 2. Vite (Frontend)

Add the plugin to your `vite.config.ts`. It activates purely as a passive guard during development.

```typescript
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default {
  plugins: [quotaGuardPlugin()]
};
```

### 3. Transparent Observation

Unlike other tools, Quota Guard **does not require any library-specific hooks**. Whether you use `axios`, `window.fetch`, or `XMLHttpRequest` directly, they are all automatically "caught" and guarded once initialized.

---

## 🛡️ Bypass & Guard Priority

> [!IMPORTANT]
> **Opinionated Caching**: To protect your budget, standard business-level headers like `Cache-Control: no-cache` are **ignored** by default if a cached response exists. 

To force a true live call (bypassing all guards), use our internal header:
- Header: `X-Quota-Guard-Bypass: true`

---

## ✅ Is It Working? (Active Signals)

Quota Guard provides clear signals to confirm it is active:

1.  **Startup Banner**: Look for this in your terminal during initialization:
    ```text
    ┌───────────────────────────────────────┐
    │ [Quota Guard] v1.8.0 READY            │
    │ Mode: Development (Guarded)           │
    └───────────────────────────────────────┘
    ```
2.  **Network Headers**: All guarded responses carry an `X-Quota-Guard` status in your **Network Tab**:
    - `HIT`: Served from local cache.
    - `SHARED`: Joined an existing live request (deduplicated).
    - `LIVE`: A validated call passed to the provider.

---

---

## 🛠 Command Line Interface (CLI)

Quota Guard comes with a built-in CLI to help you get started quickly.

```bash
# Initialize a template configuration file
npx qg init

# Or using the full name
npx quota-guard init
```

This creates a `.quotaguardrc.ts` file in your project root with best-practice defaults and examples.

---

## ⚙️ Configuration Guide

Quota Guard supports a sophisticated configuration system. You can use `.ts`, `.js`, `.json`, or `.yaml` files.

### 1. Discovery Locations

| Style | Paths (Priority Order) |
| :--- | :--- |
| **Clean (Recommended)** | `.quota-guard/config.[env].[ext]` <br> `.quota-guard/config.[ext]` |
| **Root** | `.quotaguardrc.[env].[ext]` <br> `.quotaguardrc.[ext]` |

### 2. Core Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | `true` | If `false`, transparently passes all requests through. |
| `aiEndpoints` | `(string\|RegExp)[]` | [Predefined] | Hostnames to intercept. |
| `cacheTtlMs` | `number` | `3600000` | TTL for debug caching (1 hour). |
| `cacheKeyStrategy` | `string\|fn` | `'intelligent'` | `'intelligent'` (strips noise like temperature) or `'exact'`. |
| `debounceMs` | `number` | `300` | Aggregation window to merge identical parallel requests. |
| `breakerMaxFailures`| `number` | `3` | Failures per specific prompt before blocking. |
| `globalBreakerMaxFailures`| `number` | `10` | Total failures before blocking all AI traffic. |
| `keyHeaders` | `string[]` | `[]` | Extra headers to include in the cache fingerprint. |
| `bypassCacheHeaders` | `string[]` | `['x-quota-guard-bypass']` | Headers that trigger a cache bypass. |

---

## 🎯 Advanced Rules

The `rules` array allows you to define granular behaviors for specific requests.

```typescript
rules: [
  {
    // 1. Selector
    match: {
      url: /v1\/chat/,                // Match by URL regex
      headers: { 
        'x-org-id': 'research-lab'    // Match by specific header
      }
    },
    // 2. Behavioral Override
    override: {
      cacheTtlMs: 86400000,           // Longer cache for this endpoint
      debounceMs: 1000,               // More aggressive deduplication
    }
  }
]
```

### Rule Matching Logic
- **URL**: Can be a string or a Regular Expression.
- **Headers**: Key-value pairs where values can be strings or Regular Expressions.
- **Overrides**: You can override almost any configuration field (except `rules` and `aiEndpoints`).

---

## 🍱 Configuration Recipes

### Recipe: Aggressive Caching for Testing
Useful for CI or UI component development where you want to hit the network as little as possible.

```typescript
export default {
  cacheTtlMs: 1000 * 60 * 60 * 24 * 7, // 1 week
  cacheKeyStrategy: 'intelligent',
  debounceMs: 1000 // Large window for slow re-renders
};
```

### Recipe: Bypassing Specific Models
If you are testing real-time reasoning models and don't want caching for them.

```typescript
export default {
  rules: [
    {
      match: { url: /gpt-4-0314/ },
      override: { enabled: false }
    }
  ]
};
```

### Recipe: Custom Cache Adapter (Redis/FileSystem)
By default, Quota Guard uses `IndexedDB` in the browser and `Memory` in Node. You can provide a custom adapter.

```typescript
import { FileCacheAdapter } from '@shuangwhywhy/quota-guard';

export default {
  cacheAdapter: new FileCacheAdapter('.quota-cache')
};
```

---

### Audit Event Types

Use the `auditHandler` to subscribe to these signals:

| Event Type | Description |
| :--- | :--- |
| `request_started` | Interceptor caught a matching AI request. |
| `debounced` | Request gathered in the aggregation window. |
| `cache_hit` | Returned a previously cached response. |
| `live_called` | No cache/dedup found, calling network. |
| `in_flight_shared` | Joined an existing live stream. |
| `breaker_opened` | Circuit breaker blocked the request. |
| `request_failed` | Native request returned non-OK status. |
| `request_aborted` | Request was cancelled by the user. |
| `global_breaker_opened`| Global safety guard activated. |

---

## 🛠 Troubleshooting

| If you see... | Check... |
| :--- | :--- |
| **No Startup Banner** | Verify your Node flags (`--require`) or Vite config. |
| **No `X-Quota-Guard` Headers** | Verify the URL matches `aiEndpoints`. Check `NODE_ENV`. |
| **Always `LIVE` (No Hits)** | Check terminal for `[FINGERPRINT_COLLISION]` warnings. |
| **599 Status Code** | This is the **Circuit Breaker** protecting your budget. |

---

## 🧠 How It Works

- **Network Coverage**: Powered by `@mswjs/interceptors`. Covers `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` modules natively across Node and Browser.
- **Real-time Streaming**: Uses a custom `ResponseBroadcaster` to "tee" AI streams. Deduplicated requests receive identical stream chunks simultaneously in real-time.
- **Provider Intelligence**: Auto-detects major providers to extract exact semantic fields (ignoring `temperature`, etc.). Supported:
    - **OpenAI** / **Anthropic** / **Google Gemini** / **DeepSeek** / **Mistral** / **Cohere** / **Groq**

---

## ⚖️ License
MIT © qyz
