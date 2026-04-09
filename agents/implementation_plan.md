# Quota Guard Middleware Implementation Plan

## Goal Description
Develop `quota-guard`, a platform-agnostic, model-agnostic, and framework-agnostic middleware for AI model invocations. It operates as an infrastructure layer to provide safety, cost-control, and auditing. The core capabilities included in this v1 release are:

- **Unified Entry Point**: A single method to handle all real AI model requests.
- **Stable Key Normalization**: Consistent identifiers based on provider, model, scenario, and inputs.
- **Debug Cache**: Immediate cost-saving in dev/debug by returning cached results after the first live hit, 100% seamlessly managed.
- **In-flight Deduplication**: Multiple simultaneous requests for the same key share the same underlying Promise.
- **Debounce**: Unintentional UI/effect loops and rapid triggers are throttled before hitting the live service.
- **Circuit Breaker**: Stops live calls based on failure metrics/quotas to prevent cascading failures.
- **Concurrency & Channel Control**: Central management of concurrent requests.
- **Audit & Event System**: Emits standard hooks for every part of the lifecycle.

## Proposed Changes

We will build an NPM-ready package located at `/Users/yizhouqiang/MyProjects/AI/quota-guard`.

### Project Layout
- **[NEW] `package.json` & `tsconfig.json` & `tsup.config.ts`**: Standard configs for an ESM + CommonJS TypeScript library.
- **[NEW] `README.md`**: Guide for usage and strict bounds on what the middleware covers.
- **[NEW] `src/`**: All core middleware code.
- **[NEW] `tests/`**: Vitest or Jest based test suite.
- **[NEW] `examples/`**: Node.js and Browser examples.

### Architecture & Core Modules (`src/`)

- **`core/QuotaGuard.ts`**: A singleton or isolated instance orchestrator. Zero configuration required from business logic.
- **`keys/KeyNormalizer.ts`**: Takes `RequestContext` and guarantees a deterministic hash/string.
- **`cache/`**: Interfaces (`ICache`) and `MemoryCache`. Completely hidden from the business layer.
- **`inFlight/InFlightRegistry.ts`**: Map of active Promises keyed by the stable `KeyNormalizer` output.
- **`debounce/DebounceController.ts`**: Configured via infrastructure, totally transparent to the business caller.
- **`breaker/CircuitBreaker.ts`**: Halts runaway requests.
- **`audit/AuditLogger.ts`**: Standardized event emitter.
- **`policy/EnvPolicy.ts`**: Automatically detects `debug`/`local` vs `prod` based on environment variables or global hints. Applies policies transparently.
- **`index.ts`**: Exports the clean, unified API for business code, and separate infrastructure setup methods.

### Public API Surface (100% Non-Intrusive, Zero-Config, Build-time Injection)

As per your strict requirement for **zero intrusion and zero hardcoding**, `quota-guard` provides smart default configurations and is injected entirely via build tools or runtime flags (like APM tools). 

**1. Zero Hardcoding Injection**
You do **not** write `import 'quota-guard'` in your app code.

*For Node.js / Server environments*:
Use standard Node pre-loading in your `package.json` debug scripts. Production scripts omit it.
```json
{
  "scripts": {
    "dev": "NODE_ENV=development node --require quota-guard/register src/main.js",
    "start": "NODE_ENV=production node src/main.js" 
  }
}
```

*For Frontend / Bundler environments (e.g. Vite)*:
We provide a Vite/Webpack plugin that automatically injects the hook *only* when building for development. Production builds will physically exclude the `quota-guard` code.
```typescript
// vite.config.ts
import { quotaGuardPlugin } from 'quota-guard/vite';

export default defineConfig({
  plugins: [
    quotaGuardPlugin() // Auto-detects mode. Injects only in 'development'.
  ]
});
```

**2. Smart Defaults (Auto-Adaptive)**
The interceptor comes pre-loaded with a comprehensive default list of AI provider endpoints (`api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.deepseek.com`, etc.). You don't need to pass any configuration unless you want to override the smart defaults.

**3. Existing Business Code (No Changes Needed at All)**
Your existing React components, Node services, and bare SDK scripts magically inherit debounce, cache, in-flight sharing, and circuit breaker.

```typescript
// src/business/AnyFile.ts
// Just regular OpenAI SDK or fetch. Quota Guard catches the underlying network call natively.
import { OpenAI } from 'openai'; // or straight `fetch` calls

const openai = new OpenAI();
// In debug mode, this native call is silently protected by Quota Guard's network-level hook.
const result = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }]
});
```

### How the core mechanisms work globally
1. **Stable Key via Payload**: Since we don't have explicit `scenario` tags in the business code, the key normalizer hashes the **Target Endpoint + Model Parameters + Normalized Message Body/Prompt**.
2. **Debounce + In-flight**: When native `fetch` is triggered, Quota Guard hashes the payload. If an identical hash is currently resolving, it returns a clone of the original Promise. If called excessively, the intercepted request is debounced.
3. **Environment Isolation**: The global interceptor behaves conditionally. Production pass-through ensures no debug artifacts leak. 

## User Review Required

> [!IMPORTANT]
> - By hooking at the native `fetch` / `http` boundary, the `KeyNormalizer` will use the URL and JSON request body to uniquely identify requests instead of explicit `scenario` strings. Is this exactly the "100% transparent and non-intrusive hook" behavior you wanted?
> - Let me know if you approve this **Zero-intrusive hook approach** and I will start coding `src/`.

## Verification Plan

### Automated Tests (`npm run test`)
- Write tests confirming:
  - Intercepting standard `fetch` without modifying the caller's code.
  - Native duplicated `fetch` calls sharing a single intercepted `Promise`.
  - Cache hits bypassing the network socket entirely.

### Manual Verification
- Will build the package via `tsup`.
- Will demonstrate in an example that a standard `OpenAI` client gets securely intercepted.
