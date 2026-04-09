# Quota Guard

A 100% zero-intrusive AI Call Guard and debug cost-saving kernel for Model invocations.

## Why Quota Guard?
During development, UI re-renders, automatic effects, and repetitive debugging sessions can cause hundreds of identical LLM API calls. This leads to blown budgets, rate-limiting (`429 Too Many Requests`), and slow DX.

Quota Guard seamlessly intercepts **all** network calls — including `globalThis.fetch` and Node.js native `http`/`https` modules — specifically bound for AI endpoints. Without writing a **single line of wrapper code in your business logic**, it provides:

1. **In-Flight Deduplication**: Share the exact same network promise for identical parallel requests.
2. **Debounce**: Unintentional rapid-fires are cleanly throttled (default: 300ms).
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

### 4. Native SDK Support

Since Quota Guard operates on `globalThis.fetch` and Node.js `http`/`https` (via `@mswjs/interceptors`), you can continue using standard libraries untouched:

```typescript
// Any file in your app! No need to import quota-guard here.
import { OpenAI } from 'openai';

const openai = new OpenAI();
const result = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Say hello!' }] // In dev mode, the second identical call is free & instant!
});
```

## Supported AI Providers (Auto-detected)
- `api.openai.com`
- `api.anthropic.com`
- `api.deepseek.com`
- `generativelanguage.googleapis.com` (Gemini)
- `api.cohere.ai`
- `api.mistral.ai`

## Advanced Configuration
If you want to manually configure endpoints, cache TTL, or attach an audit logger, you can initialize Quota Guard explicitly at the top of your `main.ts`:

```typescript
import { injectQuotaGuard } from 'quota-guard';

injectQuotaGuard({
  enabled: process.env.NODE_ENV === 'development',
  cacheTtlMs: 1000 * 60 * 60, // 1 hour
  debounceMs: 300,             // 300ms debounce window (default)
  breakerMaxFailures: 3,
  cacheKeyStrategy: 'intelligent', // or 'exact', or a custom function
  aiEndpoints: ['api.my-custom-llm.com'],
  auditHandler: (event) => console.log('Quota Guard Event:', event.type, event.key)
});
```

### Cache Key Strategies

| Strategy       | Description                                                                 |
|----------------|-----------------------------------------------------------------------------|
| `'intelligent'`| **(Default)** Extracts only semantic fields (`model`, `messages`, `prompt`, `system`, `contents`, `message`) for hashing. Ignores noise like `temperature`, `stream`, `metadata`. |
| `'exact'`      | Hashes the full request body as-is. Lower cache hit rate but precise.       |
| `(url, method, body) => ...` | Custom function returning the object to hash. Full control. |

## How It Works
- **Keys**: Hashes `METHOD` + `URL` + `BODY` (filtered by configurable cache key strategy).
- **Network Coverage**: Intercepts both `fetch` and Node.js `http`/`https` via `@mswjs/interceptors` in Node.js environments. Falls back to pure `fetch` proxy in browsers.
- **Response Handling**: The native response buffer is sliced securely so multiple cloned requests inside your framework all think they received a dedicated stream.
- **Debounce**: Groups identical rapid-fire requests within a configurable time window (default 300ms) and merges them into a single network call. All callers receive the same response — no `AbortError` thrown.
- **Fail-safe**: If it crashes, it falls back to native transparent `fetch`/`http`.
- **Memory Management**: Stale cache entries are automatically swept via a passive garbage collector triggered after every N operations, preventing memory leaks without background timers.
