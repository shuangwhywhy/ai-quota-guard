# Quota Guard

A 100% **zero-intrusive** (**non-intrusive**) AI Call Guard and debug cost-saving kernel for **LLM** / **AI** model invocations.

**Debug Mode** | **Rate Limit** Protection | **Token** Savings | **Quota** Management

## Why Quota Guard?
During development, UI re-renders, automatic effects, and repetitive **debugging** sessions can cause hundreds of identical **LLM** API calls. This leads to blown budgets, **rate-limiting** (`429 Too Many Requests`), and slow DX.

Quota Guard is a zero-intrusion **hook** that seamlessly intercepts **all** network calls — including `globalThis.fetch` and Node.js native `http`/`https` modules — specifically bound for **AI** endpoints. Without writing a **single line of wrapper code in your business logic**, it acts as a persistent **guard** providing:

1. **In-Flight Deduplication**: Share the exact same network promise for identical parallel requests.
2. **Request Aggregation (Debounce)**: rapid-fire requests are held and released simultaneously to maximize deduplication (default: 300ms).
3. **Debug Caching**: Eliminates cost for identical prompts across a dev session (**mock**-like efficiency without manual mock maintenance).
4. **Circuit Breaker**: Stops runaway loops from nuking your API keys (**quota** protection) by failing short after a threshold.
5. **Zero-Intrusion**: Injected strictly via Node `--require`/`--import` or Vite plugins, leaving your production bundle untouched.
6. **Intelligent Cache Keys**: Strips noisy parameters (`temperature`, `stream`, etc.) for higher cache hit rates.

## Usage

### 1. Node.js (Backend — CommonJS)

Run your app with Quota Guard injected natively using standard Node flags. No code imports required!

```bash
# Debug Mode (Auto-intercept, auto-cache, auto-dedup)
NODE_ENV=development node --require @shuangwhywhy/quota-guard/register app.js

# Production Mode (Bypass everything)
NODE_ENV=production node app.js
```

### 2. Node.js (Backend — ESM)

If your project uses ES Modules (`"type": "module"` in `package.json`), use `--import` instead:

```bash
# ESM Debug Mode
NODE_ENV=development node --import @shuangwhywhy/quota-guard/register app.js
```

In your `package.json`:
```json
{
  "scripts": {
    "dev": "NODE_ENV=development node --import @shuangwhywhy/quota-guard/register src/server.js",
    "start": "NODE_ENV=production node src/server.js"
  }
}
```

### 3. Vite (Frontend)

If you are using React / Vue / Vite, simply add the plugin. It ONLY injects during development builds.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { quotaGuardPlugin } from '@shuangwhywhy/quota-guard/vite';

export default defineConfig({
  plugins: [
    quotaGuardPlugin()
  ]
});
```

### 4. Axios Support

For Axios users, especially in projects where you want a safe, non-intrusive integration, we provide a dedicated hook that enforces the `fetch` adapter:

```typescript
import axios from 'axios';
import { hookAxios } from '@shuangwhywhy/quota-guard/axios';

const myAxios = axios.create();
hookAxios(myAxios); // Now this instance is guarded!
```

### 5. Verification: Is It Working?
Once injected, Quota Guard provides several clear signals to confirm it is active:

- **Startup Banner**: You will see a visual banner in your terminal during initialization:
  ```text
  ┌───────────────────────────────────────┐
  │ [Quota Guard] v1.8.0 READY            │
  │ Mode: Development (Guarded)           │
  └───────────────────────────────────────┘
  ```
- **Response Headers**: Check the **Network Tab** (Browser) or response object (Node). All intercepted requests will have an `X-Quota-Guard` header:
    - `HIT`: Served from cache.
    - `SHARED`: Joined an existing live request (deduplicated).
    - `LIVE`: Validated AI call passed to the network.
- **Audit Console**: Pass an `auditHandler` to see every event in real-time:
  ```typescript
  injectQuotaGuard({
    auditHandler: (e) => console.log(`[Guard] ${e.type} -> ${e.key.slice(0, 8)}`)
  });
  ```

### 6. Troubleshooting
If you don't see the expected behavior, check these common causes:

#### No Startup Banner
- **Node**: Ensure you are using `--require` (CJS) or `--import` (ESM) with the correct package path: `@shuangwhywhy/quota-guard/register`.
- **Vite**: Ensure the `quotaGuardPlugin()` is added to your `vite.config.ts`.

#### No `X-Quota-Guard` Headers
- **Matching**: Verify the request URL matches one of the `aiEndpoints` (default: most major LLM providers).
- **Environment**: By default, the guard only activates if `NODE_ENV` is NOT `production`. Ensure your dev environment sets `NODE_ENV=development`.

#### Always `LIVE` (No Cache Hits)
- **Key Conflict**: Check the terminal for `[FINGERPRINT_COLLISION]` warnings. This happens if you change a semantic field like `model` or `messages`.
- **Logic**: By default, parameters like `temperature` are ignored. If you NEED them to invalidate the cache, add them to `intelligentFields` in your config.

#### 599 Errors (Circuit Breaker)
- This means a request failed repeatedly (default: 3 times). Use `X-Quota-Guard-Bypass: true` to force a retry once you've fixed the upstream issue.

## Advanced Configuration
...
```typescript
injectQuotaGuard({
  enabled: process.env.NODE_ENV === 'development',
  cacheTtlMs: 1000 * 60 * 60,   // 1 hour
  debounceMs: 300,               // 300ms aggregation window (default)
  inFlightTimeoutMs: 60000,      // Max wait for shared requests (default: 60s)
  breakerMaxFailures: 3,
  globalBreakerMaxFailures: 10,   // Process-wide safety net
  intelligentFields: ['model', 'messages', 'prompt', 'system', 'contents', 'message', 'response_format'], 
  aiEndpoints: [/api\.my-custom-llm\.com/, 'other-provider.com'], // Supports String or RegExp
  auditHandler: (event) => console.log('Quota Guard Event:', event.type, event.key)
});
```

### Audit Event Types
...

| Event Type | Description |
| :--- | :--- |
| `request_started` | Interceptor detected a matching AI request. |
| `debounced` | Request held in the aggregation window. |
| `cache_hit` | Returned a previously cached response. |
| `live_called` | No cache/dedup found, calling native network. |
| `in_flight_shared` | Multiple calls detected; joined an existing live stream. |
| `breaker_opened` | Circuit breaker active for this key; request blocked. |
| `global_breaker_opened` | Safety threshold reached across different requests; all blocked. |
| `request_failed` | Native request returned non-OK status. |
| `request_aborted` | Native request was cancelled by the user. |
| `pass_through` | Request didn't match any AI endpoints or encountered an error. |

## How It Works
- **Network Coverage**: Powered by `@mswjs/interceptors`. It covers `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` modules natively across both Node and Browser environments.
- **Real-time Streaming**: Uses a custom `ResponseBroadcaster` to "tee" live AI streams. Even if multiple requests are deduplicated, every caller receives the stream chunks simultaneously in real-time.
- **Provider Intelligence**: Auto-detects major AI providers to extract exact semantic fields for hashing. Supported natively:
    - **OpenAI** (and OpenAI-compatible proxies)
    - **Anthropic**
    - **Google Gemini**
    - **DeepSeek**
    - **Mistral**
    - **Cohere**
- **Safe Bypass**: Use the special internal header `X-Quota-Guard-Bypass: true` to force a live call.
    - **Note on Guard Priority**: To protect your budget, standard business-level headers like `Cache-Control: no-cache` are **ignored** by default if a cached response exists. To bypass this, use the internal header above or configure a specific `rule` in your settings.
...

