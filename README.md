# Quota Guard

A 100% zero-intrusive AI Call Guard and debug cost-saving kernel for Model invocations.

## Why Quota Guard?
During development, UI re-renders, automatic effects, and repetitive debugging sessions can cause hundreds of identical LLM API calls. This leads to blown budgets, rate-limiting (`429 Too Many Requests`), and slow DX.

Quota Guard seamlessly intercepts **all** network calls — including `globalThis.fetch` and Node.js native `http`/`https` modules — specifically bound for AI endpoints. Without writing a **single line of wrapper code in your business logic**, it provides:

1. **In-Flight Deduplication**: Share the exact same network promise for identical parallel requests.
2. **Request Aggregation (Debounce)**: rapid-fire requests are held and released simultaneously to maximize deduplication (default: 300ms).
3. **Debug Caching**: Eliminates cost for identical prompts across a dev session.
4. **Circuit Breaker**: Stops runaway loops from nuking your API keys by failing short after a threshold.
5. **Zero-Hardcoding**: Injected strictly via Node `--require`/`--import` or Vite plugins, leaving your production bundle untouched.
6. **Intelligent Cache Keys**: Strips noisy parameters (`temperature`, `stream`, etc.) for higher cache hit rates.

## Usage

### 1. Node.js (Backend — CommonJS)

Run your app with Quota Guard injected natively using standard Node flags. No code imports required!

```bash
# Debug Mode (Auto-intercept, auto-cache, auto-dedup)
NODE_ENV=development node --require quota-guard/register app.js

# Production Mode (Bypass everything)
NODE_ENV=production node app.js
```

### 2. Node.js (Backend — ESM)

If your project uses ES Modules (`"type": "module"` in `package.json`), use `--import` instead:

```bash
# ESM Debug Mode
NODE_ENV=development node --import quota-guard/register app.js
```

In your `package.json`:
```json
{
  "scripts": {
    "dev": "NODE_ENV=development node --import quota-guard/register src/server.js",
    "start": "NODE_ENV=production node src/server.js"
  }
}
```

### 3. Vite (Frontend)

If you are using React / Vue / Vite, simply add the plugin. It ONLY injects during development builds.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { quotaGuardPlugin } from 'quota-guard/vite';

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
import { hookAxios } from 'quota-guard/axios';

const myAxios = axios.create();
hookAxios(myAxios); // Now this instance is guarded!
```

### 5. Native Native Interception
Quota Guard is designed to be zero-intrusion. Once injected via the Node register or Vite plugin, it automatically covers `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` modules without any configuration for specific SDKs.

## Advanced Configuration
...
```typescript
injectQuotaGuard({
  enabled: process.env.NODE_ENV === 'development',
  cacheTtlMs: 1000 * 60 * 60, // 1 hour
  debounceMs: 300,             // 300ms aggregation window (default)
  breakerMaxFailures: 3,
  cacheKeyStrategy: 'intelligent', // or 'exact', or a custom function
  intelligentFields: ['model', 'messages', 'prompt'], // Customize intelligent hashing
  aiEndpoints: [/api\.my-custom-llm\.com/, 'other-provider.com'], // Supports String or RegExp
  auditHandler: (event) => console.log('Quota Guard Event:', event.type, event.key)
});
```

### Audit Event Types

| Event Type | Description |
| :--- | :--- |
| `cache_hit` | Returned a previously cached response. |
| `live_called` | No cache/dedup found, calling native network. |
| `in_flight_shared` | Multiple calls detected; joined an existing live stream. |
| `breaker_opened` | Circuit breaker active for this key; request blocked. |
| `request_failed` | Native request returned non-OK status. |
| `pass_through` | Request didn't match any AI endpoints or encountered an error. |

## How It Works
- **Network Coverage**: Powered by `@mswjs/interceptors`. It covers `fetch`, `XMLHttpRequest`, and Node.js `http`/`https` modules natively across both Node and Browser environments.
- **Real-time Streaming**: Uses a custom `ResponseBroadcaster` to "tee" live AI streams. Even if multiple requests are deduplicated, every caller receives the stream chunks simultaneously in real-time.
- **Provider Intelligence**: Auto-detects major AI providers (OpenAI, Anthropic, Gemini, DeepSeek) to extract exact semantic fields for hashing, ensuring `temperature` or `stream: true` flags don't break your cache.
...

