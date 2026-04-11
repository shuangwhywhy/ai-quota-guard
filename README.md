# AI Quota Guard

[![NPM Version](https://img.shields.io/npm/v/@shuangwhywhy/quota-guard.svg)](https://www.npmjs.com/package/@shuangwhywhy/quota-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **The Zero-Intrusive Engine for AI Cost Savings & Stability.**
> Automatically deduplicate, cache, and guard your LLM calls without changing a single line of business logic.

---

## ⚡️ Why Quota Guard?

During development, UI re-renders, automatic effects, and repetitive debugging sessions can cause hundreds of identical LLM API calls. This leads to blown budgets, rate-limiting (`429 Too Many Requests`), and interrupted development high.

AI Quota Guard is a **zero-intrusion hook** that seamlessly intercepts network calls — specifically those bound for AI endpoints. Without writing a single line of wrapper code, it provides:

- **🏦 Save Money**: Intelligent caching eliminates costs for identical prompts across sessions.
- **🚀 Faster DX**: In-flight deduplication and aggregation make your app feel snappier.
- **🛡️ Safety First**: Per-key and Global Circuit Breakers stop infinite loops from nuking your API quota.
- **🔌 Zero-Intrusion**: Works with any SDK (OpenAI, LangChain, etc.) via native Node/Vite injection.

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
NODE_ENV=development node --import @shuangwhywhy/quota-guard/register app.js
```

### 2. Vite (Frontend)

Add the plugin to your `vite.config.ts`. It strictly only activates during development builds.

```typescript
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default {
  plugins: [quotaGuardPlugin()]
};
```

### 3. Axios Support

For Axios users, we provide a dedicated hook that enforces the `fetch` adapter for compatible interception:

```typescript
import axios from 'axios';
import { hookAxios } from '@shuangwhywhy/quota-guard/axios';

const myAxios = axios.create();
hookAxios(myAxios); // Now this instance is guarded!
```

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

## ⚙️ Advanced Configuration

You can customize the guard behavior by calling `injectQuotaGuard` manually or via a configuration file.

```typescript
import { injectQuotaGuard } from '@shuangwhywhy/quota-guard';

injectQuotaGuard({
  aiEndpoints: [/api\.openai\.com/],
  cacheTtlMs: 1000 * 60 * 60 * 24, // 1 day
  auditHandler: (e) => console.log(`[Guard] ${e.type} -> ${e.key.slice(0, 8)}`)
});
```

### Configuration Options

| Option | Default | Description |
| :--- | :--- | :--- |
| `enabled` | `true` (dev) | If false, passes all requests through. |
| `aiEndpoints` | [Predefined](#supported-providers) | List of hostnames (Strings or RegEx) to intercept. |
| `cacheKeyStrategy` | `'intelligent'` | `'intelligent'` (strips noise) or `'exact'`. |
| `cacheTtlMs` | `3600000` | Local cache duration (default: 1 hour). |
| `debounceMs` | `300` | Aggregation window to group rapid requests. |
| `breakerMaxFailures`| `3` | Failures per key before the breaker opens. |
| `globalBreakerMaxFailures`| `10` | Global failures before blocking all AI calls. |
| `intelligentFields` | [See Source] | Fields to include in the intelligent hash key. |

### Audit Event Types

Use the `auditHandler` to subscribe to these real-time signals:

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
